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
  // A lista chega como array novo a cada render. Serializar aqui e reconstruir
  // dentro do efeito e o que impede o canal de ser derrubado e reassinado a
  // cada render, que era exatamente o que este hook existe para evitar.
  const chave = habitIds.join(',')

  useEffect(() => {
    if (!grupoId || chave === '') return

    const canal = supabase.channel(`grupo_rt_${crypto.randomUUID()}`)
    const alvo = new Set(chave.split(','))

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
  }, [grupoId, chave, cliente])
}
