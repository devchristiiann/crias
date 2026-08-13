import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Trilha } from './Trilha'

function dias(quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
}

function classes(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[class]')].flatMap((e) => [...e.classList])
}

const PADRAO = {
  avatarBase: 'base-01',
  itemEquipado: null,
  cenarioEquipado: null,
  fundoEquipado: null,
}

describe('Trilha', () => {
  it('nunca anima sem motion-safe', () => {
    const { container } = render(<Trilha diasProdutivos={dias(9)} {...PADRAO} />)
    const soltas = classes(container).filter(
      (c) => c.startsWith('animate-') || c === 'scroll-smooth',
    )
    expect(soltas).toEqual([])
  })

  it('pula so quando avanca exatamente um no', () => {
    const props = PADRAO
    const { container, rerender } = render(<Trilha diasProdutivos={[]} {...props} />)

    // Primeira carga da consulta: o valor salta de 0 ate o real sem ser conquista.
    rerender(<Trilha diasProdutivos={dias(12)} {...props} />)
    expect(classes(container)).not.toContain('motion-safe:animate-pulo')

    rerender(<Trilha diasProdutivos={dias(13)} {...props} />)
    expect(classes(container)).toContain('motion-safe:animate-pulo')
  })

  it('mantem tudo dentro da faixa, sem estouro horizontal', () => {
    const { container } = render(<Trilha diasProdutivos={dias(30)} {...PADRAO} />)
    const faixa = container.querySelector('ol')!
    const largura = Number.parseFloat(faixa.style.width)

    for (const filho of container.querySelectorAll<HTMLElement>('ol [style*="left"]')) {
      expect(Number.parseFloat(filho.style.left)).toBeGreaterThanOrEqual(0)
      expect(Number.parseFloat(filho.style.left)).toBeLessThan(largura)
    }
  })

  it('so desenha o fundo de perfil quando o id e mesmo de um fundo', () => {
    // A camada do fundo e a unica com object-cover: o Avatar usa object-contain.
    const CAMADA_FUNDO = 'img[data-pixel][class*="object-cover"]'

    const comFundo = render(<Trilha diasProdutivos={dias(3)} {...PADRAO} fundoEquipado="fun-1" />)
    const camada = comFundo.container.querySelector<HTMLImageElement>(CAMADA_FUNDO)
    expect(camada?.getAttribute('src')).toContain('/fundos/')

    // Nada equipado, id de outro slot e id inexistente nao podem virar caixa
    // vazia nem personagem esticado atras da trilha.
    for (const id of [null, 'anf-1', 'fundo-que-nao-existe']) {
      const { container } = render(<Trilha diasProdutivos={dias(3)} {...PADRAO} fundoEquipado={id} />)
      expect(container.querySelector(CAMADA_FUNDO)).toBeNull()
    }
  })
})
