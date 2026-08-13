import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface HabitoRuim {
  id: string
  titulo: string
  icone: string
  ouroBase: number
  puneOuro: boolean
  grupoId: string | null
  grupoNome: string | null
}

interface LinhaHabito {
  id: string
  titulo: string
  icone: string
  ouro_base: number
  pune_ouro: boolean
  group_id: string | null
  groups: { nome: string } | null
}

/**
 * Hábitos de perda. Não geram ocorrência nem vencem: só existem para o usuário
 * confessar a recaída. Quem decide o que aparece é a RLS, e é por isso que aqui
 * não tem filtro por usuário: repetir a regra no cliente só criaria um segundo
 * lugar para ela ficar errada.
 */
export function useHabitosRuins() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['habitos-ruins', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<HabitoRuim[]> => {
      const { data, error } = await supabase
        .from('habits')
        .select('id, titulo, icone, ouro_base, pune_ouro, group_id, groups ( nome )')
        .eq('tipo', 'ruim')
        .eq('ativo', true)
      if (error) throw error

      return ((data ?? []) as unknown as LinhaHabito[])
        .map((l) => ({
          id: l.id,
          titulo: l.titulo,
          icone: l.icone,
          ouroBase: l.ouro_base,
          puneOuro: l.pune_ouro,
          grupoId: l.group_id,
          grupoNome: l.groups?.nome ?? null,
        }))
        .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
    },
  })
}
