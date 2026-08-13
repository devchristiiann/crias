export const FUSO = 'America/Sao_Paulo'

/** Data civil de um instante em Sao Paulo, no formato AAAA-MM-DD. */
function diaSP(quando: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(quando)
}

/** Data civil de hoje em Sao Paulo, no formato AAAA-MM-DD. Toda a app usa esta. */
export function hojeSP(): string {
  return diaSP(new Date())
}

/** Soma dias a uma data AAAA-MM-DD sem passar por fuso do navegador. */
export function somarDias(dataSP: string, dias: number): string {
  const [ano, mes, dia] = dataSP.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return d.toISOString().slice(0, 10)
}

export function diaEMes(dataSP: string): string {
  const [, mes, dia] = dataSP.split('-')
  return `${dia}/${mes}`
}

export function horaCurta(hora: string | null): string | null {
  if (!hora) return null
  return hora.slice(0, 5)
}

/** Instanciar o formatador e a parte cara. Uma vez por modulo, nao por linha do feed. */
const HORA_SP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Quando o check-in aconteceu, sempre no fuso de Sao Paulo.
 *
 * "Hoje, 07:42" e "Ontem, 07:42" para os dois dias que a pessoa reconhece de
 * cabeca, e "11/08, 07:42" para o resto. O agora entra por parametro porque
 * relogio dentro da funcao nao se testa.
 */
export function dataHoraSP(iso: string, agora: Date = new Date()): string {
  const quando = new Date(iso)
  const dia = diaSP(quando)
  const hoje = diaSP(agora)
  const hora = HORA_SP.format(quando)

  if (dia === hoje) return `Hoje, ${hora}`
  if (dia === somarDias(hoje, -1)) return `Ontem, ${hora}`
  // Ano so aparece quando muda: "13/08" ao lado de um item de 2026 nao diz se e
  // deste ano ou do passado, e o feed rola para tras sem limite.
  const ano = dia.slice(0, 4) === hoje.slice(0, 4) ? '' : `/${dia.slice(0, 4)}`
  return `${diaEMes(dia)}${ano}, ${hora}`
}

/** Horas inteiras que faltam ate o instante informado. Nunca negativo. */
export function horasAte(iso: string): number {
  const restante = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.floor(restante / 3_600_000))
}
