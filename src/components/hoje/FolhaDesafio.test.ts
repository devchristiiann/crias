import { describe, expect, it } from 'vitest'
import type { PremioBau } from '@/hooks/useCheckIn'
import { exigeFotoNoCheckIn } from '@/lib/modulos'
import { detalheDoDesfazer, faceDoPremio, rotuloMarcacao } from './FolhaDesafio'

function premio(parcial: Partial<PremioBau>): PremioBau {
  return { tipo: 'ouro', ouro: 0, item_id: null, repetido: false, ...parcial }
}

describe('faceDoPremio', () => {
  it('sem baú não desenha nada', () => {
    expect(faceDoPremio(null)).toBeNull()
    expect(faceDoPremio(undefined)).toBeNull()
  })

  it('ouro mostra o valor que o servidor mandou', () => {
    expect(faceDoPremio(premio({ tipo: 'ouro', ouro: 137 }))).toEqual({
      visual: 'ouro',
      rotulo: '137 de ouro',
    })
  })

  it('item mostra o sprite e o nome do servidor', () => {
    expect(
      faceDoPremio(premio({ tipo: 'item', item_id: 'ace-1', item_nome: 'Coroa' })),
    ).toEqual({ visual: 'item', rotulo: 'Coroa', itemId: 'ace-1' })
  })

  it('repetido avisa e não promete prêmio', () => {
    const face = faceDoPremio(premio({ tipo: 'ouro', ouro: 0, repetido: true }))
    expect(face?.visual).toBe('repetido')
    expect(face?.rotulo).not.toMatch(/ouro/)
  })

  it('repetido vence o item, mesmo com id vindo junto', () => {
    const face = faceDoPremio(
      premio({ tipo: 'item', item_id: 'ace-1', item_nome: 'Coroa', repetido: true }),
    )
    expect(face?.visual).toBe('repetido')
  })
})

describe('rotuloMarcacao', () => {
  it('água parcial nomeia o copo que vai ser marcado', () => {
    expect(rotuloMarcacao('agua', 2, 5)).toBe('Marcar copo 3 de 5')
  })

  it('água na última marcação avisa que fecha o dia', () => {
    expect(rotuloMarcacao('agua', 4, 5)).toBe('Último copo, fecha o dia')
  })

  it('rotina de uma vez só continua Concluir', () => {
    expect(rotuloMarcacao('livre', 0, 1)).toBe('Concluir')
  })

  it('várias vezes no período conta sem falar em copo', () => {
    expect(rotuloMarcacao('livre', 0, 3)).toBe('Marcar 1 de 3')
    expect(rotuloMarcacao('livre', 2, 3)).toBe('Última marcação, fecha o período')
  })
})

describe('detalheDoDesfazer', () => {
  it('janela devolve ouro e só a marcação de hoje, feita ou não', () => {
    for (const tipo of ['n_por_semana', 'n_por_mes'] as const) {
      for (const feito of [false, true]) {
        const frase = detalheDoDesfazer(tipo, 'livre', feito, 3)
        expect(frase).toMatch(/com o ouro dela/)
        expect(frase).not.toMatch(/sem mexer no ouro/)
        expect(frase).not.toMatch(/Todas as marcações/)
      }
    }
  })

  it('água parcial volta um copo e não mexe no ouro', () => {
    expect(detalheDoDesfazer('diaria', 'agua', false, 5)).toBe('Volta um copo, sem mexer no ouro.')
  })

  it('água fechada derruba o dia inteiro, com o ouro', () => {
    expect(detalheDoDesfazer('diaria', 'agua', true, 5)).toMatch(/Todas as marcações de hoje/)
  })

  it('rotina de uma vez só fala do ouro daquele check-in', () => {
    expect(detalheDoDesfazer('diaria', 'livre', true, 1)).toBe('O ouro deste check-in volta atrás.')
  })
})

describe('exigeFotoNoCheckIn', () => {
  it('água nunca exige foto, nem em grupo que exige', () => {
    expect(exigeFotoNoCheckIn('agua', true)).toBe(false)
  })

  it('acordar e dormir exigem sempre, e grupo continua valendo no resto', () => {
    expect(exigeFotoNoCheckIn('acordar', false)).toBe(true)
    expect(exigeFotoNoCheckIn('dormir', false)).toBe(true)
    expect(exigeFotoNoCheckIn('livre', true)).toBe(true)
    expect(exigeFotoNoCheckIn('livre', false)).toBe(false)
  })
})
