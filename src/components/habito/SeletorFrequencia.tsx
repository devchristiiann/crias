import { useState } from 'react'
import { hojeSP } from '@/lib/data'
import type { RegraFrequencia } from '@/lib/frequencia'
import { cn } from '@/lib/utils'

type Tipo = RegraFrequencia['tipo']

const TIPOS: { tipo: Tipo; rotulo: string }[] = [
  { tipo: 'diaria', rotulo: 'Todo dia' },
  { tipo: 'semanal_dias', rotulo: 'Dias da semana' },
  { tipo: 'dias_uteis', rotulo: 'Dias úteis' },
  { tipo: 'n_por_semana', rotulo: 'Vezes na semana' },
  { tipo: 'n_por_mes', rotulo: 'Vezes no mês' },
  { tipo: 'quinzenal', rotulo: 'A cada 15 dias' },
  { tipo: 'mensal_dia', rotulo: 'Dia fixo do mês' },
  { tipo: 'avulsa', rotulo: 'Uma vez só' },
]

const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
// Tres letras se repetem entre os dias, entao a inicial sozinha nao identifica
// nada para leitor de tela. O nome por extenso vai no aria-label.
const DOW_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const UTEIS = [1, 2, 3, 4, 5]
const NOMES_UTEIS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
const UTEIS_EXTENSO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta']

function Chip({
  ativo,
  children,
  rotulo,
  onClick,
}: {
  ativo: boolean
  children: React.ReactNode
  rotulo?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      aria-label={rotulo}
      // min-h-11 e min-w-11: alvo de toque de 44px. Este e o formulario mais
      // tocado do app e ficava em 34px.
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4',
        'text-sm font-medium transition-colors',
        ativo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

export function SeletorFrequencia({
  valor,
  aoMudar,
}: {
  valor: RegraFrequencia
  aoMudar: (r: RegraFrequencia) => void
}) {
  const [diasSemana, setDiasSemana] = useState<number[]>(
    valor.tipo === 'semanal_dias' ? valor.dias : [1, 3, 5],
  )
  const [diasUteis, setDiasUteis] = useState<number[]>(
    valor.tipo === 'dias_uteis' ? valor.dias : UTEIS,
  )

  function trocarTipo(tipo: Tipo) {
    switch (tipo) {
      case 'diaria':
        return aoMudar({ tipo })
      case 'semanal_dias':
        return aoMudar({ tipo, dias: diasSemana })
      case 'dias_uteis':
        return aoMudar({ tipo, dias: diasUteis })
      case 'quinzenal':
        return aoMudar({ tipo, ancora: hojeSP() })
      case 'mensal_dia':
        return aoMudar({ tipo, dia: Number(hojeSP().slice(8)) })
      case 'n_por_semana':
        return aoMudar({ tipo, vezes: 3 })
      case 'n_por_mes':
        return aoMudar({ tipo, vezes: 8 })
      case 'avulsa':
        return aoMudar({ tipo, data: hojeSP() })
    }
  }

  function alternarDia(lista: number[], dia: number) {
    return lista.includes(dia) ? lista.filter((d) => d !== dia) : [...lista, dia].sort()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TIPOS.map(({ tipo, rotulo }) => (
          <Chip key={tipo} ativo={valor.tipo === tipo} onClick={() => trocarTipo(tipo)}>
            {rotulo}
          </Chip>
        ))}
      </div>

      {valor.tipo === 'semanal_dias' && (
        <div className="flex gap-2">
          {DOW.map((letra, dia) => (
            <Chip
              key={dia}
              ativo={valor.dias.includes(dia)}
              rotulo={DOW_EXTENSO[dia]}
              onClick={() => {
                const dias = alternarDia(valor.dias, dia)
                if (dias.length === 0) return
                setDiasSemana(dias)
                aoMudar({ tipo: 'semanal_dias', dias })
              }}
            >
              {letra}
            </Chip>
          ))}
        </div>
      )}

      {valor.tipo === 'dias_uteis' && (
        <div className="flex flex-wrap gap-2">
          {UTEIS.map((dia) => (
            <Chip
              key={dia}
              ativo={valor.dias.includes(dia)}
              rotulo={UTEIS_EXTENSO[dia - 1]}
              onClick={() => {
                const dias = alternarDia(valor.dias, dia)
                if (dias.length === 0) return
                setDiasUteis(dias)
                aoMudar({ tipo: 'dias_uteis', dias })
              }}
            >
              {NOMES_UTEIS[dia - 1]}
            </Chip>
          ))}
        </div>
      )}

      {(valor.tipo === 'n_por_semana' || valor.tipo === 'n_por_mes') && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            Quantas vezes por {valor.tipo === 'n_por_semana' ? 'semana' : 'mês'}
          </span>
          <input
            type="number"
            min={1}
            max={valor.tipo === 'n_por_semana' ? 7 : 31}
            value={valor.vezes}
            onChange={(e) => {
              const vezes = Number(e.target.value)
              if (!Number.isInteger(vezes) || vezes < 1) return
              aoMudar({ ...valor, vezes })
            }}
            className="h-11 w-24 rounded-lg border border-input bg-card px-3
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}

      {valor.tipo === 'mensal_dia' && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Dia do mês</span>
          <input
            type="number"
            min={1}
            max={31}
            value={valor.dia}
            onChange={(e) => {
              const dia = Number(e.target.value)
              if (dia < 1 || dia > 31) return
              aoMudar({ tipo: 'mensal_dia', dia })
            }}
            className="h-11 w-24 rounded-lg border border-input bg-card px-3
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}

      {valor.tipo === 'avulsa' && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Data</span>
          <input
            type="date"
            value={valor.data}
            min={hojeSP()}
            onChange={(e) => aoMudar({ tipo: 'avulsa', data: e.target.value })}
            className="h-11 rounded-lg border border-input bg-card px-3
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}
    </div>
  )
}
