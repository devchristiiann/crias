import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Coins, Gift, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { Confirmar } from '@/components/ui/Confirmar'
import { Esqueleto } from '@/components/ui/Esqueleto'
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
  /** Quantas vezes este prêmio já foi resgatado. Vem de `redemptions`. */
  resgates: number
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
  // Null enquanto a carteira nao chegou, nunca zero. Zero e um saldo de
  // verdade: mostrado no lugar do desconhecido, ele diz que a pessoa esta
  // quebrada e desabilita tudo que ela podia comprar.
  const ouro = perfil?.ouro ?? null

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Loja</h1>
          <p className="text-sm text-muted-foreground">Troque ouro por recompensa de verdade.</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-warning/15 px-3 py-2 font-semibold text-warning">
          <Coins className="size-4" />
          {/* Largura minima de quatro digitos: sem ela a pilula inteira encolhe
              quando o esqueleto vira numero, e o bloco pisca de tamanho. */}
          <span className="inline-block min-w-[4ch] text-right tabular-nums">
            {ouro === null ? <Esqueleto className="h-6 w-full bg-warning/30" /> : ouro}
          </span>
        </span>
      </header>

      <Premios ouro={ouro} aoCriar={() => setCriando(true)} criando={criando} setCriando={setCriando} />
      <Colecao ouro={ouro} perfil={perfil} />
    </section>
  )
}

/**
 * Esqueleto de um prêmio, com a MESMA altura da linha de verdade: ícone de
 * 44px na primeira faixa, botão de 44px embaixo. Sem isto a lista inteira e
 * tudo que vem depois dela desciam de uma vez quando a consulta chegava.
 */
function EsqueletoPremio() {
  return (
    <li className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Esqueleto className="size-11 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Esqueleto className="h-4 w-2/3" />
          <Esqueleto className="h-3 w-20" />
        </div>
      </div>
      <Esqueleto className="mt-3 h-11 w-full rounded-lg" />
    </li>
  )
}

