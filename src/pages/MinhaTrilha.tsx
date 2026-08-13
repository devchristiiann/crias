import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Coins, Loader2, Palette } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { BarraVida } from '@/components/perfil/BarraVida'
import { CalendarioOfensiva } from '@/components/perfil/CalendarioOfensiva'
import { Trilha } from '@/components/trilha/Trilha'
import { Botao } from '@/components/ui/Botao'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { Folha } from '@/components/ui/Folha'
import { usePerfil } from '@/hooks/usePerfil'
import { useTrilha } from '@/hooks/useTrilha'
import { BASES } from '@/lib/sprites'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function MinhaTrilha() {
  const { data: perfil, isPending, isError, refetch } = usePerfil()
  const { data: trilha } = useTrilha()
  const [trocandoAparencia, setTrocandoAparencia] = useState(false)

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

      <Trilha
        diasProdutivos={dias}
        avatarBase={perfil.avatar_base}
        itemEquipado={perfil.item_equipado}
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <BarraVida vida={perfil.vida} />
      </div>

      <Botao
        variante="secundario"
        className="w-full justify-between"
        onClick={() => setTrocandoAparencia(true)}
      >
        Trocar personagem
        <Palette className="size-4" />
      </Botao>

      <CalendarioOfensiva diasProdutivos={dias} />

      <FolhaAparencia
        aberta={trocandoAparencia}
        aoFechar={() => setTrocandoAparencia(false)}
        baseAtual={perfil.avatar_base}
        itemEquipado={perfil.item_equipado}
      />
    </section>
  )
}

/**
 * Trocar o boneco depois do onboarding.
 *
 * Antes a escolha acontecia uma vez so, no cadastro, e ficava travada para
 * sempre: quem se arrependia nao tinha caminho nenhum de volta.
 */
function FolhaAparencia({
  aberta,
  aoFechar,
  baseAtual,
  itemEquipado,
}: {
  aberta: boolean
  aoFechar: () => void
  baseAtual: string
  itemEquipado: string | null
}) {
  const cliente = useQueryClient()
  const [erro, setErro] = useState<string | null>(null)

  const trocar = useMutation({
    mutationFn: async (base: string) => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('sem sessão')
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_base: base })
        .eq('id', sessao.user.id)
      if (error) throw error
    },
    onSuccess: () => {
      setErro(null)
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      aoFechar()
    },
    onError: () => setErro('Não deu para trocar agora. Tente de novo.'),
  })

  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Trocar personagem">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {Object.keys(BASES).map((id) => (
            <button
              key={id}
              type="button"
              aria-label={`Personagem ${id.replace('base-', '')}`}
              aria-pressed={baseAtual === id}
              disabled={trocar.isPending}
              onClick={() => trocar.mutate(id)}
              className={cn(
                'flex min-h-11 items-center justify-center rounded-lg border-2 bg-card py-3',
                'disabled:opacity-50',
                baseAtual === id ? 'border-primary' : 'border-border',
              )}
            >
              <Avatar base={id} item={itemEquipado} tamanho={48} />
            </button>
          ))}
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <p className="text-sm text-muted-foreground">
          Os acessórios ficam na Loja, comprados com ouro.
        </p>
      </div>
    </Folha>
  )
}
