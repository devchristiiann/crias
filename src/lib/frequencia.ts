import { z } from 'zod'

/**
 * Regra de recorrencia de um habito.
 *
 * `semanal_dias` usa a convencao do Postgres `dow`: 0 domingo a 6 sabado.
 * `dias_uteis` usa `isodow`: 1 segunda a 5 sexta.
 * `n_por_semana` e `n_por_mes` nao tem dia fixo, geram uma ocorrencia por periodo.
 */
export const regraFrequenciaSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('diaria') }),
  z.object({
    tipo: z.literal('semanal_dias'),
    dias: z.array(z.number().int().min(0).max(6)).min(1),
  }),
  z.object({
    tipo: z.literal('dias_uteis'),
    dias: z.array(z.number().int().min(1).max(5)).min(1),
  }),
  z.object({ tipo: z.literal('quinzenal'), ancora: z.string() }),
  z.object({ tipo: z.literal('mensal_dia'), dia: z.number().int().min(1).max(31) }),
  z.object({ tipo: z.literal('n_por_semana'), vezes: z.number().int().min(1).max(7) }),
  z.object({ tipo: z.literal('n_por_mes'), vezes: z.number().int().min(1).max(31) }),
  z.object({ tipo: z.literal('avulsa'), data: z.string() }),
])

export type RegraFrequencia = z.infer<typeof regraFrequenciaSchema>

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const ISODOW = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex']

function dataCurta(iso: string) {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

/** Texto curto para o card. Sem hifen como pontuacao, sem descricao longa. */
export function rotuloFrequencia(r: RegraFrequencia): string {
  switch (r.tipo) {
    case 'diaria':
      return 'Todo dia'
    case 'semanal_dias':
      return [...r.dias].sort((a, b) => a - b).map((d) => DOW[d]).join(', ')
    case 'dias_uteis':
      return r.dias.length === 5
        ? 'Dias úteis'
        : [...r.dias].sort((a, b) => a - b).map((d) => ISODOW[d]).join(', ')
    case 'quinzenal':
      return 'A cada 15 dias'
    case 'mensal_dia':
      return `Todo dia ${r.dia}`
    case 'n_por_semana':
      return `${r.vezes} ${r.vezes === 1 ? 'vez' : 'vezes'} por semana`
    case 'n_por_mes':
      return `${r.vezes} ${r.vezes === 1 ? 'vez' : 'vezes'} por mês`
    case 'avulsa':
      return `Em ${dataCurta(r.data)}`
  }
}