function Premios({
  ouro,
  aoCriar,
  criando,
  setCriando,
}: {
  // Null enquanto a carteira nao chegou. Saldo desconhecido nao autoriza
  // resgate: o botao so libera quando existe numero de verdade para comparar.
  ouro: number | null
  aoCriar: () => void
  criando: boolean
  setCriando: (v: boolean) => void
}) {
  const cliente = useQueryClient()
  const { usuarioId } = useSessao()
  const [titulo, setTitulo] = useState('')
  const [custo, setCusto] = useState(50)
  const [erro, setErro] = useState<string | null>(null)
  // Uma instancia de confirmacao por acao, guiada pelo premio escolhido.
  const [aResgatar, setAResgatar] = useState<Premio | null>(null)
  const [aRemover, setARemover] = useState<Premio | null>(null)
  // Resgate gasta ouro e nao entrega nada na tela: sem este aviso o unico
  // sinal era o contador caindo, e a pessoa ficava adivinhando se funcionou.
  const [resgatado, setResgatado] = useState<{ id: string; ouro: number } | null>(null)

  // O aviso some sozinho. O que fica de historico e a contagem de resgates na
  // propria linha do premio, que vem do banco.
  useEffect(() => {
    if (!resgatado) return
    const relogio = setTimeout(() => setResgatado(null), 6000)
    return () => clearTimeout(relogio)
  }, [resgatado])

  const { data: premios, isPending, isError, refetch } = useQuery({
    queryKey: ['premios', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<Premio[]> => {
      const [lista, feitos] = await Promise.all([
        supabase
          .from('rewards')
          .select('id, titulo, custo_ouro')
          .eq('ativo', true)
          .order('custo_ouro', { ascending: true }),
        supabase.from('redemptions').select('reward_id'),
      ])
      if (lista.error) throw lista.error
      if (feitos.error) throw feitos.error
      const contagem = new Map<string, number>()
      for (const f of feitos.data ?? []) {
        contagem.set(f.reward_id, (contagem.get(f.reward_id) ?? 0) + 1)
      }
      return (lista.data ?? []).map((p) => ({ ...p, resgates: contagem.get(p.id) ?? 0 }))
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
      const resposta = data as { error?: string; ouro?: number }
      if (resposta?.error === 'ouro_insuficiente') throw new Error('Ouro insuficiente.')
      if (resposta?.error) throw new Error('Não deu para resgatar agora.')
      return resposta
    },
    // So o numero que a RPC devolveu. A tela nunca recalcula o saldo.
    onSuccess: (resposta, id) => {
      setErro(null)
      setResgatado({ id, ouro: resposta.ouro ?? 0 })
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['premios'] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  const arquivar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rewards').update({ ativo: false }).eq('id', id)
      if (error) throw new Error('Não deu para remover agora.')
    },
    onSuccess: () => {
      setErro(null)
      cliente.invalidateQueries({ queryKey: ['premios'] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Seus prêmios
      </h2>

      {isPending && (
        <>
          <ul aria-busy="true" className="space-y-2">
            <EsqueletoPremio />
            <EsqueletoPremio />
          </ul>
          <Esqueleto className="h-11 w-full rounded-lg" />
        </>
      )}

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
          const pode = ouro !== null && ouro >= p.custo_ouro
          return (
            <li key={p.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              {/* Titulo em cima com a lixeira no canto, Resgatar embaixo em
                  linha propria. Lixeira encostada no botao que a pessoa quer
                  tocar e toque acidental esperando acontecer. */}
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                  <Gift className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{p.titulo}</span>
                  {/* Custo e historico na MESMA linha: uma linha a mais so em
                      premio ja resgatado empurraria o bloco de baixo quando a
                      consulta chega. */}
                  <span className="block text-xs text-muted-foreground">
                    {p.custo_ouro} de ouro
                    {p.resgates > 0 &&
                      `. Resgatado ${p.resgates === 1 ? '1 vez' : `${p.resgates} vezes`}`}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${p.titulo}`}
                  disabled={arquivar.isPending}
                  onClick={() => {
                    setErro(null)
                    setARemover(p)
                  }}
                  className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-md
                             text-muted-foreground transition-colors hover:bg-accent
                             hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <Botao
                variante={pode ? 'primario' : 'secundario'}
                className="mt-3 w-full"
                disabled={!pode}
                carregando={resgatar.isPending && resgatar.variables === p.id}
                aria-label={`Resgatar ${p.titulo}`}
                onClick={() => {
                  setErro(null)
                  setAResgatar(p)
                }}
              >
                Resgatar
              </Botao>

              {resgatado?.id === p.id && (
                <p
                  role="status"
                  className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-sm text-success"
                >
                  <Check className="size-4 shrink-0" />
                  Resgatado. Ficaram {resgatado.ouro} de ouro.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {erro && !criando && !aResgatar && !aRemover && (
        <p className="text-sm text-destructive">{erro}</p>
      )}

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

      {/* Resgatar tira ouro de verdade, entao nunca sai de um toque so. */}
      <Confirmar
        aberta={aResgatar !== null}
        aoFechar={() => setAResgatar(null)}
        titulo={`Resgatar ${aResgatar?.titulo ?? ''}?`}
        detalhe={`Custa ${aResgatar?.custo_ouro ?? 0} de ouro.`}
        rotuloConfirmar="Resgatar"
        carregando={resgatar.isPending}
        erro={erro}
        aoConfirmar={() => {
          if (aResgatar) resgatar.mutate(aResgatar.id, { onSuccess: () => setAResgatar(null) })
        }}
      />

      <Confirmar
        aberta={aRemover !== null}
        aoFechar={() => setARemover(null)}
        titulo={`Remover ${aRemover?.titulo ?? ''}?`}
        detalhe="O prêmio sai da sua lista."
        rotuloConfirmar="Remover"
        perigo
        carregando={arquivar.isPending}
        erro={erro}
        aoConfirmar={() => {
          if (aRemover) arquivar.mutate(aRemover.id, { onSuccess: () => setARemover(null) })
        }}
      />
    </div>
  )
}

const PRATELEIRAS: { slot: Slot; rotulo: string; vazio: string }[] = [
  { slot: 'personagem', rotulo: 'Personagens', vazio: 'Nenhum personagem à venda agora.' },
  { slot: 'acessorio', rotulo: 'Acessórios', vazio: 'Nenhum acessório à venda agora.' },
  { slot: 'cenario', rotulo: 'Cenários', vazio: 'Nenhum cenário à venda agora.' },
  { slot: 'fundo', rotulo: 'Fundos', vazio: 'Nenhum fundo à venda agora.' },
]

/**
 * Esqueleto de uma peça, com a MESMA altura do cartão de personagem, que é a
 * aba de estreia: prévia de 80px, nome, família e botão de 44px. Era esta
 * grade que faltava, e o giro de 20px virando cartão de 207px era o maior
 * pulo de layout do app.
 */
function EsqueletoPeca() {
  return (
    <li className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <Esqueleto className="size-20 rounded-lg" />
      {/* 17.5px e a altura da linha do nome (text-sm com leading-tight), 16px a
          da familia (text-xs). Esqueleto e forma, entao a medida vem daqui. */}
      <Esqueleto className="h-[17.5px] w-20" />
      <Esqueleto className="h-4 w-14" />
      <Esqueleto className="h-11 w-full rounded-lg" />
    </li>
  )
}

/**
 * Coleção: personagem, acessório, cenário e fundo de perfil.
 *
 * O preço e o que existe à venda saem do banco, sempre. O catálogo local só
 * diz onde está o PNG e a que família a peça pertence. Se a peça estiver no
 * banco e não no catálogo, ela simplesmente não aparece, em vez de virar um
 * cartão quebrado.
 */
function Colecao({ ouro, perfil }: { ouro: number | null; perfil: Perfil | undefined }) {
  const cliente = useQueryClient()
  const { usuarioId } = useSessao()
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Slot>('personagem')
  // Uma confirmacao so para a grade inteira: quem manda e a peca escolhida.
  const [escolhida, setEscolhida] = useState<ItemLoja | null>(null)

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

  const escolher = (item: ItemLoja) => {
    setErro(null)
    setEscolhida(item)
  }

  /**
   * So chega aqui quem esta comprando de verdade: personagem passa por
   * `equipar_item`, porque a primeira aquisicao ja veste, e o resto por
   * `comprar_item`. Peca que ja e do usuario nunca abre confirmacao.
   */
  const confirmarEscolha = () => {
    if (!escolhida) return
    if (escolhida.slot === 'personagem') {
      equipar.mutate(
        { id: escolhida.id, slot: 'personagem' },
        { onSuccess: () => setEscolhida(null) },
      )
      return
    }
    comprar.mutate(escolhida.id, { onSuccess: () => setEscolhida(null) })
  }

  const equipadoNoSlot = (slot: Slot) =>
    slot === 'personagem' ? perfil?.avatar_base
      : slot === 'acessorio' ? perfil?.item_equipado
      : slot === 'cenario' ? perfil?.cenario_equipado
      : perfil?.fundo_equipado

  const daAba = (itens ?? []).filter((i) => i.slot === aba)
  // Personagem sempre tem um vestido, entao so os outros slots ganham a opcao de nada.
  const temNenhum = aba !== 'personagem'
  const vazio = !equipadoNoSlot(aba)
  const semPecas = !isPending && !isError && daAba.length === 0

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sua coleção
      </h2>

      {/* Rolagem horizontal fica presa aqui dentro: a pagina nunca rola de lado. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2">
          {PRATELEIRAS.map((p) => {
            // O que importa para quem coleciona e quanto ja e seu, nao quanto existe.
            const doSlot = (itens ?? []).filter((i) => i.slot === p.slot)
            const meus = doSlot.filter((i) => i.possui).length
            return (
              <button
                key={p.slot}
                type="button"
                aria-pressed={aba === p.slot}
                onClick={() => setAba(p.slot)}
                className={cn(
                  'h-11 shrink-0 rounded-lg border px-3.5 text-sm font-medium transition-colors',
                  aba === p.slot
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                {p.rotulo}
                {/* Largura reservada para a maior contagem possivel: sem ela a
                    aba muda de tamanho quando o numero chega e empurra as
                    vizinhas de lado. */}
                <span className="ml-1.5 inline-block min-w-[2.5rem] text-right text-xs tabular-nums opacity-70">
                  {isPending ? (
                    <Esqueleto className="h-3 w-full bg-current opacity-40" />
                  ) : (
                    `${meus}/${doSlot.length}`
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {isError && <EstadoErro mensagem="Não deu para carregar a coleção." aoTentarDeNovo={refetch} />}
      {erro && !escolhida && <p className="text-sm text-destructive">{erro}</p>}

      {isPending && (
        <ul aria-busy="true" className="grid grid-cols-2 gap-2">
          <EsqueletoPeca />
          <EsqueletoPeca />
          <EsqueletoPeca />
          <EsqueletoPeca />
          <EsqueletoPeca />
          <EsqueletoPeca />
        </ul>
      )}

      {!isPending && !isError && (
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
              aoComprar={() => escolher(item)}
              // Vestir e tirar peca que ja e sua nao gasta nada e desfaz num
              // toque, entao passa direto, personagem inclusive. Quem confirma e
              // so a compra.
              aoEquipar={(tirar) => {
                setErro(null)
                equipar.mutate({ id: tirar ? null : item.id, slot: item.slot })
              }}
            />
          ))}
        </ul>
      )}

      {/* Aba sem peca nao pode ficar em branco, nem sobrar so o cartao Nenhum:
          quem chega ali precisa saber que a prateleira esta vazia, e nao que a
          tela quebrou. */}
      {semPecas && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {PRATELEIRAS.find((p) => p.slot === aba)?.vazio} Volte depois.
        </p>
      )}

      <Confirmar
        aberta={escolhida !== null}
        aoFechar={() => setEscolhida(null)}
        titulo={`Comprar ${escolhida?.nome ?? ''}?`}
        detalhe={`Custa ${escolhida?.custo_ouro ?? 0} de ouro.`}
        rotuloConfirmar="Comprar"
        carregando={comprar.isPending || equipar.isPending}
        erro={erro}
        aoConfirmar={confirmarEscolha}
      />
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
  ouro: number | null
  ocupado: boolean
  aoComprar: () => void
  aoEquipar: (tirar: boolean) => void
}) {
  const peca = POR_ID.get(item.id)
  const pode = ouro !== null && ouro >= item.custo_ouro
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
          <Avatar base={item.id} tamanho={76} adiavel />
        ) : item.slot === 'acessorio' ? (
          <Avatar base={perfil?.avatar_base} item={item.id} tamanho={76} adiavel />
        ) : item.slot === 'cenario' ? (
          // PNG solto nao mostra o que a pessoa esta comprando: pedestal so
          // vira pedestal com alguem em cima. A previa monta a cena com o
          // personagem que ela ja veste, no mesmo componente da tela.
          <Avatar base={perfil?.avatar_base} cenario={item.id} tamanho={76} adiavel />
        ) : (
          // Fundo nunca aparece solto: na trilha ele sangra por object-cover
          // atras do conteudo, sob o veu que segura o contraste. O PNG cru em
          // object-contain mostrava outra peca, e no tema escuro o miolo
          // transparente do Portal Celeste virava buraco preto.
          <span className="relative block size-20 overflow-hidden rounded-lg border border-border bg-card">
            <img
              src={peca?.arquivo}
              alt=""
              aria-hidden
              draggable={false}
              data-pixel
              loading="lazy"
              decoding="async"
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
            />
            <span aria-hidden className="pointer-events-none absolute inset-0 bg-card/65" />
          </span>
        )}
      </span>

      <span className="text-center text-sm font-medium leading-tight">{item.nome}</span>
      {peca && item.slot === 'personagem' && (
        <span className="text-center text-xs text-muted-foreground">{peca.familia}</span>
      )}

      {!item.possui && (
        // O preco sozinho nao nomeia botao nenhum: dois itens de 400 viravam
        // dois botoes chamados "400" na mesma tela, indistinguiveis para o
        // leitor de tela e ambiguos para o teste.
        <Botao
          variante={pode ? 'primario' : 'secundario'}
          disabled={!pode}
          carregando={ocupado}
          className="w-full"
          aria-label={`Comprar ${item.nome} por ${item.custo_ouro} de ouro`}
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
          aria-label={`${equipado ? (podeTirar ? 'Tirar' : 'Vestido') : 'Vestir'} ${item.nome}`}
          onClick={() => aoEquipar(podeTirar)}
        >
          {equipado ? (podeTirar ? 'Tirar' : 'Vestido') : 'Vestir'}
        </Botao>
      )}
    </li>
  )
}
