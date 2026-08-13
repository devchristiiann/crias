import { describe, expect, it } from 'vitest'
import { regraFrequenciaSchema, rotuloFrequencia } from './frequencia'

describe('regraFrequenciaSchema', () => {
  it('rejeita dia da semana invalido', () => {
    expect(regraFrequenciaSchema.safeParse({ tipo: 'semanal_dias', dias: [9] }).success).toBe(false)
  })

  it('rejeita lista de dias vazia', () => {
    expect(regraFrequenciaSchema.safeParse({ tipo: 'semanal_dias', dias: [] }).success).toBe(false)
  })

  it('aceita diaria', () => {
    expect(regraFrequenciaSchema.safeParse({ tipo: 'diaria' }).success).toBe(true)
  })

  it('rejeita tipo desconhecido', () => {
    expect(regraFrequenciaSchema.safeParse({ tipo: 'anual' }).success).toBe(false)
  })

  it('rejeita dia do mes fora do intervalo', () => {
    expect(regraFrequenciaSchema.safeParse({ tipo: 'mensal_dia', dia: 32 }).success).toBe(false)
  })
})

describe('rotuloFrequencia', () => {
  it('descreve diaria', () => {
    expect(rotuloFrequencia({ tipo: 'diaria' })).toBe('Todo dia')
  })

  it('descreve semanal com dias', () => {
    expect(rotuloFrequencia({ tipo: 'semanal_dias', dias: [1, 3, 5] })).toBe('Seg, Qua, Sex')
  })

  it('descreve dias uteis completos', () => {
    expect(rotuloFrequencia({ tipo: 'dias_uteis', dias: [1, 2, 3, 4, 5] })).toBe('Dias úteis')
  })

  it('descreve dias uteis parciais', () => {
    expect(rotuloFrequencia({ tipo: 'dias_uteis', dias: [1, 5] })).toBe('Seg, Sex')
  })

  it('descreve mensal', () => {
    expect(rotuloFrequencia({ tipo: 'mensal_dia', dia: 10 })).toBe('Todo dia 10')
  })

  it('descreve n por semana', () => {
    expect(rotuloFrequencia({ tipo: 'n_por_semana', vezes: 3 })).toBe('3 vezes por semana')
  })

  it('usa singular quando e uma vez', () => {
    expect(rotuloFrequencia({ tipo: 'n_por_mes', vezes: 1 })).toBe('1 vez por mês')
  })

  it('nao usa hifen como pontuacao', () => {
    const todos = [
      rotuloFrequencia({ tipo: 'diaria' }),
      rotuloFrequencia({ tipo: 'quinzenal', ancora: '2026-08-12' }),
      rotuloFrequencia({ tipo: 'avulsa', data: '2026-08-20' }),
    ].join(' ')
    expect(todos).not.toMatch(/ [-–—] /)
  })
})
