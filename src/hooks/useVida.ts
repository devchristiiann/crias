import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export type MotivoVida = 'atraso' | 'recaida' | 'renascimento' | 'escudo'

export interface VidaEvento {
  id: string
  /** Negativo quando perdeu, positivo quando a vida encheu de novo. */
  delta: number
  vida_depois: number
  motivo: MotivoVida
  criado_em: string
}

/** O motivo cru vem do banco em minúscula e sem acento. A tela nunca mostra o cru. */
export const MOTIVO_EM_PORTUGUES: Record<MotivoVida, string> = {
  atraso: 'Atraso',
  recaida: 'Recaída',
  renascimento: 'Renascimento',
  // O escudo some do saldo sem mexer na vida. Sem esta linha a trilha mostrava
  // um evento em branco, que é justamente o que a lista existe para evitar.
  escudo: 'Escudo usado, ofensiva salva',
}

/** O recente basta: a barra precisa explicar o que acabou de acontecer, não a vida inteira. */
const LIMITE = 10

export function useVida() {
  const { usuarioId } = useSessao()

  return useQuery({
    // A chave é a mesma que a recaída invalida depois de registrada.
    queryKey: ['vida', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<VidaEvento[]> => {
      const { data, error } = await supabase
        .from('vida_eventos')
        .select('id, delta, vida_depois, motivo, criado_em')
        .eq('user_id', usuarioId!)
        .order('criado_em', { ascending: false })
        .limit(LIMITE)
      if (error) throw error
      return (data ?? []) as VidaEvento[]
    },
  })
}
