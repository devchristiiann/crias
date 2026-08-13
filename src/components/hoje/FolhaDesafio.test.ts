import { describe, expect, it } from 'vitest'
import type { PremioBau } from '@/hooks/useCheckIn'
import { faceDoPremio } from './FolhaDesafio'

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
