import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string
  erro?: string
}

export const Campo = forwardRef<HTMLInputElement, Props>(function Campo(
  { rotulo, erro, className, id, ...resto },
  ref,
) {
  const gerado = useId()
  const idCampo = id ?? gerado

  return (
    <div className="space-y-1.5">
      <label htmlFor={idCampo} className="block text-sm font-medium">
        {rotulo}
      </label>
      <input
        ref={ref}
        id={idCampo}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${idCampo}-erro` : undefined}
        className={cn(
          'h-11 w-full rounded-lg border border-input bg-card px-3',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:opacity-50',
          erro && 'border-destructive',
          className,
        )}
        {...resto}
      />
      {erro && (
        <p id={`${idCampo}-erro`} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
})
