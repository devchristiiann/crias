import { Coins, Loader2 } from 'lucide-react'
import { BarraVida } from '@/components/perfil/BarraVida'
import { CalendarioOfensiva } from '@/components/perfil/CalendarioOfensiva'
import { Trilha } from '@/components/trilha/Trilha'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { usePerfil } from '@/hooks/usePerfil'
import { useTrilha } from '@/hooks/useTrilha'

/**
 * A trilha so mostra. Trocar de personagem vive na aba Personagens da Loja, que
 * e onde estao o preco, o que ja e seu e o resto do elenco. Dois lugares para a
 * mesma compra divergiam de preco e de estado.
 */
export function MinhaTrilha() {
  const { data: perfil, isPending, isError, refetch } = usePerfil()
  const { data: trilha } = useTrilha()

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !perfil) {
    return <EstadoErro mensagem="Não deu para carregar sua trilha." aoTentarDeNovo={refetch} />
  }

  const dias = trilha?.diasProdutivos ?? []

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sua trilha</h1>
          <p className="text-sm text-muted-foreground">
            {dias.length} {dias.length === 1 ? 'dia produtivo' : 'dias produtivos'}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-warning/15 px-3 py-2 font-semibold text-warning">
          <Coins className="size-4" />
          {perfil.ouro}
        </span>
      </header>

      {/* O fundo de perfil entra aqui dentro, atras da trilha e do boneco. E o
          unico bloco da tela com o avatar do proprio usuario em destaque. */}
      <Trilha
        diasProdutivos={dias}
        avatarBase={perfil.avatar_base}
        itemEquipado={perfil.item_equipado}
        cenarioEquipado={perfil.cenario_equipado}
        fundoEquipado={perfil.fundo_equipado}
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <BarraVida vida={perfil.vida} />
      </div>

      <CalendarioOfensiva diasProdutivos={dias} />
    </section>
  )
}
