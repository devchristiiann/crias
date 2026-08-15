import { describe, expect, it } from 'vitest'
import { formatarDuracao, prazo } from './Validacao'

describe('formatarDuracao', () => {
  it('mostra horas e minutos como a pessoa fala', () => {
    expect(formatarDuracao(45)).toBe('45min')
    expect(formatarDuracao(120)).toBe('2h')
    expect(formatarDuracao(135)).toBe('2h15')
    expect(formatarDuracao(65)).toBe('1h05')
  })
})

describe('prazo', () => {
  const agora = new Date('2026-08-13T12:00:00Z')

  it('conta as horas que faltam', () => {
    const p = prazo('2026-08-14T12:00:00Z', agora)
    expect(p).toEqual({ encerrado: false, rotulo: 'Fecha em 24h' })
  })

  it('menos de uma hora nao vira zero', () => {
    expect(prazo('2026-08-13T12:20:00Z', agora).rotulo).toBe('Fecha em menos de 1h')
  })

  it('prazo vencido recolhe os botoes', () => {
    expect(prazo('2026-08-13T11:59:00Z', agora)).toEqual({
      encerrado: true,
      rotulo: 'Prazo encerrado',
    })
  })

  it('sem prazo gravado nao promete tempo nenhum', () => {
    expect(prazo('', agora).encerrado).toBe(true)
  })
})
