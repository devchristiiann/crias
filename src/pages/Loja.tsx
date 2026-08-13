import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Gift, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { Folha } from '@/components/ui/Folha'
import { type Perfil, usePerfil } from '@/hooks/usePerfil'
import { useSessao } from '@/hooks/useSessao'
import { POR_ID, type Slot } from '@/lib/catalogo'
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
  slot: Slot
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
      <Colecao ouro={ouro} perfil={perfil} />
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

const PRATELEIRAS: { slot: Slot; rotulo: string }[] = [
  { slot: 'personagem', rotulo: 'Personagens' },
  { slot: 'acessorio', rotulo: 'Acessórios' },
  { slot: 'cenario', rotulo: 'Cenários' },
  { slot: 'fundo', rotulo: 'Fundos' },
]

/**
 * Coleção: personagem, acessório, cenário e fundo de perfil.
 *
 * O preço e o que existe à venda saem do banco, sempre. O catálogo local só
 * diz onde está o PNG e a que família a peça pertence. Se a peça estiver no
 * banco e não no catálogo, ela simplesmente não aparece, em vez de virar um
 * cartão quebrado.
 */
function Colecao({ ouro, perfil }: { ouro: number; perfil: Perfil | undefined }) {
  const cliente = useQueryClient()
  const { usuarioId } = useSessao()
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Slot>('personagem')

  const { data: itens, isPending, isError, refetch } = useQuery({
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
  })

  const invalidar = () => {
    setErro(null)
    cliente.invalidateQueries({ queryKey: ['itens'] })
    cliente.invalidateQueries({ queryKey: ['perfil'] })
    cliente.invalidateQueries({ queryKey: ['grupo'] })
  }

  const comprar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('comprar_item', { p_item: id })
      if (error) throw error
      if (data?.error === 'ouro_insuficiente') throw new Error('Ouro insuficiente.')
      if (data?.error) throw new Error('Não deu para comprar agora.')
    },
    onSuccess: invalidar,
    onError: (e: Error) => setErro(e.message),
  })

  const equipar = useMutation({
    mutationFn: async ({ id, slot }: { id: string | null; slot: Slot }) => {
      const { data, error } = await supabase.rpc('equipar_item', { p_item: id, p_slot: slot })
      if (error) throw error
      if (data?.error === 'ouro_insuficiente') throw new Error('Ouro insuficiente.')
      if (data?.error) throw new Error('Não deu para equipar agora.')
    },
    onSuccess: invalidar,
    onError: (e: Error) => setErro(e.message),
  })

  const equipadoNoSlot = (slot: Slot) =>
    slot === 'personagem' ? perfil?.avatar_base
      : slot === 'acessorio' ? perfil?.item_equipado
      : slot === 'cenario' ? perfil?.cenario_equipado
      : perfil?.fundo_equipado

  const daAba = (itens ?? []).filter((i) => i.slot === aba)
  // Personagem sempre tem um vestido, entao so os outros slots ganham a opcao de nada.
  const temNenhum = aba !== 'personagem'
  const vazio = !equipadoNoSlot(aba)

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sua coleção
      </h2>

      {/* Rolagem horizontal fica presa aqui dentro: a pagina nunca rola de lado. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div role="tablist" className="flex w-max gap-2">
          {PRATELEIRAS.map((p) => {
            // O que importa para quem coleciona e quanto ja e seu, nao quanto existe.
            const doSlot = (itens ?? []).filter((i) => i.slot === p.slot)
            const meus = doSlot.filter((i) => i.possui).length
            return (
              <button
                key={p.slot}
                type="button"
                role="tab"
                aria-selected={aba === p.slot}
                onClick={() => setAba(p.slot)}
                className={cn(
                  'h-10 shrink-0 rounded-lg border px-3.5 text-sm font-medium transition-colors',
                  aba === p.slot
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                {p.rotulo}
                <span className="ml-1.5 text-xs tabular-nums opacity-70">
                  {meus}/{doSlot.length}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {isPending && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
      {isError && <EstadoErro mensagem="Não deu para carregar a coleção." aoTentarDeNovo={refetch} />}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <ul className="grid grid-cols-2 gap-2">
        {/* Tirar tem que ser tao facil quanto vestir: a opcao de nada e o primeiro
            cartao da grade, no mesmo formato dos outros. */}
        {temNenhum && (
          <li
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border bg-card p-3 shadow-sm',
              vazio ? 'border-primary' : 'border-border',
            )}
          >
            <span className="flex h-20 items-end justify-center">
              <span
                aria-hidden
                className="size-20 rounded-lg border-2 border-dashed border-border"
              />
            </span>

            <span className="text-center text-sm font-medium leading-tight">Nenhum</span>

            <Botao
              variante={vazio ? 'secundario' : 'primario'}
              className="w-full"
              disabled={vazio}
              carregando={equipar.isPending && equipar.variables?.id === null}
              onClick={() => equipar.mutate({ id: null, slot: aba })}
            >
              {vazio ? 'Vestido' : 'Vestir'}
            </Botao>
          </li>
        )}

        {daAba.map((item) => (
          <CartaoPeca
            key={item.id}
            item={item}
            perfil={perfil}
            equipado={equipadoNoSlot(item.slot) === item.id}
            ouro={ouro}
            ocupado={
              (comprar.isPending && comprar.variables === item.id) ||
              (equipar.isPending && equipar.variables?.id === item.id)
            }
            aoComprar={() =>
              item.slot === 'personagem'
                ? equipar.mutate({ id: item.id, slot: 'personagem' })
                : comprar.mutate(item.id)
            }
            aoEquipar={(tirar) =>
              equipar.mutate({ id: tirar ? null : item.id, slot: item.slot })
            }
          />
        ))}
      </ul>
    </div>
  )
}

