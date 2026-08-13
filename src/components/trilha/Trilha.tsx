import { Check, Gift } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { diaEMes } from '@/lib/data'
import { cn } from '@/lib/utils'

const PASSOS_ADIANTE = 3
const PASSOS_ATRAS = 7
const NOS_POR_BAU = 7

/** Serpentina: o deslocamento horizontal se repete a cada quatro nos. */
const DESLOCAMENTO = ['translate-x-0', 'translate-x-10', 'translate-x-16', 'translate-x-10']

type Estado = 'conquistado' | 'atual' | 'futuro'

interface No {
  indice: number
  estado: Estado
  data?: string
}

function montarNos(diasProdutivos: string[]): No[] {
  const conquistados = diasProdutivos.length
  const nos: No[] = []

  const inicio = Math.max(1, conquistados - PASSOS_ATRAS + 1)
  for (let i = inicio; i <= conquistados; i += 1) {
    nos.push({ indice: i, estado: 'conquistado', data: diasProdutivos[i - 1] })
  }

  nos.push({ indice: conquistados + 1, estado: 'atual' })

  for (let i = 1; i <= PASSOS_ADIANTE; i += 1) {
    nos.push({ indice: conquistados + 1 + i, estado: 'futuro' })
  }

  // Futuro em cima, conquistado embaixo: a trilha sobe conforme o usuario avanca.
  return nos.reverse()
}

export function Trilha({
  diasProdutivos,
  avatarBase,
  itemEquipado,
}: {
  diasProdutivos: string[]
  avatarBase: string
  itemEquipado: string | null
}) {
  const nos = montarNos(diasProdutivos)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      <ol className="mx-auto flex w-fit flex-col items-start gap-1">
        {nos.map((no, posicao) => {
          const bau = no.indice % NOS_POR_BAU === 0
          const ultimo = posicao === nos.length - 1

          return (
            <li
              key={no.indice}
              className={cn(
                'flex items-center gap-3',
                DESLOCAMENTO[no.indice % DESLOCAMENTO.length],
              )}
            >
              <div className="flex flex-col items-center">
                <span
                  aria-label={`Nó ${no.indice}`}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-full border-2 text-sm font-semibold',
                    no.estado === 'conquistado' &&
                      (bau
                        ? 'border-warning bg-warning text-warning-foreground'
                        : 'border-primary bg-primary text-primary-foreground'),
                    no.estado === 'atual' &&
                      'animate-pulse border-primary bg-primary/15 text-primary',
                    no.estado === 'futuro' && 'border-dashed border-muted text-muted-foreground',
                  )}
                >
                  {no.estado === 'conquistado' && bau && <Gift className="size-5" />}
                  {no.estado === 'conquistado' && !bau && <Check className="size-5" />}
                  {no.estado !== 'conquistado' && (bau ? <Gift className="size-5" /> : no.indice)}
                </span>
                {!ultimo && <span className="h-4 w-0.5 bg-border" />}
              </div>

              {no.estado === 'atual' && (
                <Avatar base={avatarBase} item={itemEquipado} tamanho={48} />
              )}
              {no.estado === 'conquistado' && no.data && (
                <span className="text-xs text-muted-foreground">{diaEMes(no.data)}</span>
              )}
              {no.estado === 'futuro' && bau && (
                <span className="text-xs text-muted-foreground">Baú</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
