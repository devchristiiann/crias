import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo'
type Tamanho = 'md' | 'lg'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secundario: 'bg-card text-foreground border border-border hover:bg-accent shadow-sm',
  fantasma: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  perigo: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
}

const TAMANHOS: Record<Tamanho, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-6 text-base',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamanho?: Tamanho
  /** Enquanto true o botao fica travado. E o que impede duplo clique de duplicar efeito. */
  carregando?: boolean
}

export const Botao = forwardRef<HTMLButtonElement, Props>(function Botao(
  { className, variante = 'primario', tamanho = 'md', carregando, disabled, children, ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || carregando}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      {...resto}
    >
      {carregando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
})
