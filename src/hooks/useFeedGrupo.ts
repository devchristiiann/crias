import { useInfiniteQuery } from '@tanstack/react-query'
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
    queryKey: ['grupo', grupoId, 'feed', chave],
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
