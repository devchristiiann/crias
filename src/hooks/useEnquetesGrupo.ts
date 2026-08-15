import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { aplicarVotoNoFeed } from '@/hooks/useFeedGrupo'
import { supabase } from '@/lib/supabase'

export interface Enquete {
  /** Id da ocorrencia em validacao. E ele que a RPC recebe. */
  id: string
  /** Ids de quem validou e de quem contestou. O voto e aberto por decisao do dono. */
  aFavor: string[]
  contra: string[]
}

interface LinhaVoto {
  occurrence_id: string
  user_id: string
  aprova: boolean
}

/**
 * Enquetes abertas do grupo, so com o placar de cada uma.
 *
 * A lista do grupo nao usa mais este hook: a enquete virou post do feed, e quem
 * traz o placar de la e o proprio `useFeedGrupo`. O que sobrou aqui e a folha
 * do desafio na tela Hoje, que precisa saber se a declaracao ja tem voto para
 * decidir se ainda da para desfazer, e pergunta por um desafio so.
 *
 * Sem paginacao de proposito: so existe enquete aberta enquanto o prazo de 24h
 * corre, e a resolucao tira a ocorrencia de `em_validacao`. A lista se esvazia
 * sozinha, entao ela e curta por construcao.
 */
export function useEnquetesGrupo(grupoId: string | undefined, habitIds: string[]) {
  // Mesma chave estavel do feed: a lista chega como array novo a cada render, e
  // sem serializar a consulta inteira seria descartada sem nada ter mudado.
  const chave = habitIds.join(',')

  return useQuery({
    queryKey: ['grupo', grupoId, 'enquetes', chave],
    enabled: Boolean(grupoId) && chave !== '',
    queryFn: async (): Promise<Enquete[]> => {
      const { data, error } = await supabase
        .from('occurrences')
        .select('id')
        .in('habit_id', chave.split(','))
        .eq('status', 'em_validacao')
      if (error) throw error

      const ids = (data ?? []).map((l) => (l as { id: string }).id)
      if (ids.length === 0) return []

      const { data: votos, error: erroVotos } = await supabase
        .from('votos_validacao')
        .select('occurrence_id, user_id, aprova')
        .in('occurrence_id', ids)
      // Falhar em silencio aqui mostraria placar zerado numa enquete que ja tem
      // voto, e o desfazer apareceria numa declaracao que o grupo ja julgou.
      if (erroVotos) throw erroVotos

      const porOcorrencia = new Map<string, LinhaVoto[]>()
      for (const voto of (votos ?? []) as LinhaVoto[]) {
        const atual = porOcorrencia.get(voto.occurrence_id) ?? []
        atual.push(voto)
        porOcorrencia.set(voto.occurrence_id, atual)
      }

      return ids.map((id) => {
        const dela = porOcorrencia.get(id) ?? []
        return {
          id,
          aFavor: dela.filter((v) => v.aprova).map((v) => v.user_id),
          contra: dela.filter((v) => !v.aprova).map((v) => v.user_id),
        }
      })
    },
  })
}

export interface ResultadoVoto {
  ok?: boolean
  favor?: number
  contra?: number
  /** true quando este voto completou o quorum e a enquete fechou na hora. */
  resolvida?: boolean
  error?: string
}

/** Erros de `votar_validacao` traduzidos. O codigo cru nunca vai para a tela. */
const ERROS_VOTO: Record<string, string> = {
  // Uma resposta so para inexistente, de outro grupo e ja resolvida: mensagem
  // diferente por caso deixaria enumerar ocorrencia alheia.
  ocorrencia_invalida: 'Esta enquete não está mais aberta.',
  voto_proprio: 'A própria declaração não recebe seu voto.',
  prazo_encerrado: 'O prazo desta enquete terminou.',
}

/**
 * Voto na enquete. Trocar o voto e chamar de novo: a RPC substitui o anterior.
 *
 * Quem decide o resultado e o servidor. A tela nunca soma os votos para
 * adivinhar se aprovou, e nunca mostra ouro antes de a enquete fechar.
 *
 * `usuarioId` vem por parametro em vez de sair de `useSessao` aqui dentro: cada
 * post em validacao monta a sua mutation, e uma assinatura de sessao por cartao
 * seria trabalho repetido por uma informacao que a lista ja tem em maos.
 */
export function useVotarValidacao(grupoId: string | undefined, usuarioId: string | null) {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: async ({
      occ,
      aprova,
    }: {
      occ: string
      aprova: boolean
    }): Promise<ResultadoVoto> => {
      const { data, error } = await supabase.rpc('votar_validacao', {
        p_occ: occ,
        p_aprova: aprova,
      })
      if (error) throw error
      const resultado = data as ResultadoVoto
      // A RPC devolve falha dentro de um 200. Sem lancar aqui, o `onSuccess`
      // roda em cima de um erro e invalida cache por nada.
      if (resultado?.error) {
        throw new Error(ERROS_VOTO[resultado.error] ?? 'Não deu para votar agora.')
      }
      return resultado
    },
    onSuccess: (resultado, { occ, aprova }) => {
      // O feed nunca e invalidado: a enquete E o post, e o resultado do voto
      // entra escrito no cache. Invalidar `['grupo', grupoId]` casa por prefixo
      // e levaria o feed junto, refazendo todas as paginas ja roladas com todas
      // as fotos reassinadas por causa de um toque.
      cliente.invalidateQueries({ queryKey: ['grupo', grupoId, 'enquetes'] })
      // Enquete resolvida paga ouro e mexe no ranking, que vive no detalhe do
      // grupo. Voto que so muda o placar nao mexe em nada disso.
      if (resultado.resolvida) {
        cliente.invalidateQueries({ queryKey: ['grupo', grupoId], exact: true })
      }
      if (grupoId && usuarioId) {
        void aplicarVotoNoFeed(
          cliente,
          grupoId,
          occ,
          usuarioId,
          aprova,
          Boolean(resultado.resolvida),
        )
      }
    },
  })
}
