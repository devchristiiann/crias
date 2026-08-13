import { useMutation, useQueryClient } from '@tanstack/react-query'
import { comprimirImagem } from '@/lib/comprimirImagem'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

/**
 * Prêmio do baú, sorteado no servidor. A tela só desenha o que chega aqui:
 * nunca recalcula a chance, nunca escolhe o item, nunca inventa o valor.
 */
export interface PremioBau {
  tipo: 'ouro' | 'item'
  /** 0 quando o prêmio foi item. */
  ouro: number
  item_id: string | null
  item_nome?: string
  /** true quando aquele nó já tinha sido aberto antes e nada foi pago. */
  repetido: boolean
}

export interface ResultadoCheckIn {
  ouro_ganho?: number
  /** Parcela vinda do baú da trilha. O servidor manda, a tela nunca chuta. */
  ouro_bau?: number
  premio?: PremioBau | null
  streak?: number
  completou?: boolean
  vezes_feitas?: number
  vezes_alvo?: number
  bau?: boolean
  no?: number
  ja_feito?: boolean
  error?: string
}

export function useCheckIn() {
  const cliente = useQueryClient()
  const { usuarioId } = useSessao()

  return useMutation({
    mutationFn: async ({
      ocorrenciaId,
      foto,
    }: {
      ocorrenciaId: string
      foto?: File | null
    }): Promise<ResultadoCheckIn> => {
      let caminho: string | null = null

      if (foto && usuarioId) {
        const comprimida = await comprimirImagem(foto)
        caminho = `${usuarioId}/${ocorrenciaId}.webp`
        const { error } = await supabase.storage
          .from('checkins')
          .upload(caminho, comprimida, { contentType: 'image/webp', upsert: true })
        // Foto e opcional: falhar o upload nao pode impedir o habito de ser marcado.
        if (error) caminho = null
      }

      const { data, error } = await supabase.rpc('check_in', {
        p_occ: ocorrenciaId,
        p_foto: caminho,
      })
      if (error) throw error
      return data as ResultadoCheckIn
    },
    onSuccess: (resultado) => {
      cliente.invalidateQueries({ queryKey: ['ocorrencias'] })
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['trilha'] })
      cliente.invalidateQueries({ queryKey: ['grupo'] })
      // Skin ganha no baú muda o acervo, igual a uma compra na loja.
      if (resultado?.premio?.tipo === 'item') {
        cliente.invalidateQueries({ queryKey: ['itens'] })
      }
    },
  })
}
