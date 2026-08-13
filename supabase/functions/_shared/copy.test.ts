import { describe, expect, it } from 'vitest'
import { montarCopy, type Contexto, type Toque } from './copy'

const BASE: Contexto = {
  nome: 'Gustavo Calixto',
  habito: 'Academia',
  grupo: 'Corrida',
  streak: 12,
  feitosNoGrupo: 4,
  totalGrupo: 6,
  ouro: 40,
  vida: 40,
  horas: 3,
  feitas: 2,
  alvo: 5,
}

const TOQUES: Toque[] = ['lembrete', 'cutucada', 'noite', 'consequencia', 'alarme']

describe('montarCopy', () => {
  it('e deterministico para a mesma semente', () => {
    expect(montarCopy('noite', BASE, 'abc')).toEqual(montarCopy('noite', BASE, 'abc'))
  })

  it('usa o primeiro nome, nunca o nome inteiro', () => {
    for (const toque of TOQUES) {
      for (const semente of ['a', 'b', 'c', 'd', 'e']) {
        const { titulo, corpo } = montarCopy(toque, BASE, semente)
        expect(`${titulo} ${corpo}`).not.toContain('Gustavo Calixto')
      }
    }
  })

  it('nunca usa hifen ou travessao como pontuacao', () => {
    for (const toque of TOQUES) {
      for (const semente of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const { titulo, corpo } = montarCopy(toque, BASE, semente)
        expect(`${titulo} ${corpo}`).not.toMatch(/ [-–—] /)
      }
    }
  })

  it('nao promete ofensiva quando o streak e zero', () => {
    const semStreak = { ...BASE, streak: 0 }
    for (const semente of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const { titulo, corpo } = montarCopy('noite', semStreak, semente)
      expect(`${titulo} ${corpo}`).not.toMatch(/ofensiva de 0|0 dias de sequência/)
    }
  })

  it('nao inventa grupo quando o habito e individual', () => {
    const semGrupo = { ...BASE, grupo: null, feitosNoGrupo: 0, totalGrupo: 0 }
    for (const semente of ['a', 'b', 'c', 'd']) {
      const { titulo, corpo } = montarCopy('cutucada', semGrupo, semente)
      expect(`${titulo} ${corpo}`).not.toContain('do null')
      expect(`${titulo} ${corpo}`).not.toMatch(/0 de 0/)
    }
  })

  it('sempre traz um numero concreto', () => {
    for (const toque of TOQUES) {
      for (const semente of ['a', 'b', 'c']) {
        const { titulo, corpo } = montarCopy(toque, BASE, semente)
        expect(`${titulo} ${corpo}`).toMatch(/\d/)
      }
    }
  })

  it('o alarme diz o progresso, e nao repete a copy do lembrete', () => {
    const agua = { ...BASE, habito: 'Beber água', feitas: 2, alvo: 5 }
    for (const semente of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const alarme = montarCopy('alarme', agua, semente)
      const texto = `${alarme.titulo} ${alarme.corpo}`
      // Terceiro de cinco: o numero concreto do alarme e o progresso, nunca o
      // ouro do lembrete comum.
      expect(texto).toMatch(/3 de 5|Faltam 3/)
      expect(texto).not.toContain('de ouro')
      expect(alarme).not.toEqual(montarCopy('lembrete', agua, semente))
    }
  })

  it('cabe em duas linhas curtas', () => {
    for (const toque of TOQUES) {
      for (const semente of ['a', 'b', 'c']) {
        const { titulo, corpo } = montarCopy(toque, BASE, semente)
        expect(titulo.length).toBeLessThanOrEqual(60)
        expect(corpo.length).toBeLessThanOrEqual(80)
      }
    }
  })
})
