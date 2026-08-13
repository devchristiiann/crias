import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface Notificacao {
  id: string
  titulo: string
  corpo: string
  /** Sempre no formato `/hoje?occ=<id>` quando existe. Null quando o toque nao leva a lugar nenhum. */
  url: string | null
  lida_em: string | null
  criado_em: string
}

/** As mais recentes bastam. Central de notificacao nao e arquivo morto. */
const LIMITE = 50

/** As mesmas opcoes servem a lista e a contagem, para as duas viverem do mesmo cache. */
function opcoes(usuarioId: string | null) {
  return {
    queryKey: ['notificacoes', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<Notificacao[]> => {
      // O cabecalho sai montado no instante do fetch, lendo a sessao que o
      // cliente tem naquele momento. Enquanto a sessao nova nao esta aplicada o
      // cliente cai na chave anonima, e `notificacoes` nao tem select para
      // `anon`: o PostgREST responde 401 `permission denied`, e o console de
      // quem acabou de criar a conta abre sujo. `usuarioId` vem do estado do
      // React, que e uma copia da sessao e pode estar na frente dela, entao ele
      // sozinho nao prova nada. Conferir aqui e o que amarra as duas pontas: a
      // consulta so sai quando a sessao aplicada for a do usuario consultado, e
      // quando nao for, falha sem ir a rede e a nova tentativa pega o token
      // certo.
      const { data: autenticacao } = await supabase.auth.getSession()
      if (autenticacao.session?.user.id !== usuarioId) throw new Error('sessao_nao_aplicada')

      const { data, error } = await supabase
        .from('notificacoes')
        // Colunas listadas uma a uma, igual ao resto do app: com select('*')
        // qualquer coluna nova vaza para o navegador sem ninguem perceber.
        .select('id, titulo, corpo, url, lida_em, criado_em')
        .eq('user_id', usuarioId!)
        .order('criado_em', { ascending: false })
        .limit(LIMITE)
      if (error) throw error
      return (data ?? []) as Notificacao[]
    },
  }
}

export function useNotificacoes() {
  const { usuarioId } = useSessao()
  return useQuery(opcoes(usuarioId))
}

/** Só a contagem de não lidas, derivada da mesma consulta. Sem ida extra ao banco. */
export function useNaoLidas() {
  const { usuarioId } = useSessao()
  return useQuery({
    ...opcoes(usuarioId),
    select: (lista: Notificacao[]) => lista.filter((n) => n.lida_em === null).length,
  })
}

export interface ResultadoMarcar {
  ok?: boolean
  marcadas?: number
}

/**
 * Marca como lida. Sem id marca todas as não lidas do usuário, com id marca só
 * aquela. Quem decide o que pode ser marcado é a RPC: a tabela não tem update
 * para o cliente.
 */
export function useMarcarLidas() {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: async (id: string | null): Promise<ResultadoMarcar> => {
      const { data, error } = await supabase.rpc('marcar_notificacoes_lidas', { p_id: id })
      if (error) throw error
      return data as ResultadoMarcar
    },
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['notificacoes'] })
    },
  })
}
