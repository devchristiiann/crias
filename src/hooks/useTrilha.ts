import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface Trilha {
  /** Dias em que o usuario concluiu pelo menos uma ocorrencia, do mais antigo ao mais novo. */
  diasProdutivos: string[]
  conquistados: number
}

export function useTrilha() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['trilha', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<Trilha> => {
      const { data, error } = await supabase
        .from('occurrences')
        .select('data_sp')
        .eq('user_id', usuarioId!)
        .eq('status', 'feito')
        .order('data_sp', { ascending: true })
      if (error) throw error

      // O no da trilha e o DIA PRODUTIVO, nao o dia de calendario: dois habitos
      // concluidos no mesmo dia avancam um no so.
      const diasProdutivos = [...new Set((data ?? []).map((o) => o.data_sp))]
      return { diasProdutivos, conquistados: diasProdutivos.length }
    },
  })
}
