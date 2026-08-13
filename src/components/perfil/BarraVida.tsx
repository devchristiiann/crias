import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

const VIDA_MAXIMA = 50

export function BarraVida({ vida }: { vida: number }) {
  const proporcao = Math.max(0, Math.min(1, vida / VIDA_MAXIMA))
  const critica = vida <= 20

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Heart className={cn('size-4', critica ? 'text-destructive' : 'text-primary')} />
          Vida
        </span>
        <span className="text-muted-foreground">
          {vida} de {VIDA_MAXIMA}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', critica ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${proporcao * 100}%` }}
        />
      </div>
      {critica && (
        <p className="text-xs text-muted-foreground">
          Vida baixa. Zerando, sua ofensiva volta ao começo e a vida enche de novo.
        </p>
      )}
    </div>
  )
}
