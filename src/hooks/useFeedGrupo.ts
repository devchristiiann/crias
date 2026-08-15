import { useInfiniteQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { assinarEmLote } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

/**
 * Tamanho da pagina do feed. Pequeno de proposito: o custo real nao e a linha
 * do banco, e a foto que cada linha carrega. Oito cabem em pouco mais de uma
 * tela de celular, e o resto so e buscado se a pessoa rolar ate la.
 */
const PAGINA = 8

/**
 * Validade da URL assinada da foto. Mesma janela curta da capa do grupo: o
 * bucket e privado e o link vale para quem estiver com ele em maos.
 */
const SEGUNDOS_URL_FOTO = 600

/**
 * Entrega da comprovacao. A mesma URL serve o cartao (`h-44`, largura da
 * coluna) e a abertura em tela cheia, entao ela acompanha a coluna numa tela de
 * 2x em vez do recorte do cartao: assinar duas versoes dobraria as chamadas
 * para ganhar nitidez num toque que quase ninguem da.
 */
const FOTO_FEED = { largura: 960, qualidade: 70 }

/**
 * O que o feed mostra: toda ocorrencia com `feito_em`, e mais nada.
 *
 * A regra era uma lista branca de status, e ela nao cabia mais. Rotina de
 * janela ("N vezes por semana") fica `pendente` ate a ultima marcacao, entao
 * quatro das cinco idas a academia sumiam do grupo, e num grupo que exige foto
 * isso e perder a comprovacao. `feito_em` e o instante de publicacao: quem tem,
 * esta no feed; quem nao tem (check-in desfeito, declaracao reprovada), sai.
 * Enquete resolvida guarda o `feito_em` da declaracao, e e isso que impede o
 * post de saltar para o topo um dia depois.
 */

export interface ItemFeed {
  id: string
  usuarioId: string
  habitId: string
  feitoEm: string
  /** URL assinada da foto do check-in. Null quando o check-in nao teve foto. */
  fotoUrl: string | null
  /** `feito` quando ja valeu, `em_validacao` enquanto o grupo vota. */
  status: string
  /** Marcacoes ja feitas e alvo do periodo. Com alvo maior que 1 o cartao diz o progresso. */
  vezesFeitas: number
  vezesAlvo: number
  /** Minutos declarados. Null fora do modulo de duracao. */
  minutos: number | null
  /** Instante em que a enquete fecha. Null fora de `em_validacao`. */
  validacaoAte: string | null
  /** Ids de quem validou e de quem contestou. O voto e aberto por decisao do dono. */
  aFavor: string[]
  contra: string[]
}

interface PaginaFeed {
  itens: ItemFeed[]
  /** Instante do ultimo item da pagina. Null quando nao ha mais o que buscar. */
  proximoCursor: string | null
}

/** O cache do feed inteiro, com as paginas que a pessoa ja rolou. */
type DadosFeed = InfiniteData<PaginaFeed, string | null>

/** Linha de `occurrences` como o Realtime entrega, sem nada garantido. */
export interface LinhaAoVivo {
  id?: string
  user_id?: string
  habit_id?: string
  status?: string
  feito_em?: string | null
  foto_path?: string | null
  minutos_declarados?: number | null
  validacao_ate?: string | null
  vezes_feitas?: number | null
  vezes_alvo?: number | null
}

/** Chave da consulta do feed. Uma so, para o hook e para quem escreve nele. */
function chaveDoFeed(grupoId: string | undefined, chave: string) {
  return ['grupo', grupoId, 'feed', chave]
}

/** Prefixo que casa com o feed de qualquer combinacao de desafios do grupo. */
function prefixoDoFeed(grupoId: string) {
  return ['grupo', grupoId, 'feed']
}

const COLUNAS =
  'id, user_id, habit_id, feito_em, foto_path, status, minutos_declarados, validacao_ate, vezes_feitas, vezes_alvo'

interface LinhaFeed {
  id: string
  user_id: string
  habit_id: string
  feito_em: string
  foto_path: string | null
  status: string
  minutos_declarados: number | null
  validacao_ate: string | null
  vezes_feitas: number
  vezes_alvo: number
}

interface Placar {
  aFavor: string[]
  contra: string[]
}

/**
 * Placar das enquetes abertas desta pagina.
 *
 * Uma consulta so, e apenas quando a pagina traz declaracao em validacao: no
 * feed antigo, que e o caso comum, ela nem sai. O nome de quem votou nao vem
 * daqui, os membros ja chegaram em `useGrupo`.
 */
async function votosDas(linhas: LinhaFeed[]): Promise<Map<string, Placar>> {
  const placar = new Map<string, Placar>()
  const abertas = linhas.filter((l) => l.status === 'em_validacao').map((l) => l.id)
  if (abertas.length === 0) return placar

  const { data, error } = await supabase
    .from('votos_validacao')
    .select('occurrence_id, user_id, aprova')
    .in('occurrence_id', abertas)
  // Falhar em silencio aqui mostraria placar zerado numa enquete que ja tem
  // voto, e a pessoa votaria de novo achando que o toque anterior se perdeu.
  if (error) throw error

  for (const voto of (data ?? []) as { occurrence_id: string; user_id: string; aprova: boolean }[]) {
    const dela = placar.get(voto.occurrence_id) ?? { aFavor: [], contra: [] }
    ;(voto.aprova ? dela.aFavor : dela.contra).push(voto.user_id)
    placar.set(voto.occurrence_id, dela)
  }
  return placar
}

function montarItem(linha: LinhaFeed, fotoUrl: string | null, placar: Placar | undefined): ItemFeed {
  return {
    id: linha.id,
    usuarioId: linha.user_id,
    habitId: linha.habit_id,
    feitoEm: linha.feito_em,
    fotoUrl,
    status: linha.status,
    vezesFeitas: linha.vezes_feitas,
    vezesAlvo: linha.vezes_alvo,
    minutos: linha.minutos_declarados,
    validacaoAte: linha.validacao_ate,
    aFavor: placar?.aFavor ?? [],
    contra: placar?.contra ?? [],
  }
}

/**
 * Feed de conclusoes do grupo, do mais recente para o mais antigo.
 *
 * Pagina por cursor, nao por deslocamento: `offset` reescreve a fronteira toda
 * vez que alguem conclui um desafio enquanto a pessoa rola, e o item da virada
 * aparece duas vezes ou some. Com o cursor no `feito_em` do ultimo item, cada
 * pagina continua exatamente de onde a anterior parou.
 *
 * ponytail: dois check-ins no mesmo microssegundo fariam o segundo ser pulado
 * pelo `lt`. Sao transacoes separadas, cada uma com sua leitura de relogio, e o
 * desempate exigiria comparar o par (feito_em, id) numa condicao composta.
 */
export function useFeedGrupo(grupoId: string | undefined, habitIds: string[]) {
  // A lista chega como array novo a cada render. A chave estavel e o que impede
  // a consulta inteira de ser descartada e refeita sem nada ter mudado.
  const chave = habitIds.join(',')

  return useInfiniteQuery({
    queryKey: chaveDoFeed(grupoId, chave),
    enabled: Boolean(grupoId) && chave !== '',
    initialPageParam: null as string | null,
    getNextPageParam: (ultima: PaginaFeed) => ultima.proximoCursor,
    queryFn: async ({ pageParam }): Promise<PaginaFeed> => {
      let consulta = supabase
        .from('occurrences')
        .select(COLUNAS)
        .in('habit_id', chave.split(','))
        .not('feito_em', 'is', null)
        .order('feito_em', { ascending: false })
        // Desempate obrigatorio: sem ele, duas linhas com o mesmo instante
        // trocam de lugar entre uma busca e outra e a mesma pode cair em duas
        // paginas, virando chave repetida na lista.
        .order('id', { ascending: false })
        .limit(PAGINA)
      if (pageParam) consulta = consulta.lt('feito_em', pageParam)

      const { data, error } = await consulta
      if (error) throw error

      const linhas = (data ?? []) as LinhaFeed[]
      // As duas nao dependem uma da outra: em cascata a pagina esperaria a
      // assinatura das fotos antes de sequer pedir o placar.
      const [fotos, placares] = await Promise.all([
        assinarEmLote(
          'checkins',
          linhas.map((l) => l.foto_path).filter((c): c is string => Boolean(c)),
          SEGUNDOS_URL_FOTO,
          FOTO_FEED,
        ),
        votosDas(linhas),
      ])

      return {
        itens: linhas.map((l) =>
          montarItem(l, (l.foto_path && fotos.get(l.foto_path)) || null, placares.get(l.id)),
        ),
        // Pagina incompleta significa que o banco ja devolveu tudo que tinha.
        proximoCursor: linhas.length === PAGINA ? linhas[linhas.length - 1].feito_em : null,
      }
    },
  })
}

/**
 * Poe no feed, na mao, o check-in que acabou de chegar pelo Realtime.
 *
 * Invalidar era o caminho obvio e o errado: numa consulta infinita ele refaz
 * TODAS as paginas ja carregadas, entao quem rolou o feed pagava uma consulta
 * por pagina a cada check-in de colega. Nao invalidar era pior ainda: o feed
 * parava de mostrar check-in de colega justamente para quem rolou, que e o
 * coracao social do app. Com o registro em maos nao ha o que consultar: ele
 * entra na frente da primeira pagina, que e onde o mais recente mora, e o
 * cursor de cada pagina nao muda porque ele nasce do ULTIMO item dela.
 *
 * Declaracao em validacao chega por aqui pelo mesmo evento, e enquete resolvida
 * tambem: por isso o item ja existente e SUBSTITUIDO no lugar, e nao ignorado
 * como repetido. Ignorar deixaria o post preso em "aguardando o grupo" para
 * quem esta com a tela aberta, e mover para o topo republicaria um post velho.
 * Quando o `feito_em` MUDA a historia e outra: e marcacao nova de rotina de
 * janela, publicacao nova, e ela vai para o topo. Deixar no lugar prenderia a
 * segunda ida a academia na posicao da primeira.
 *
 * Desfazer o check-in chega aqui pelo mesmo caminho, como UPDATE que zera o
 * `feito_em`. Sem esse ramo a comprovacao desfeita, ou a declaracao reprovada,
 * ficaria no feed ate a proxima busca.
 */
export async function aplicarNoFeed(
  cliente: QueryClient,
  grupoId: string,
  chave: string,
  linha: LinhaAoVivo,
) {
  const chaveConsulta = chaveDoFeed(grupoId, chave)
  const { id, user_id: usuarioId, habit_id: habitId, feito_em: feitoEm, foto_path: foto } = linha
  const status = linha.status ?? ''
  // Feed que ninguem abriu nao tem o que atualizar: a primeira busca ja traz
  // este check-in.
  if (!id || !cliente.getQueryData<DadosFeed>(chaveConsulta)) return

  if (!feitoEm) {
    cliente.setQueryData<DadosFeed>(chaveConsulta, (dados) =>
      dados && {
        ...dados,
        pages: dados.pages.map((p) => ({ ...p, itens: p.itens.filter((i) => i.id !== id) })),
      },
    )
    return
  }

  if (!usuarioId || !habitId) return

  const fotos = await assinarEmLote(
    'checkins',
    foto ? [foto] : [],
    SEGUNDOS_URL_FOTO,
    FOTO_FEED,
  )

  cliente.setQueryData<DadosFeed>(chaveConsulta, (dados) => {
    if (!dados || dados.pages.length === 0) return dados
    // A busca pelo item fica aqui dentro, e nao antes de assinar a foto: entre
    // uma coisa e outra houve uma ida de rede, e o mesmo registro pode ter
    // chegado por outro caminho.
    const anterior = dados.pages.flatMap((p) => p.itens).find((i) => i.id === id)

    const item = montarItem(
      {
        id,
        user_id: usuarioId,
        habit_id: habitId,
        feito_em: feitoEm,
        foto_path: foto ?? null,
        status,
        minutos_declarados: linha.minutos_declarados ?? null,
        validacao_ate: linha.validacao_ate ?? null,
        // O Realtime pode entregar a linha sem as colunas de contagem. Cair em
        // 0 de 1 desenharia "fez 0 de 1", entao o padrao e o cartao simples.
        vezes_feitas: linha.vezes_feitas ?? 1,
        vezes_alvo: linha.vezes_alvo ?? 1,
      },
      (foto && fotos.get(foto)) || null,
      // O voto vive em outra tabela e nao viaja neste evento. Declaracao que
      // acaba de sair nasce sem voto nenhum, e a que ja estava na tela mantem o
      // placar que a pessoa esta vendo.
      anterior,
    )

    if (anterior && anterior.feitoEm === feitoEm) {
      return {
        ...dados,
        pages: dados.pages.map((p) => ({
          ...p,
          itens: p.itens.map((i) => (i.id === id ? item : i)),
        })),
      }
    }
    // Publicacao nova. O filtro e no-op quando o item ainda nao estava no feed,
    // e tira a versao antiga quando o `feito_em` avancou: sem ele o cartao
    // apareceria duas vezes, com a mesma chave.
    const [primeira, ...resto] = dados.pages.map((p) => ({
      ...p,
      itens: p.itens.filter((i) => i.id !== id),
    }))
    return { ...dados, pages: [{ ...primeira, itens: [item, ...primeira.itens] }, ...resto] }
  })
}

/** Troca um item do feed em todas as paginas, ou o tira quando `muda` da null. */
function escreverNoFeed(
  cliente: QueryClient,
  grupoId: string,
  occ: string,
  muda: (item: ItemFeed) => ItemFeed | null,
) {
  // Por prefixo porque quem vota nao conhece a combinacao de desafios que
  // nomeia a consulta. Escrever nao e invalidar: nenhuma pagina e refeita.
  cliente.setQueriesData<DadosFeed>({ queryKey: prefixoDoFeed(grupoId) }, (dados) =>
    dados && {
      ...dados,
      pages: dados.pages.map((p) => ({
        ...p,
        itens: p.itens.flatMap((i) => {
          if (i.id !== occ) return [i]
          const novo = muda(i)
          return novo ? [novo] : []
        }),
      })),
    },
  )
}

/**
 * Reflete no feed o voto que a pessoa acabou de dar.
 *
 * Enquanto a enquete segue aberta so o placar muda, e ele e escrito na mao: a
 * unica novidade e o proprio voto de quem tocou. Quando o voto fecha a enquete,
 * quem decide entre aprovada e reprovada e o servidor, entao a linha e RELIDA
 * em vez de deduzida do placar. Uma linha, e nao a consulta inteira: invalidar
 * o feed refaria todas as paginas ja roladas, com todas as fotos reassinadas.
 */
export async function aplicarVotoNoFeed(
  cliente: QueryClient,
  grupoId: string,
  occ: string,
  usuarioId: string,
  aprova: boolean,
  resolvida: boolean,
) {
  if (!resolvida) {
    escreverNoFeed(cliente, grupoId, occ, (item) => ({
      ...item,
      // Trocar o voto substitui o anterior, igual a RPC: sai dos dois lados
      // antes de entrar no escolhido.
      aFavor: item.aFavor.filter((id) => id !== usuarioId).concat(aprova ? [usuarioId] : []),
      contra: item.contra.filter((id) => id !== usuarioId).concat(aprova ? [] : [usuarioId]),
    }))
    return
  }

  const { data, error } = await supabase
    .from('occurrences')
    .select(COLUNAS)
    .eq('id', occ)
    .maybeSingle()
  // Sem a linha nova nao da para dizer se aprovou: deixar o post como estava e
  // melhor que afirmar um resultado que nao veio do servidor.
  if (error || !data) return

  const linha = data as LinhaFeed
  escreverNoFeed(cliente, grupoId, occ, (item) =>
    linha.feito_em ? montarItem(linha, item.fotoUrl, undefined) : null,
  )
}

/**
 * Reflete no feed o voto de outra pessoa, entregue pelo Realtime.
 *
 * O feed nunca e invalidado, entao sem isto quem esta com a tela do grupo
 * aberta via "Validado 0" enquanto os colegas votavam, ate fechar e voltar.
 *
 * Reusa `aplicarVotoNoFeed` com `resolvida` em false, e nao por descuido: o
 * evento de `votos_validacao` nao diz se a enquete fechou, e quem conta isso e o
 * UPDATE de `occurrences`, ja assinado no mesmo canal. Deduzir resolucao a partir
 * do placar poria na tela um resultado que o servidor nunca deu.
 *
 * Reaplicar o voto que a propria pessoa acabou de dar e inofensivo: o placar sai
 * dos dois lados antes de entrar no escolhido. E voto de outro grupo nao acha
 * item nenhum com aquele id no cache deste feed, entao vira operacao vazia.
 */
export function aplicarVotoDeOutroNoFeed(
  cliente: QueryClient,
  grupoId: string,
  occ: string,
  usuarioId: string,
  aprova: boolean,
) {
  void aplicarVotoNoFeed(cliente, grupoId, occ, usuarioId, aprova, false)
}
