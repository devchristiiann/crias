import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface Brinde {
  /** Chave estável do brinde, e a chave primária junto com o usuário. É ela que
   *  `marcar_brinde_visto` recebe, e é ela que impede o mesmo brinde de voltar. */
  chave: string
  titulo: string
  corpo: string
  /** Ouro que o servidor JÁ creditou quando a linha nasceu. O modal só avisa:
   *  não existe botão de resgatar, e criar um pagaria duas vezes. */
  ouro: number
  /** Poções de vida que o servidor já somou ao inventário, pelo mesmo motivo. */
  pocoes_vida: number
}

/**
 * Brinde nasce de migration, nunca durante a sessão de quem está usando o app.
 * Refazer a consulta a cada 30 segundos, como as listas vivas do app, seria
 * gastar rede para reconfirmar uma linha que ninguém escreve enquanto a pessoa
 * está na tela. Quem precisa da resposta na hora é o marcar visto, e ele
 * invalida a chave em vez de esperar a validade acabar.
 */
const VALIDADE = 5 * 60_000

/** O mais antigo primeiro: dois brindes pendentes aparecem na ordem em que vieram. */
export function useBrindePendente() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['brinde', usuarioId],
    enabled: Boolean(usuarioId),
    staleTime: VALIDADE,
    queryFn: async (): Promise<Brinde | null> => {
      const { data, error } = await supabase
        .from('brindes')
        // Colunas listadas uma a uma, igual ao resto do app: com select('*')
        // qualquer coluna nova vaza para o navegador sem ninguem perceber.
        .select('chave, titulo, corpo, ouro, pocoes_vida')
        .eq('user_id', usuarioId!)
        .is('visto_em', null)
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as Brinde | null) ?? null
    },
  })
}

interface Resposta {
  ok?: boolean
  error?: string
}

/**
 * Marca o brinde como visto. HTTP 200 sempre, então o código de erro vem no
 * corpo e precisa ser lido à mão.
 *
 * A falha é tratada por omissão deliberada: sem `onSuccess` não há invalidação,
 * o cache continua com o brinde pendente e ele volta na próxima abertura do
 * app. Fingir que gravou seria pior, porque o aviso sumiria para sempre sem o
 * servidor nunca ter registrado nada.
 */
export function useMarcarBrindeVisto() {
  const cliente = useQueryClient()

  return useMutation({
    // Mesma tolerância a rede instável que as consultas têm por padrão.
    retry: 1,
    mutationFn: async (chave: string): Promise<Resposta> => {
      const { data, error } = await supabase.rpc('marcar_brinde_visto', { p_chave: chave })
      if (error) throw error
      const resposta = data as Resposta
      if (resposta?.error) throw new Error(resposta.error)
      return resposta
    },
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['brinde'] })
    },
  })
}
