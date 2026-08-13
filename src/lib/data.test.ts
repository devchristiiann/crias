import { describe, expect, it } from 'vitest'
import { dataHoraSP } from './data'

// Sao Paulo e UTC-3 o ano inteiro desde 2019: 10:42Z e 07:42 aqui.
const AGORA = new Date('2026-08-13T15:00:00Z')

describe('dataHoraSP', () => {
  it('mostra hora de Sao Paulo, nao a do UTC', () => {
    expect(dataHoraSP('2026-08-13T10:42:00Z', AGORA)).toBe('Hoje, 07:42')
  })

  it('vira ontem quando o instante cai no dia anterior de Sao Paulo', () => {
    // 02:00Z do dia 13 ainda e 23:00 do dia 12 aqui. Sem o fuso, apareceria hoje.
    expect(dataHoraSP('2026-08-13T02:00:00Z', AGORA)).toBe('Ontem, 23:00')
  })

  it('mostra dia e mes quando passa de ontem', () => {
    expect(dataHoraSP('2026-08-10T13:05:00Z', AGORA)).toBe('10/08, 10:05')
  })

  it('escreve meia-noite como 00:00, nunca 24:00', () => {
    // 03:00Z e exatamente a virada do dia aqui. Formatador com `hour: '2-digit'`
    // ja devolveu "24:00" nessa hora em ICU antigo.
    expect(dataHoraSP('2026-08-13T03:00:00Z', AGORA)).toBe('Hoje, 00:00')
  })

  it('acrescenta o ano quando o check-in e de outro ano', () => {
    expect(dataHoraSP('2025-12-31T12:00:00Z', AGORA)).toBe('31/12/2025, 09:00')
  })
})
