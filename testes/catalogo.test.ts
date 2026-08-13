/**
 * Fica em testes/ e nao em src/ de proposito: usa `node:fs` para conferir que
 * cada caminho do catalogo aponta para um arquivo que existe, e o tsconfig do
 * app so cobre `src` e nao carrega os tipos do Node. Mover para ca sai mais
 * barato que instalar @types/node inteiro so por causa de um teste.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOGO, PERSONAGEM_PADRAO, POR_ID, pecasDoSlot } from '../src/lib/catalogo'

const PUBLICO = join(process.cwd(), 'public')

describe('catalogo de arte', () => {
  it('tem id unico em toda peca', () => {
    const ids = CATALOGO.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // O catalogo aponta caminho de arquivo. Caminho errado nao quebra o build,
  // quebra em silencio na tela do usuario com um sprite invisivel.
  it('aponta para um PNG que existe mesmo', () => {
    const sumidos = CATALOGO.filter((p) => !existsSync(join(PUBLICO, p.arquivo))).map((p) => p.id)
    expect(sumidos).toEqual([])
  })

  it('cobre os quatro slots', () => {
    expect(pecasDoSlot('personagem').length).toBeGreaterThan(0)
    expect(pecasDoSlot('acessorio').length).toBeGreaterThan(0)
    expect(pecasDoSlot('cenario').length).toBeGreaterThan(0)
    expect(pecasDoSlot('fundo').length).toBeGreaterThan(0)
  })

  it('cobra por tudo, senao a loja vira brinde', () => {
    expect(CATALOGO.filter((p) => p.custo <= 0)).toEqual([])
  })

  // Sem faixa inicial gratuita o onboarding trava: a primeira escolha so e de
  // graca ate 200 de ouro, regra que vive em trocar_personagem.
  it('deixa personagem na faixa inicial de ate 200', () => {
    expect(pecasDoSlot('personagem').filter((p) => p.custo <= 200).length).toBeGreaterThanOrEqual(5)
  })

  it('o personagem padrao existe e e da faixa inicial', () => {
    const padrao = POR_ID.get(PERSONAGEM_PADRAO)
    expect(padrao?.slot).toBe('personagem')
    expect(padrao!.custo).toBeLessThanOrEqual(200)
  })

  // A ancora e o que faz o chapeu sentar na cabeca. Personagem sem ancora
  // recebe acessorio no lugar errado, e isso nao aparece no typecheck.
  it('todo personagem tem ancora de cabeca e de mao', () => {
    const semAncora = pecasDoSlot('personagem')
      .filter((p) => !p.ancoraCabeca || !p.ancoraMao)
      .map((p) => p.id)
    expect(semAncora).toEqual([])
  })

  it('nenhum sprite passa do tamanho que o pipeline promete', () => {
    const grandes = CATALOGO.filter((p) => p.largura > 384 || p.altura > 384).map((p) => p.id)
    expect(grandes).toEqual([])
  })
})
