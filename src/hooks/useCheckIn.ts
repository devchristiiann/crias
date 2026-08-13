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
  // Vale para o grupo que exige foto e para acordar e dormir, que exigem
  // sempre. Nomear o grupo aqui mentiria na metade dos casos.
  foto_obrigatoria: 'Anexe uma foto para concluir esta rotina.',
  foto_invalida: 'Não deu para usar essa foto. Tente outra.',
  // Só "N vezes por semana" e "N vezes por mês": a ocorrência cobre a janela
  // inteira e vale uma marcação por dia. Dizer o porquê importa, senão a pessoa
  // acha que o botão quebrou.
  ja_marcado_hoje: 'Você já marcou esta rotina hoje. A próxima marcação conta a partir de amanhã.',
  // Mesma dupla de tipos: passado o domingo, ou o último dia do mês, a janela
  // fechou e o slot dela não volta.
  janela_encerrada: 'Este período já fechou. A marcação vale na janela atual.',
  fora_da_faixa: 'A última faixa de horário já passou. Este check-in não conta mais hoje.',
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

      if (foto) {
        // Sem sessão o caminho não teria dono e a foto era descartada em
        // silêncio, com o check-in seguindo sem a comprovação que a pessoa
        // anexou. Falhar aqui é a resposta honesta.
        if (!usuarioId) throw new Error('Sua sessão expirou. Entre de novo para enviar a foto.')
        const comprimida = await comprimirImagem(foto)
        // `<uid>/<ocorrencia>/<envio>.webp`. A ocorrência é uma PASTA, não parte
        // do nome do arquivo: é o segundo segmento que o `check_in` confere para
        // saber que esta foto é deste check-in. Antes bastava reenviar o
        // `foto_path` de qualquer outra ocorrência para satisfazer `exige_foto`.
        //
        // O nome é único por envio, nunca `foto.webp` fixo. Dois motivos: cada
        // envio vira um objeto novo em `storage.objects`, com data de criação
        // real, que é o que o `check_in` confere para saber que a foto é de
        // hoje; e o caminho deixa de ser adivinhável, então reenviar o path de
        // ontem numa janela de "N vezes por semana" não paga mais.
        caminho = `${usuarioId}/${ocorrenciaId}/${crypto.randomUUID()}.webp`
        const { error } = await supabase.storage
          .from('checkins')
          .upload(caminho, comprimida, { contentType: 'image/webp' })
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
