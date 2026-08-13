import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Atualiza o grupo quando qualquer membro conclui um desafio.
 *
 * O nome do canal e unico por montagem de proposito. Canal compartilhado entre
 * componentes vaza evento de um para o outro no runtime quente do navegador,
 * armadilha ja paga em outro projeto da casa.
 */
export function useGrupoRealtime(grupoId: string | undefined, habitIds: string[]) {
  const cliente = useQueryClient()
  const chave = habitIds.join(',')

  useEffect(() => {
    if (!grupoId || habitIds.length === 0) return

    const canal = supabase.channel(`grupo_rt_${crypto.randomUUID()}`)
    const alvo = new Set(habitIds)

    canal
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'occurrences' },
        (evento) => {
          const linha = evento.new as { habit_id?: string } | null
          if (linha?.habit_id && alvo.has(linha.habit_id)) {
            cliente.invalidateQueries({ queryKey: ['grupo', grupoId] })
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
    // `chave` serializa a lista: dependencia de array remontaria o canal a cada render.
  }, [grupoId, chave, cliente, habitIds])
}
