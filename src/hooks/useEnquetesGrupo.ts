import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assinarEmLote } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

/**
 * Validade da URL assinada do print. Mesma janela curta do feed: o bucket e
 * privado e o link vale para quem estiver com ele em maos.
 */
const SEGUNDOS_URL_FOTO = 600

export interface Enquete {
  /** Id da ocorrencia em validacao. E ele que a RPC recebe. */
  id: string
  autorId: string
  habitId: string
  /** Quanto a pessoa declarou de uso, em minutos. */
  minutos: number
  /** Prazo de 48h gravado na declaracao. */
  validacaoAte: string
  /** URL assinada do print. Null quando a foto nao assinou. */
  fotoUrl: string | null
  /** Ids de quem validou e de quem contestou. O voto e aberto por decisao do dono. */
  aFavor: string[]
  contra: string[]
}

interface LinhaEnquete {
  id: string
  user_id: string
  habit_id: string
  minutos_declarados: number | null
  validacao_ate: string | null
  foto_path: string | null
}

interface LinhaVoto {
  occurrence_id: string
  user_id: string
  aprova: boolean
}

/**
 * Enquetes abertas do grupo, da que fecha primeiro para a que fecha depois.
 *
 * Sem paginacao de proposito: so existe enquete aberta enquanto o prazo de 48h
 * corre, e a resolucao tira a ocorrencia de `em_validacao`. A lista se esvazia
 * sozinha, entao ela e curta por construcao.
 *
 * O nome de quem votou nao sai daqui: os membros ja vieram em `useGrupo`, e
 * buscar perfil de novo por enquete seria a mesma linha lida duas vezes.
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
        .select('id, user_id, habit_id, minutos_declarados, validacao_ate, foto_path')
        .in('habit_id', chave.split(','))
        .eq('status', 'em_validacao')
        .order('validacao_ate', { ascending: true })
      if (error) throw error

      const linhas = (data ?? []) as LinhaEnquete[]
      if (linhas.length === 0) return []

      const [{ data: votos, error: erroVotos }, fotos] = await Promise.all([
        supabase
          .from('votos_validacao')
          .select('occurrence_id, user_id, aprova')
          .in('occurrence_id', linhas.map((l) => l.id)),
        assinarEmLote(
          'checkins',
          linhas.map((l) => l.foto_path).filter((c): c is string => Boolean(c)),
          SEGUNDOS_URL_FOTO,
        ),
      ])
      // Falhar em silencio aqui mostraria placar zerado numa enquete que ja tem
      // voto, e a pessoa votaria de novo achando que o toque anterior se perdeu.
      if (erroVotos) throw erroVotos

      const porOcorrencia = new Map<string, LinhaVoto[]>()
      for (const voto of (votos ?? []) as LinhaVoto[]) {
        const atual = porOcorrencia.get(voto.occurrence_id) ?? []
        atual.push(voto)
        porOcorrencia.set(voto.occurrence_id, atual)
      }

      return linhas.map((l) => {
        const dela = porOcorrencia.get(l.id) ?? []
        return {
          id: l.id,
          autorId: l.user_id,
          habitId: l.habit_id,
          minutos: l.minutos_declarados ?? 0,
          validacaoAte: l.validacao_ate ?? '',
          fotoUrl: (l.foto_path && fotos.get(l.foto_path)) || null,
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
 */
export function useVotarValidacao(grupoId: string | undefined) {
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
    onSuccess: (resultado) => {
      // Enquete resolvida sai do topo, vira linha no feed e mexe no ranking:
      // o grupo inteiro precisa ser relido. Voto que so muda o placar recarrega
      // apenas a lista de enquetes.
      cliente.invalidateQueries({
        queryKey: resultado.resolvida ? ['grupo', grupoId] : ['grupo', grupoId, 'enquetes'],
      })
    },
  })
}
