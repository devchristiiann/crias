import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface Perfil {
  id: string
  nome: string
  avatar_base: string
  item_equipado: string | null
  ouro: number
  vida: number
  xp: number
}

export function usePerfil() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['perfil', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<Perfil> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, avatar_base, item_equipado, ouro, vida, xp')
        .eq('id', usuarioId!)
        .single()
      if (error) throw error
      return data as Perfil
    },
  })
}
