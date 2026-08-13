import { hojeSP, somarDias } from '@/lib/data'
import { cn } from '@/lib/utils'

const DIAS = 35
const LETRAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/**
 * Grade dos ultimos 35 dias. Celula cheia e dia produtivo.
 * Enquanto a trilha mostra o avanco acumulado, aqui aparece a consistencia
 * recente, inclusive os buracos.
 */
export function CalendarioOfensiva({ diasProdutivos }: { diasProdutivos: string[] }) {
  const produtivos = new Set(diasProdutivos)
  const hoje = hojeSP()
  const dias = Array.from({ length: DIAS }, (_, i) => somarDias(hoje, i - (DIAS - 1)))

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Últimos 35 dias</h2>
        <span className="text-xs text-muted-foreground">
          {dias.filter((d) => produtivos.has(d)).length} produtivos
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {LETRAS.map((letra, i) => (
          <span key={i} className="text-center text-[10px] text-muted-foreground">
            {letra}
          </span>
        ))}
        {dias.map((dia) => {
          const cheio = produtivos.has(dia)
          const ehHoje = dia === hoje
          return (
            <span
              key={dia}
              title={dia}
              className={cn(
                'aspect-square rounded-[4px] border',
                cheio ? 'border-warning bg-warning' : 'border-border bg-muted',
                ehHoje && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
              )}
            />
          )
        })}
      </div>
    </div>
  )
}