function CartaoPeca({
  item,
  perfil,
  equipado,
  ouro,
  ocupado,
  aoComprar,
  aoEquipar,
}: {
  item: ItemLoja
  perfil: Perfil | undefined
  equipado: boolean
  ouro: number
  ocupado: boolean
  aoComprar: () => void
  aoEquipar: (tirar: boolean) => void
}) {
  const peca = POR_ID.get(item.id)
  const pode = ouro >= item.custo_ouro
  // Personagem não tem botão de tirar: sempre existe um vestido.
  const podeTirar = equipado && item.slot !== 'personagem'

  return (
    <li
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border bg-card p-3 shadow-sm',
        equipado ? 'border-primary' : 'border-border',
      )}
    >
      <span className="flex h-20 items-end justify-center">
        {item.slot === 'personagem' ? (
          <Avatar base={item.id} tamanho={76} />
        ) : item.slot === 'acessorio' ? (
          <Avatar base={perfil?.avatar_base} item={item.id} tamanho={76} />
        ) : (
          <img
            src={peca?.arquivo}
            alt=""
            aria-hidden
            draggable={false}
            className="size-20 object-contain [image-rendering:pixelated]"
          />
        )}
      </span>

      <span className="text-center text-sm font-medium leading-tight">{item.nome}</span>
      {peca && item.slot === 'personagem' && (
        <span className="text-center text-xs text-muted-foreground">{peca.familia}</span>
      )}

      {!item.possui && (
        <Botao
          variante={pode ? 'primario' : 'secundario'}
          disabled={!pode}
          carregando={ocupado}
          className="w-full"
          onClick={aoComprar}
        >
          <Coins className="size-4" />
          {item.custo_ouro}
        </Botao>
      )}

      {item.possui && (
        <Botao
          variante={equipado ? 'secundario' : 'primario'}
          className="w-full"
          disabled={equipado && !podeTirar}
          carregando={ocupado}
          onClick={() => aoEquipar(podeTirar)}
        >
          {equipado ? (podeTirar ? 'Tirar' : 'Vestido') : 'Vestir'}
        </Botao>
      )}
    </li>
  )
}
