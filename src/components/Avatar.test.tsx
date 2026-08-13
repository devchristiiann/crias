import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

/**
 * O estado doente e a unica ramificacao visual do Avatar, e ele aparece em
 * quatro telas. Se o filtro cair sobre o selo, o termometro sai sem cor e o
 * sinal vira so "boneco cinza", que e exatamente o que a regra proibe.
 */
describe('Avatar doente', () => {
  it('sadio nao ganha filtro nem selo', () => {
    const { container } = render(<Avatar base="base-01" tamanho={40} />)
    expect(container.querySelector('[class*="grayscale"]')).toBeNull()
    expect(container.textContent).not.toContain('Doente')
  })

  it('doente tira a cor do sprite e mantem o selo fora do filtro', () => {
    const { container } = render(<Avatar base="base-01" tamanho={40} doente />)
    const filtrada = container.querySelector('[class*="grayscale"]')!
    const selo = container.querySelector('svg')!.parentElement!

    expect(filtrada).not.toBeNull()
    expect(filtrada.contains(selo)).toBe(false)
    // Cor nunca e o unico sinal: o texto para leitor de tela vai junto.
    expect(container.textContent).toContain('Doente')
  })
})
