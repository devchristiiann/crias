/**
 * O preco da troca de personagem e caminho de dinheiro: espelha a regra de
 * `trocar_personagem` no banco. Se a tela cobrar diferente do servidor, o
 * usuario ve um preco e paga outro.
 */
import { describe, expect, it } from 'vitest'
import { custoDaTroca } from '../src/pages/MinhaTrilha'

// Ids reais do catalogo: anf-1 custa 150, rob-1 custa 200, rob-3 custa 250 e
// atl-1 custa 1200.
describe('custo da troca de personagem', () => {
  it('nao cobra por personagem que ja e seu, nem o mais caro', () => {
    expect(custoDaTroca('atl-1', true, false)).toBe(0)
  })

  it('nao cobra na primeira escolha ate 200 de ouro', () => {
    expect(custoDaTroca('anf-1', false, true)).toBe(0)
    expect(custoDaTroca('rob-1', false, true)).toBe(0)
  })

  it('cobra na primeira escolha acima de 200 de ouro', () => {
    expect(custoDaTroca('rob-3', false, true)).toBe(250)
    expect(custoDaTroca('atl-1', false, true)).toBe(1200)
  })

  it('cobra o preco do catalogo em toda troca depois da primeira', () => {
    expect(custoDaTroca('anf-1', false, false)).toBe(150)
    expect(custoDaTroca('atl-1', false, false)).toBe(1200)
  })
})
