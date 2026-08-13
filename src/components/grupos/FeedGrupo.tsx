import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { ID_CONTEUDO } from '@/components/layout/AppShell'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { useFeedGrupo, type ItemFeed } from '@/hooks/useFeedGrupo'
import type { DetalheGrupo, MembroGrupo } from '@/hooks/useGrupos'
import { dataHoraSP } from '@/lib/data'
import { iconeDoHabito } from '@/lib/icones'

/**
 * Quanto antes do fim da lista a proxima pagina comeca a ser buscada. Esperar o
 * ultimo item entrar na tela faria a pessoa ver o carregando toda vez.
 */
const ANTECEDENCIA = '300px'

/**
 * Foto aberta em tela cheia sobre `<dialog>` nativo, como a `Folha`.
 *
 * O elemento nativo ja traz backdrop, ESC e trava de foco. A guarda no
 * `showModal` e a mesma paga na `Folha`: Safari antigo lanca, e sem ela o React
 * derruba a arvore inteira e a pessoa fica com tela branca no lugar da foto.
 */
function FotoAmpliada({
  foto,
  aoFechar,
}: {
  foto: { url: string; alt: string } | null
  aoFechar: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    try {
      if (foto && !dialogo.open) dialogo.showModal()
      if (!foto && dialogo.open) dialogo.close()
    } catch {
      dialogo.open = Boolean(foto)
    }
  }, [foto])

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onClick={aoFechar}
      className="max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/85"
      /* `inset: 0` no lugar de `100vw`: em tela com barra de rolagem classica a
         largura da viewport passa da largura util e nasce scroll horizontal. */
      style={{ inset: 0, width: 'auto', height: 'auto', margin: 0 }}
    >
      <div className="flex h-full w-full items-center justify-center p-3">
        {foto && (
          // Toque no fundo fecha, toque na propria foto nao: quem abriu a
          // comprovacao quer olhar para ela, e o dedo cai em cima dela.
          <img
            src={foto.url}
            alt={foto.alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        )}
      </div>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar"
        className="absolute right-3 flex size-11 items-center justify-center rounded-full
                   bg-black/60 text-white"
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <X className="size-5" />
      </button>
    </dialog>
  )
}

function CartaoFeed({
  item,
  membro,
  desafio,
  aoAmpliar,
}: {
  item: ItemFeed
  membro: MembroGrupo | undefined
  desafio: DetalheGrupo['desafios'][number] | undefined
  aoAmpliar: (foto: { url: string; alt: string }) => void
}) {
  const Icone = iconeDoHabito(desafio?.icone ?? '')
  const nome = membro?.nome ?? 'Alguém'
  const titulo = desafio?.titulo ?? 'um desafio'
  const alt = `Comprovação de ${nome} em ${titulo}`
  const fotoUrl = item.fotoUrl

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 p-3">
        {/* Membro que saiu do grupo nao tem avatar para montar. O circulo vazio
            mantem o alinhamento da linha em vez de encolher o cabecalho. */}
        {membro ? (
          <Avatar
            base={membro.avatarBase}
            item={membro.itemEquipado}
            cenario={membro.cenarioEquipado}
            tamanho={36}
          />
        ) : (
          <span className="size-9 shrink-0 rounded-full bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="truncate text-xs text-muted-foreground">{dataHoraSP(item.feitoEm)}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icone className="size-4" />
        </span>
      </div>

      {fotoUrl && (
        <button
          type="button"
          onClick={() => aoAmpliar({ url: fotoUrl, alt })}
          className="block w-full"
          aria-label={`Ampliar ${alt.toLowerCase()}`}
        >
          {/* `loading="lazy"` e o que mantem o feed barato: foto de item que a
              pessoa nunca rolou ate ver nao chega a ser baixada. */}
          <img
            src={fotoUrl}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="h-44 w-full bg-muted object-cover"
          />
        </button>
      )}

      <p className="flex items-center gap-2 px-3 py-2.5 text-sm">
        <Check className="size-4 shrink-0 text-success" />
        <span className="min-w-0 break-words">
          concluiu <span className="font-medium">{titulo}</span>
        </span>
      </p>
    </li>
  )
}

/**
 * Atividade do grupo: quem concluiu o que, quando e com qual comprovacao.
 *
 * Rola sem fim, uma pagina por vez, e a pagina seguinte so e pedida quando a
 * sentinela encosta na tela. Sem isso, um grupo com um ano de historico
 * baixaria centenas de fotos assinadas para mostrar as oito primeiras.
 */
export function FeedGrupo({ grupo }: { grupo: DetalheGrupo }) {
  const ids = useMemo(() => grupo.desafios.map((d) => d.id), [grupo.desafios])
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeedGrupo(grupo.id, ids)
  const [ampliada, setAmpliada] = useState<{ url: string; alt: string } | null>(null)
  const sentinela = useRef<HTMLDivElement>(null)

  const membros = useMemo(() => new Map(grupo.membros.map((m) => [m.id, m])), [grupo.membros])
  const desafios = useMemo(() => new Map(grupo.desafios.map((d) => [d.id, d])), [grupo.desafios])
  // Dedupe por id: check-in novo chegando entre uma pagina e outra pode
  // empurrar a mesma linha para as duas, e id repetido em `key` faz o React
  // desenhar cartao a menos sem avisar.
  const itens = useMemo(() => {
    const porId = new Map<string, ItemFeed>()
    for (const item of (data?.pages ?? []).flatMap((p) => p.itens)) porId.set(item.id, item)
    return [...porId.values()]
  }, [data])

  useEffect(() => {
    const alvo = sentinela.current
    if (!alvo || !hasNextPage) return

    // O `root` e obrigatorio aqui: quem rola e o `<main>`, e com a viewport
    // como raiz o clip dele come a antecedencia antes dela valer, deixando a
    // proxima pagina para quando a sentinela ja esta na tela.
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) void fetchNextPage()
      },
      { root: document.getElementById(ID_CONTEUDO), rootMargin: ANTECEDENCIA },
    )
    observador.observe(alvo)
    return () => observador.disconnect()
    // `isFetchingNextPage` entra na lista para o observador ser refeito quando a
    // busca termina: sem isso, quem para de rolar no meio da carga nunca dispara
    // a proxima, porque a sentinela ja estava intersectando e nao cruza de novo.
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (grupo.desafios.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Atividade
      </h2>

      {isPending && (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && <EstadoErro mensagem="Não deu para carregar a atividade." aoTentarDeNovo={refetch} />}

      {!isPending && !isError && itens.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Ninguém concluiu nada ainda. O primeiro check-in aparece aqui.
        </p>
      )}

      <ul className="space-y-3">
        {itens.map((item) => (
          <CartaoFeed
            key={item.id}
            item={item}
            membro={membros.get(item.usuarioId)}
            desafio={desafios.get(item.habitId)}
            aoAmpliar={setAmpliada}
          />
        ))}
      </ul>

      <div ref={sentinela} aria-hidden="true" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <FotoAmpliada foto={ampliada} aoFechar={() => setAmpliada(null)} />
    </section>
  )
}
