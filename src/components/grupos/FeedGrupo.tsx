import { Check, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { EnquetesGrupo } from '@/components/grupos/EnquetesGrupo'
import {
  FotoAmpliada,
  FotoComprovacao,
  type FotoAberta,
} from '@/components/grupos/FotoComprovacao'
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

function CartaoFeed({
  item,
  membro,
  desafio,
  aoAmpliar,
}: {
  item: ItemFeed
  membro: MembroGrupo | undefined
  desafio: DetalheGrupo['desafios'][number] | undefined
  aoAmpliar: (foto: FotoAberta) => void
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
            doente={membro.doente}
            adiavel
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

      {fotoUrl && <FotoComprovacao url={fotoUrl} alt={alt} aoAmpliar={aoAmpliar} />}

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
  const [ampliada, setAmpliada] = useState<FotoAberta | null>(null)
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
    <div className="space-y-5">
      {/* Enquete aberta vem antes da atividade: e a unica coisa desta tela que
          tem prazo, e rolar ate ela seria o mesmo que nao existir. */}
      <EnquetesGrupo grupo={grupo} />

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Atividade
        </h2>

        {isPending && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <EstadoErro mensagem="Não deu para carregar a atividade." aoTentarDeNovo={refetch} />
        )}

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
    </div>
  )
}
