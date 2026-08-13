import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Gift, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { Folha } from '@/components/ui/Folha'
import { usePerfil } from '@/hooks/usePerfil'
import { useSessao } from '@/hooks/useSessao'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface Premio {
  id: string
  titulo: string
  custo_ouro: number
}

interface ItemLoja {
  id: string
  nome: string
  custo_ouro: number
  possui: boolean
}

export function Loja() {
  const { data: perfil } = usePerfil()
  const [criando, setCriando] = useState(false)
  const ouro = perfil?.ouro ?? 0

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Loja</h1>
          <p className="text-sm text-muted-foreground">Troque ouro por recompensa de verdade.</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-warning/15 px-3 py-2 font-semibold text-warning">
          <Coins className="size-4" />
          {ouro}
        </span>
      </header>

      <Premios ouro={ouro} aoCriar={() => setCriando(true)} criando={criando} setCriando={setCriando} />
      <Itens ouro={ouro} perfil={perfil} />
    </section>
  )
}

function Premios({
  ouro,
  aoCriar,
  criando,
  setCriando,
}: {
  ouro: number
  aoCriar: () => void
  criando: boolean
  setCriando: (v: boolean) => void
}) {
  const cliente = useQueryClient()
  const { usuarioId } = useSessao()
  const [titulo, setTitulo] = useState('')
  const [custo, setCusto] = useState(50)
  const [erro, setErro] = useState<string | null>(null)

  const { data: premios, isPending, isError, refetch } = useQuery({
    queryKey: ['premios', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<Premio[]> => {
      const { data, error } = await supabase
        .from('rewards')
        .select('id, titulo, custo_ouro')
        .eq('ativo', true)
        .order('custo_ouro', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('rewards')
        .insert({ user_id: usuarioId!, titulo: titulo.trim(), custo_ouro: custo })
      if (error) throw error
    },
    onSuccess: () => {
      setTitulo('')
      setCriando(false)
      cliente.invalidateQueries({ queryKey: ['premios'] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  const resgatar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('resgatar_premio', { p_reward: id })
      if (error) throw error
      if (data?.error === 'ouro_insuficiente') throw new Error('Ouro insuficiente.')
      if (data?.error) throw new Error('Não deu para resgatar agora.')
    },
    onSuccess: () => {
      setErro(null)
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['premios'] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  const arquivar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rewards').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['premios'] }),
  })

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Seus prêmios
      </h2>

      {isPending && <Loader2 className="size-5 animate-spin text-muted-foreground" />}

      {isError && (
        <EstadoErro mensagem="Não deu para carregar seus prêmios." aoTentarDeNovo={refetch} />
      )}

      {!isPending && !isError && (premios ?? []).length === 0 && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Cadastre o que você quer ganhar. Um filme com a família, cinquenta reais livres, uma
            folga.
          </p>
          <Botao variante="secundario" className="w-full" onClick={aoCriar}>
            <Plus className="size-4" />
            Novo prêmio
          </Botao>
        </div>
      )}

      <ul className="space-y-2">
        {(premios ?? []).map((p) => {
          const pode = ouro >= p.custo_ouro
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                <Gift className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.titulo}</span>
                <span className="block text-xs text-muted-foreground">{p.custo_ouro} de ouro</span>
              </span>
              <Botao
                variante={pode ? 'primario' : 'secundario'}
                disabled={!pode}
                carregando={resgatar.isPending && resgatar.variables === p.id}
                onClick={() => resgatar.mutate(p.id)}
              >
                Resgatar
              </Botao>
              <button
                type="button"
                aria-label={`Remover ${p.titulo}`}
                disabled={arquivar.isPending}
                onClick={() => {
                  // Confirmacao nomeia o premio: e acao destrutiva, e o alvo
                  // fica ao lado do botao de resgatar.
                  if (window.confirm(`Remover o prêmio ${p.titulo}?`)) arquivar.mutate(p.id)
                }}
                className="flex size-11 shrink-0 items-center justify-center rounded-md
                           text-muted-foreground hover:bg-accent hover:text-destructive
                           disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          )
        })}
      </ul>

      {erro && !criando && <p className="text-sm text-destructive">{erro}</p>}

      {(premios ?? []).length > 0 && (
        <Botao variante="secundario" className="w-full" onClick={aoCriar}>
          <Plus className="size-4" />
          Novo prêmio
        </Botao>
      )}

      <Folha aberta={criando} aoFechar={() => setCriando(false)} titulo="Novo prêmio">
        <div className="space-y-4">
          <Campo
            rotulo="O que você ganha"
            placeholder="Filme com a família"
            value={titulo}
            maxLength={60}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Custo em ouro</span>
            <input
              type="number"
              min={1}
              value={custo}
              onChange={(e) => setCusto(Number(e.target.value))}
              className="h-11 w-28 rounded-lg border border-input bg-card px-3
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {/* Dentro da folha: com o modal aberto, um erro renderizado atras
              fica invisivel e o usuario nao descobre por que falhou. */}
          {erro && criando && <p className="text-sm text-destructive">{erro}</p>}

          <Botao
            tamanho="lg"
            className="w-full"
            disabled={titulo.trim().length < 2 || custo < 1}
            carregando={criar.isPending}
            onClick={() => criar.mutate()}
          >
            Cadastrar
          </Botao>
        </div>
      </Folha>
    </div>
  )
}

function Itens({ ouro, perfil }: { ouro: number; perfil: { avatar_base: string; item_equipado: string | null } | undefined }) {
  const cliente = useQueryClient()
  const { usuarioId } = useSessao()
  const [erro, setErro] = useState<string | null>(null)

  const { data: itens } = useQuery({
    queryKey: ['itens', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<ItemLoja[]> => {
      const [catalogo, meus] = await Promise.all([
        supabase.from('avatar_items').select('id, nome, custo_ouro').order('custo_ouro'),
        supabase.from('owned_items').select('item_id'),
      ])
      if (catalogo.error) throw catalogo.error
      if (meus.error) throw meus.error
      const possuidos = new Set((meus.data ?? []).map((m) => m.item_id))
      return (catalogo.data ?? []).map((i) => ({ ...i, possui: possuidos.has(i.id) }))
    },
  })

  const comprar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('comprar_item', { p_item: id })
      if (error) throw error
      if (data?.error === 'ouro_insuficiente') throw new Error('Ouro insuficiente.')
      if (data?.error) throw new Error('Não deu para comprar agora.')
    },
    onSuccess: () => {
      setErro(null)
      cliente.invalidateQueries({ queryKey: ['itens'] })
      cliente.invalidateQueries({ queryKey: ['perfil'] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  const equipar = useMutation({
    mutationFn: async (id: string | null) => {
      const { data, error } = await supabase.rpc('equipar_item', { p_item: id })
      if (error) throw error
      if (data?.error) throw new Error('Não deu para equipar agora.')
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['perfil'] }),
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Itens do personagem
      </h2>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <ul className="grid grid-cols-2 gap-2">
        {(itens ?? []).map((item) => {
          const equipado = perfil?.item_equipado === item.id
          const pode = ouro >= item.custo_ouro
          return (
            <li
              key={item.id}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border bg-card p-3 shadow-sm',
                equipado ? 'border-primary' : 'border-border',
              )}
            >
              <Avatar base={perfil?.avatar_base} item={item.id} tamanho={64} />
              <span className="text-center text-sm font-medium leading-tight">{item.nome}</span>

              {!item.possui && (
                <Botao
                  variante={pode ? 'primario' : 'secundario'}
                  disabled={!pode}
                  carregando={comprar.isPending && comprar.variables === item.id}
                  className="w-full"
                  onClick={() => comprar.mutate(item.id)}
                >
                  <Coins className="size-4" />
                  {item.custo_ouro}
                </Botao>
              )}

              {item.possui && (
                <Botao
                  variante={equipado ? 'secundario' : 'primario'}
                  className="w-full"
                  carregando={equipar.isPending && equipar.variables === item.id}
                  onClick={() => equipar.mutate(equipado ? null : item.id)}
                >
                  {equipado ? 'Tirar' : 'Equipar'}
                </Botao>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
