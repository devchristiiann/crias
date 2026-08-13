import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

const VIDA_MAXIMA = 50

/**
 * A explicação fica visível sempre, e não só com a vida baixa.
 *
 * Enquanto ela só aparecia no vermelho, a barra era um número que andava
 * sozinho: quem via 50 de 50 nunca descobria o que tirava vida, e quem via a
 * vida encher de novo achava que era bug.
 */
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
      <ul className="space-y-0.5 pt-1 text-xs text-muted-foreground">
        <li>Rotina parada por 24 horas tira 10.</li>
        <li>Recaída de hábito de perda tira 5.</li>
        <li>Vida em zero: toda ofensiva volta ao começo e a vida enche de novo.</li>
      </ul>
    </div>
  )
}
