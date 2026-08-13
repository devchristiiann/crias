import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  aberta: boolean
  aoFechar: () => void
  titulo: string
  children: ReactNode
}

/**
 * Folha inferior sobre `<dialog>` nativo.
 *
 * O elemento nativo ja entrega trava de foco, fechar no ESC, backdrop e
 * inerte no resto da pagina. Uma biblioteca de modal so repetiria isso.
 * `max-h-[85svh]` com `overflow-y-auto` garante que a folha nunca ultrapassa
 * a viewport, inclusive com a barra do navegador mobile aberta.
 */
export function Folha({ aberta, aoFechar, titulo, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (aberta && !dialogo.open) dialogo.showModal()
    if (!aberta && dialogo.open) dialogo.close()
  }, [aberta])

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onClick={(e) => {
        // Clique no backdrop fecha. O <dialog> reporta o proprio elemento como alvo.
        if (e.target === ref.current) aoFechar()
      }}
      className="w-full max-w-lg rounded-t-2xl border border-border bg-card p-0
                 text-foreground shadow-xl backdrop:bg-black/50
                 open:animate-in open:slide-in-from-bottom-4"
      style={{ marginBottom: 0, marginTop: 'auto' }}
    >
      <div className="flex max-h-[85svh] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </dialog>
  )
}
