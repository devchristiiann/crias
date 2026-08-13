import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface Perfil {
  id: string
  nome: string
  avatar_base: string
  item_equipado: string | null
  cenario_equipado: string | null
  fundo_equipado: string | null
  ouro: number
  vida: number
  xp: number
  /** Marca de que a conta ja passou pela escolha de personagem, o primeiro
   *  passo do onboarding. E este o sinal de "ja fez o onboarding" que o guarda
   *  de rota le. Quem tem `true` nunca mais volta para la. */
  personagem_definido: boolean
  /** Vida chegou a zero. Sai por `curar()`, nunca por escrita do cliente. */
  doente: boolean
  /** Escudos guardados. Cada um salva as ofensivas de um dia inteiro. */
  escudos: number
  /** Dia produtivo em que a contagem do baú recomeçou. Zerar a vida joga o
   *  progresso fora sem apagar histórico, e é daqui que a trilha desloca o
   *  desenho: sem isso ela marcaria baú num nó que o servidor não paga. */
  bau_base: number
}

export function usePerfil() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['perfil', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<Perfil> => {
      const { data, error } = await supabase
        .from('profiles')
        // Colunas listadas uma a uma de proposito: com select('*') qualquer
        // coluna sensivel nova vaza para o navegador sem ninguem perceber.
        .select(
          'id, nome, avatar_base, item_equipado, cenario_equipado, fundo_equipado, ouro, vida, xp, personagem_definido, doente, escudos, bau_base',
        )
        .eq('id', usuarioId!)
        // `maybeSingle` porque `single` erra quando nao ha linha, e o erro dele
        // e indistinguivel de falha de rede. Perfil ausente (trigger de criacao
        // que falhou) precisa de saida propria, nao de "Tentar de novo".
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('perfil_ausente')
      return data as Perfil
    },
  })
}
