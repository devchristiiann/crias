export const FUSO = 'America/Sao_Paulo'

/** Data civil de hoje em Sao Paulo, no formato AAAA-MM-DD. Toda a app usa esta. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date())
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

/** Horas inteiras que faltam ate o instante informado. Nunca negativo. */
export function horasAte(iso: string): number {
  const restante = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.floor(restante / 3_600_000))
}
