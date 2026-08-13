import { Camera, Check, Coins, Flame, Users } from 'lucide-react'
import type { OcorrenciaHoje } from '@/hooks/useOcorrenciasHoje'
import { horaCurta } from '@/lib/data'
import { rotuloFrequencia } from '@/lib/frequencia'
import { iconeDoHabito } from '@/lib/icones'
import { cn } from '@/lib/utils'

export function CardOcorrencia({
  ocorrencia,
  aoAbrir,
}: {
  ocorrencia: OcorrenciaHoje
  aoAbrir: () => void
}) {
  const Icone = iconeDoHabito(ocorrencia.icone)
  const feito = ocorrencia.status === 'feito'
  const atrasado = ocorrencia.status === 'atrasado'
  const parcial = ocorrencia.vezes_alvo > 1

  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm',
        'transition-colors hover:bg-accent',
        feito && 'opacity-60',
        atrasado ? 'border-destructive/40' : 'border-border',
      )}
    >
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-lg',
          feito ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
        )}
      >
        {feito ? <Check className="size-5" /> : <Icone className="size-5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate font-medium', feito && 'line-through')}>
            {ocorrencia.titulo}
          </span>
          {ocorrencia.streak > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-warning">
              <Flame className="size-3.5" />
              {ocorrencia.streak}
            </span>
          )}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{rotuloFrequencia(ocorrencia.regra)}</span>
          {ocorrencia.lembrete && <span>{horaCurta(ocorrencia.lembrete)}</span>}
          {parcial && (
            <span className="font-medium text-foreground">
              {ocorrencia.vezes_feitas} de {ocorrencia.vezes_alvo}
            </span>
          )}
          {ocorrencia.grupoNome && (
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {ocorrencia.feitosNoGrupo} de {ocorrencia.totalGrupo}
            </span>
          )}
          {ocorrencia.grupoExigeFoto && (
            <span className="flex items-center gap-1">
              <Camera className="size-3" />
              <span className="sr-only">Precisa de foto</span>
            </span>
          )}
          {atrasado && <span className="font-medium text-destructive">Atrasado</span>}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground">
        <Coins className="size-4" />
        {ocorrencia.ouroBase}
      </span>
    </button>
  )
}
