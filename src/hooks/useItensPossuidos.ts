import { useQuery } from '@tanstack/react-query'
import { POR_ID, type Slot } from '@/lib/catalogo'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

interface ItemLoja {
  id: string
  nome: string
  slot: Slot
  custo_ouro: number
  possui: boolean
}

/** So o que interessa aqui: o conjunto de ids ja comprados. Fica fora do
 *  componente para ter identidade estavel e nao refazer o Set a cada render. */
const somenteMeus = (itens: ItemLoja[]) =>
  new Set(itens.filter((i) => i.possui).map((i) => i.id))

/**
 * Ids das pecas que o usuario ja possui.
 *
 * Usa a mesma chave `['itens', usuarioId]` da Loja de proposito: duas consultas
 * com a mesma chave dividem uma entrada de cache, entao o corpo tambem precisa
 * ser o mesmo, senao quem chegar primeiro entrega o formato errado para a outra
 * tela. O recorte para Set vive no `select`, que muda o que este hook devolve
 * sem tocar no que fica guardado.
 */
export function useItensPossuidos() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['itens', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<ItemLoja[]> => {
      const [catalogo, meus] = await Promise.all([
        supabase.from('avatar_items').select('id, nome, slot, custo_ouro').eq('ativo', true),
        supabase.from('owned_items').select('item_id'),
      ])
      if (catalogo.error) throw catalogo.error
      if (meus.error) throw meus.error
      const possuidos = new Set((meus.data ?? []).map((m) => m.item_id))
      return (catalogo.data ?? [])
        .filter((i) => POR_ID.has(i.id))
        .map((i) => ({ ...i, slot: i.slot as Slot, possui: possuidos.has(i.id) }))
        .sort((a, b) => a.custo_ouro - b.custo_ouro)
    },
    select: somenteMeus,
  })
}
