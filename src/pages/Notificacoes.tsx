import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Botao } from '@/components/ui/Botao'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { type Notificacao, useMarcarLidas, useNotificacoes } from '@/hooks/useNotificacoes'
import { FUSO } from '@/lib/data'
import { cn } from '@/lib/utils'

/** Data e hora curtas, sempre em São Paulo, nunca no fuso do navegador. */
const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Central de notificações.
 *
 * O push chega com `/hoje?occ=<id>` e a tela Hoje sabe abrir a folha daquele
 * desafio a partir do parâmetro. Por isso o toque aqui navega direto: sem folha
 * no meio do caminho, o dedo cai onde a notificação prometeu.
 */
export function Notificacoes() {
  const { data, isPending, isError, refetch } = useNotificacoes()
  const marcar = useMarcarLidas()
  const navegar = useNavigate()

  const lista = data ?? []
  const naoLidas = lista.filter((n) => n.lida_em === null).length

  function abrir(n: Notificacao) {
    if (n.lida_em === null) marcar.mutate(n.id)
    if (n.url) navegar(n.url)
  }

  return (
    <section className="space-y-5">
      {/* Rota própria, alcançada pelo sino da tela Hoje: sem esta volta a
          única saída seria o menu inferior. */}
      <Link
        to="/hoje"
        className="-my-2 inline-flex min-h-11 items-center gap-1 py-2 text-sm
                   text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Hoje
      </Link>

      {/* O botão fica em linha própria: ao lado do título ele estourava a
          largura de 360px, e nesta tela nada pode empurrar a página de lado. */}
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
        {naoLidas > 0 && (
          <Botao
            variante="secundario"
            carregando={marcar.isPending}
            onClick={() => marcar.mutate(null)}
          >
            Marcar todas como lidas
          </Botao>
        )}
      </header>

      {isPending && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <EstadoErro mensagem="Não deu para carregar suas notificações." aoTentarDeNovo={refetch} />
      )}

      {!isPending && !isError && lista.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Nada por aqui ainda. O que o app enviar para você aparece nesta tela.
        </p>
      )}

      <ul className="space-y-2">
        {lista.map((n) => {
          const lida = n.lida_em !== null
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => abrir(n)}
                className={cn(
                  'flex w-full min-h-11 items-start gap-3 rounded-xl border p-3 text-left shadow-sm',
                  'transition-colors hover:bg-accent focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring',
                  lida ? 'border-border bg-card' : 'border-primary/40 bg-primary/5',
                )}
              >
                {/* A cor não é o único sinal do não lido: o ponto e o peso do
                    título dizem o mesmo para quem não distingue as duas cores. */}
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    lida ? 'bg-transparent' : 'bg-primary',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', lida ? 'font-medium' : 'font-semibold')}>
                    {n.titulo}
                  </span>
                  <span className="block text-sm text-muted-foreground">{n.corpo}</span>
                  <time
                    dateTime={n.criado_em}
                    className="mt-1 block text-xs text-muted-foreground"
                  >
                    {QUANDO.format(new Date(n.criado_em))}
                  </time>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
