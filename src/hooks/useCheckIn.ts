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
  /**
   * Marcado no cliente, não pelo servidor: o upload da comprovação falhou e o
   * check-in seguiu sem foto. Sem isto a foto sumia calada.
   */
  fotoFalhou?: boolean
}

export interface ResultadoDesfazer {
  ouro?: number
  ouro_devolvido?: number
  error?: string
}

/** Erros de `check_in` traduzidos. O codigo cru nunca vai para a tela. */
const ERROS_CHECK_IN: Record<string, string> = {
  foto_obrigatoria: 'Este grupo só aceita check-in com foto.',
  foto_invalida: 'Não deu para usar essa foto. Tente outra.',
  ocorrencia_futura: 'Este desafio ainda não abriu.',
  ocorrencia_invalida: 'Não encontramos este desafio.',
}

/** Erros de `desfazer_check_in` traduzidos. O codigo cru nunca vai para a tela. */
const ERROS_DESFAZER: Record<string, string> = {
  ocorrencia_invalida: 'Não encontramos este check-in.',
  nao_estava_feito: 'Este hábito já está como não feito.',
  bau_aberto: 'Este check-in abriu um baú e o prêmio já entrou no acervo.',
  fora_do_dia: 'Só dá para desmarcar no mesmo dia.',
  saldo_gasto: 'Você já gastou o ouro deste check-in. Não dá para desmarcar.',
  sem_contabilidade: 'Este check-in é anterior à opção de desmarcar.',
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
      let fotoFalhou = false

      if (foto && usuarioId) {
        const comprimida = await comprimirImagem(foto)
        caminho = `${usuarioId}/${ocorrenciaId}.webp`
        const { error } = await supabase.storage
          .from('checkins')
          .upload(caminho, comprimida, { contentType: 'image/webp', upsert: true })
        // Foto e opcional: falhar o upload nao pode impedir o habito de ser
        // marcado. Mas a tela precisa contar, senao a comprovacao some calada.
        if (error) {
          caminho = null
          fotoFalhou = true
        }
      }

      const { data, error } = await supabase.rpc('check_in', {
        p_occ: ocorrenciaId,
        p_foto: caminho,
      })
      if (error) throw error
      const resultado = data as ResultadoCheckIn
      // A RPC devolve falha dentro de um 200. Sem lancar aqui, o `onSuccess`
      // roda em cima de um erro e invalida cache por nada.
      if (resultado?.error) {
        throw new Error(
          ERROS_CHECK_IN[resultado.error] ?? 'Não deu para marcar agora. Tente de novo.',
        )
      }
      return { ...resultado, fotoFalhou }
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

/**
 * Desmarca o check-in do dia. Quem calcula o estorno é o servidor: a tela só
 * mostra o `ouro` que voltou na resposta, nunca subtrai por conta própria.
 */
export function useDesfazerCheckIn() {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: async (ocorrenciaId: string): Promise<ResultadoDesfazer> => {
      const { data, error } = await supabase.rpc('desfazer_check_in', { p_occ: ocorrenciaId })
      if (error) throw error
      const resultado = data as ResultadoDesfazer
      if (resultado?.error) {
        throw new Error(ERROS_DESFAZER[resultado.error] ?? 'Não deu para desmarcar agora.')
      }
      return resultado
    },
    // As mesmas chaves do check-in: desfazer mexe exatamente nos mesmos dados.
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['ocorrencias'] })
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['trilha'] })
      cliente.invalidateQueries({ queryKey: ['grupo'] })
    },
  })
}
