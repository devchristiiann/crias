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

export interface ItemFeed {
  id: string
  usuarioId: string
  habitId: string
  feitoEm: string
  /** URL assinada da foto do check-in. Null quando o check-in nao teve foto. */
  fotoUrl: string | null
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
}

/** Chave da consulta do feed. Uma so, para o hook e para quem escreve nele. */
function chaveDoFeed(grupoId: string | undefined, chave: string) {
  return ['grupo', grupoId, 'feed', chave]
}

interface LinhaFeed {
  id: string
  user_id: string
  habit_id: string
  feito_em: string
  foto_path: string | null
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
        .select('id, user_id, habit_id, feito_em, foto_path')
        .in('habit_id', chave.split(','))
        .eq('status', 'feito')
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
      const fotos = await assinarEmLote(
        'checkins',
        linhas.map((l) => l.foto_path).filter((c): c is string => Boolean(c)),
        SEGUNDOS_URL_FOTO,
        FOTO_FEED,
      )

      return {
        itens: linhas.map((l) => ({
          id: l.id,
          usuarioId: l.user_id,
          habitId: l.habit_id,
          feitoEm: l.feito_em,
          fotoUrl: (l.foto_path && fotos.get(l.foto_path)) || null,
        })),
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
 * Desfazer o check-in chega aqui pelo mesmo caminho, como UPDATE que sai de
 * `feito`. Sem esse ramo a comprovacao desfeita ficaria no feed de quem esta
 * com a tela aberta ate a proxima busca.
 */
export async function aplicarNoFeed(
  cliente: QueryClient,
  grupoId: string,
  chave: string,
  linha: LinhaAoVivo,
) {
  const chaveConsulta = chaveDoFeed(grupoId, chave)
  const { id, user_id: usuarioId, habit_id: habitId, feito_em: feitoEm, foto_path: foto } = linha
  // Feed que ninguem abriu nao tem o que atualizar: a primeira busca ja traz
  // este check-in.
  if (!id || !cliente.getQueryData<DadosFeed>(chaveConsulta)) return

  if (linha.status !== 'feito' || !feitoEm) {
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
    // A conferencia fica aqui dentro, e nao antes de assinar a foto: entre uma
    // coisa e outra houve uma ida de rede, e o mesmo check-in pode ter chegado
    // por outro caminho. Id repetido faz o React desenhar cartao a menos.
    if (dados.pages.some((p) => p.itens.some((i) => i.id === id))) return dados

    const item: ItemFeed = {
      id,
      usuarioId,
      habitId,
      feitoEm,
      fotoUrl: (foto && fotos.get(foto)) || null,
    }
    const [primeira, ...resto] = dados.pages
    return { ...dados, pages: [{ ...primeira, itens: [item, ...primeira.itens] }, ...resto] }
  })
}
