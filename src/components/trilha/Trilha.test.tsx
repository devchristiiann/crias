import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Trilha } from './Trilha'

function dias(quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
}

function classes(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[class]')].flatMap((e) => [...e.classList])
}

describe('Trilha', () => {
  it('nunca anima sem motion-safe', () => {
    const { container } = render(<Trilha diasProdutivos={dias(9)} avatarBase="base-01" itemEquipado={null} />)
    const soltas = classes(container).filter(
      (c) => c.startsWith('animate-') || c === 'scroll-smooth',
    )
    expect(soltas).toEqual([])
  })

  it('pula so quando avanca exatamente um no', () => {
    const props = { avatarBase: 'base-01', itemEquipado: null }
    const { container, rerender } = render(<Trilha diasProdutivos={[]} {...props} />)

    // Primeira carga da consulta: o valor salta de 0 ate o real sem ser conquista.
    rerender(<Trilha diasProdutivos={dias(12)} {...props} />)
    expect(classes(container)).not.toContain('motion-safe:animate-pulo')

    rerender(<Trilha diasProdutivos={dias(13)} {...props} />)
    expect(classes(container)).toContain('motion-safe:animate-pulo')
  })

  it('mantem tudo dentro da faixa, sem estouro horizontal', () => {
    const { container } = render(<Trilha diasProdutivos={dias(30)} avatarBase="base-01" itemEquipado={null} />)
    const faixa = container.querySelector('ol')!
    const largura = Number.parseFloat(faixa.style.width)

    for (const filho of container.querySelectorAll<HTMLElement>('ol [style*="left"]')) {
      expect(Number.parseFloat(filho.style.left)).toBeGreaterThanOrEqual(0)
      expect(Number.parseFloat(filho.style.left)).toBeLessThan(largura)
    }
  })
})
