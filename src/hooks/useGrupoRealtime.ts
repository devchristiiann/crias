import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  aplicarNoFeed,
  aplicarVotoDeOutroNoFeed,
  type LinhaAoVivo,
} from '@/hooks/useFeedGrupo'
import { supabase } from '@/lib/supabase'

/**
 * Teto de desafios que cabem no filtro do Realtime.
 *
 * O filtro vira uma clausula avaliada pelo Postgres em cada linha do WAL, e ela
 * viaja inteira no `subscribe`. Com 36 caracteres por id, 30 desafios ja passam
 * de um kilobyte de filtro por assinatura. Grupo maior que isso volta a receber
 * tudo e a peneirar no cliente, que e o comportamento antigo: pior no socket,
 * mas nunca errado na tela.
 */
const MAXIMO_NO_FILTRO = 30

/**
 * Atualiza o grupo quando qualquer membro conclui um desafio.
 *
 * O nome do canal e unico por montagem de proposito. Canal compartilhado entre
 * componentes vaza evento de um para o outro no runtime quente do navegador,
 * armadilha ja paga em outro projeto da casa.
 */
export function useGrupoRealtime(grupoId: string | undefined, habitIds: string[]) {
  const cliente = useQueryClient()
  // A lista chega como array novo a cada render. Serializar aqui e reconstruir
  // dentro do efeito e o que impede o canal de ser derrubado e reassinado a
  // cada render, que era exatamente o que este hook existe para evitar.
  const chave = habitIds.join(',')

  useEffect(() => {
    if (!grupoId || chave === '') return

    const canal = supabase.channel(`grupo_rt_${crypto.randomUUID()}`)
    const ids = chave.split(',')
    const alvo = new Set(ids)

    canal
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'occurrences',
          // Sem filtro no servidor, todo check-in do app inteiro trafegava no
          // socket de todo usuario para ser descartado aqui embaixo.
          ...(ids.length <= MAXIMO_NO_FILTRO ? { filter: `habit_id=in.(${ids.join(',')})` } : {}),
        },
        (evento) => {
          const linha = evento.new as LinhaAoVivo | null
          // A conferencia continua: acima do teto nao ha filtro no servidor, e
          // um evento de outro grupo chegaria aqui.
          if (!linha?.habit_id || !alvo.has(linha.habit_id)) return

          // Chave exata. `['grupo', grupoId]` casa por prefixo e levava junto o
          // feed e as enquetes, entao um check-in de colega recarregava a tela
          // inteira: era esse o "tudo recarrega junto".
          cliente.invalidateQueries({ queryKey: ['grupo', grupoId], exact: true })
          cliente.invalidateQueries({ queryKey: ['grupo', grupoId, 'enquetes'] })

          // O feed nao e invalidado: o registro que chegou ja e o cartao novo, e
          // ele entra direto no cache. Invalidar refaria todas as paginas ja
          // roladas para descobrir a linha que o socket acabou de entregar.
          //
          // Vale para tudo que o feed mostra, que e toda linha com `feito_em`:
          // check-in comum, declaracao em validacao e cada marcacao de rotina de
          // janela. Sem isso o post so apareceria para os outros na proxima
          // busca, que no caso da enquete e justamente quando o prazo de 24h ja
          // andou.
          void aplicarNoFeed(cliente, grupoId, chave, linha)
        },
      )
      .on(
        'postgres_changes',
        {
          // INSERT e UPDATE no mesmo tratador: a chave e `(occurrence_id,
          // user_id)`, entao trocar de voto SUBSTITUI a linha e chega como
          // UPDATE. Cobrir so o INSERT deixaria o placar preso no primeiro voto.
          // Nao ha filtro possivel aqui, a tabela nao tem `habit_id`; o que
          // segura o volume e a RLS, que so entrega voto de enquete visivel.
          event: '*',
          schema: 'public',
          table: 'votos_validacao',
        },
        (evento) => {
          const voto = evento.new as
            | { occurrence_id?: string; user_id?: string; aprova?: boolean }
            | null
          // DELETE chega com `new` vazio, e sem os tres campos nao ha placar a
          // escrever.
          if (!voto?.occurrence_id || !voto.user_id || typeof voto.aprova !== 'boolean') return

          // O placar entra escrito no cache do feed. Invalidar refaria todas as
          // paginas ja roladas, com todas as fotos reassinadas, por um contador
          // que o proprio evento ja trouxe.
          aplicarVotoDeOutroNoFeed(cliente, grupoId, voto.occurrence_id, voto.user_id, voto.aprova)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
  }, [grupoId, chave, cliente])
}
