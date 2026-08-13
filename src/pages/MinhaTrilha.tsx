import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

/** O que a troca custa e se a primeira escolha ainda esta de pe. Vem do
 *  servidor: preco de jogo nao pode ser numero cravado na tela. */
interface InfoPersonagem {
  custo: number
  gratis: boolean
  ouro: number
  base: string
}

function useInfoPersonagem(usuarioId: string | undefined) {
  return useQuery({
    queryKey: ['personagem', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<InfoPersonagem> => {
      const { data, error } = await supabase.rpc('info_personagem')
      if (error) throw error
      return data as InfoPersonagem
    },
  })
}

export function MinhaTrilha() {
  const { data: perfil, isPending, isError, refetch } = usePerfil()
  const { data: trilha } = useTrilha()
  const { data: info } = useInfoPersonagem(perfil?.id)
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

      {/* O preco aparece no proprio botao: ninguem abre a folha sem saber que a
          troca tem custo. */}
      <Botao
        variante="secundario"
        className="w-full justify-between"
        onClick={() => setTrocandoAparencia(true)}
      >
        <span className="flex items-center gap-2">
          <Palette className="size-4" />
          Trocar personagem
        </span>
        {info && !info.gratis && (
          <span className="flex items-center gap-1.5 font-semibold text-warning">
            <Coins className="size-4" />
            {info.custo}
          </span>
        )}
      </Botao>

      <CalendarioOfensiva diasProdutivos={dias} />

      <FolhaAparencia
        aberta={trocandoAparencia}
        aoFechar={() => setTrocandoAparencia(false)}
        baseAtual={perfil.avatar_base}
        itemEquipado={perfil.item_equipado}
        info={info}
        ouro={perfil.ouro}
      />
    </section>
  )
}

/**
 * Trocar o boneco depois do onboarding.
 *
 * Antes a escolha acontecia uma vez so, no cadastro, e ficava travada para
 * sempre: quem se arrependia nao tinha caminho nenhum de volta.
 *
 * Hoje custa ouro, entao tocar no personagem apenas seleciona: quem debita e o
 * botao de confirmar, que carrega o preco escrito. Cobrar no toque da grade
 * tirava ouro de quem so estava olhando as opcoes.
 */
function FolhaAparencia({
  aberta,
  aoFechar,
  baseAtual,
  itemEquipado,
  info,
  ouro,
}: {
  aberta: boolean
  aoFechar: () => void
  baseAtual: string
  itemEquipado: string | null
  info: InfoPersonagem | undefined
  /** Vem do perfil, nao da consulta de preco: e o mesmo numero do topo da tela
   *  e do menu, e duas fontes de ouro na mesma folha divergem na hora errada. */
  ouro: number
}) {
  const cliente = useQueryClient()
  const [erro, setErro] = useState<string | null>(null)
  const [escolhida, setEscolhida] = useState(baseAtual)

  const trocar = useMutation({
    mutationFn: async (base: string) => {
      const { data, error } = await supabase.rpc('trocar_personagem', { p_base: base })
      if (error) throw error
      if (data?.error === 'ouro_insuficiente') {
        throw new Error(`Ouro insuficiente. A troca custa ${data.custo} de ouro.`)
      }
      if (data?.error) throw new Error('Não deu para trocar agora. Tente de novo.')
    },
    onSuccess: () => {
      setErro(null)
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['personagem'] })
      aoFechar()
    },
    onError: (e: Error) => setErro(e.message),
  })

  const custo = info?.gratis ? 0 : (info?.custo ?? null)
  const mudou = escolhida !== baseAtual
  const temOuro = custo === null || ouro >= custo

  // Fechar sem confirmar descarta a previa. Sem isso a folha reabre com outro
  // personagem em destaque e o botao de cobrar ja liberado.
  function fechar() {
    setEscolhida(baseAtual)
    setErro(null)
    aoFechar()
  }

  return (
    <Folha aberta={aberta} aoFechar={fechar} titulo="Trocar personagem">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {Object.keys(BASES).map((id) => (
            <button
              key={id}
              type="button"
              aria-label={`Personagem ${id.replace('base-', '')}`}
              aria-pressed={escolhida === id}
              onClick={() => setEscolhida(id)}
              className={cn(
                'flex min-h-11 items-center justify-center rounded-lg border-2 bg-card py-3',
                escolhida === id ? 'border-primary' : 'border-border',
              )}
            >
              <Avatar base={id} item={itemEquipado} tamanho={48} />
            </button>
          ))}
        </div>

        {info && (
          <p className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{custo ? `Custa ${custo} de ouro` : 'Primeira escolha, de graça'}</span>
            <span className="flex items-center gap-1.5 font-semibold text-warning">
              <Coins className="size-4" />
              {ouro}
            </span>
          </p>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <Botao
          tamanho="lg"
          className="w-full"
          disabled={!mudou || !temOuro || !info}
          carregando={trocar.isPending}
          onClick={() => trocar.mutate(escolhida)}
        >
          {!mudou
            ? 'Escolha outro personagem'
            : custo
              ? `Trocar por ${custo} de ouro`
              : 'Trocar personagem'}
        </Botao>
      </div>
    </Folha>
  )
}
