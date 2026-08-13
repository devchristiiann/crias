import { describe, expect, it } from 'vitest'
import { BASES, CATALOGO_ITENS, ITENS, LADO } from './sprites'

const TODOS = { ...BASES, ...ITENS }

describe('sprites', () => {
  it('toda grade tem 16 linhas', () => {
    for (const [id, sprite] of Object.entries(TODOS)) {
      expect(sprite.grade.length, `sprite ${id}`).toBe(LADO)
    }
  })

  it('toda linha tem exatamente 16 caracteres', () => {
    // Um caractere a mais desloca a linha inteira sem gerar erro nenhum,
    // e o sprite sai torto so na tela. Por isso o teste.
    for (const [id, sprite] of Object.entries(TODOS)) {
      sprite.grade.forEach((linha, y) => {
        expect(linha.length, `sprite ${id} linha ${y}`).toBe(LADO)
      })
    }
  })

  it('todo caractere desenhado existe na paleta', () => {
    for (const [id, sprite] of Object.entries(TODOS)) {
      for (const linha of sprite.grade) {
        for (const caractere of linha) {
          if (caractere === '.') continue
          expect(sprite.paleta[caractere], `sprite ${id} caractere ${caractere}`).toBeTruthy()
        }
      }
    }
  })

  it('toda cor da paleta e hexadecimal valido', () => {
    for (const [id, sprite] of Object.entries(TODOS)) {
      for (const [caractere, cor] of Object.entries(sprite.paleta)) {
        expect(cor, `sprite ${id} caractere ${caractere}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('nenhum sprite fica em branco', () => {
    for (const [id, sprite] of Object.entries(TODOS)) {
      const pintados = sprite.grade.join('').replace(/\./g, '').length
      expect(pintados, `sprite ${id}`).toBeGreaterThan(10)
    }
  })

  it('o catalogo da loja bate com os sprites existentes', () => {
    // Se divergir, a loja mostra um item que renderiza vazio.
    for (const item of CATALOGO_ITENS) {
      expect(ITENS[item.id], `item ${item.id}`).toBeTruthy()
    }
    expect(CATALOGO_ITENS.length).toBe(Object.keys(ITENS).length)
  })

  it('existem seis bases para o onboarding', () => {
    expect(Object.keys(BASES).length).toBe(6)
  })
})
