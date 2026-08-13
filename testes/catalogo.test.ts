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

  // A medida e o que faz o chapeu sentar na cabeca e a espada ficar na mao.
  // Personagem sem medida recebe acessorio no lugar errado, e isso nao aparece
  // no typecheck nem quebra o build: aparece so na cara do usuario.
  it('todo personagem tem cabeca, mao e chao medidos', () => {
    const sem = pecasDoSlot('personagem')
      .filter(
        (p) =>
          p.cabecaX === undefined ||
          p.cabecaY === undefined ||
          p.cabecaLargura === undefined ||
          p.maoX === undefined ||
          p.maoY === undefined ||
          p.baseY === undefined,
      )
      .map((p) => p.id)
    expect(sem).toEqual([])
  })

  it('personagem sai sempre na tela padrao de 128 por 128', () => {
    const fora = pecasDoSlot('personagem')
      .filter((p) => p.largura !== 128 || p.altura !== 128)
      .map((p) => `${p.id} ${p.largura}x${p.altura}`)
    expect(fora).toEqual([])
  })

  // Chao comum e o que impede coelho do tamanho de golem. Uns poucos flutuam
  // de proposito, drone e fantasma entre eles, entao a regra e a maioria pisar
  // na mesma linha, nao todo mundo.
  it('a grande maioria pisa na mesma linha de chao', () => {
    const bases = pecasDoSlot('personagem').map((p) => p.baseY!)
    const chao = Math.max(...bases)
    const noChao = bases.filter((b) => chao - b <= 2).length
    expect(noChao).toBeGreaterThanOrEqual(bases.length - 5)
  })

  it('quem flutua nao flutua alto demais', () => {
    const bases = pecasDoSlot('personagem').map((p) => p.baseY!)
    expect(Math.max(...bases) - Math.min(...bases)).toBeLessThanOrEqual(24)
  })

  it('a medida da cabeca fica dentro do teto e do piso do pipeline', () => {
    const fora = pecasDoSlot('personagem')
      .filter((p) => p.cabecaLargura! < 26 || p.cabecaLargura! > 56)
      .map((p) => `${p.id} ${p.cabecaLargura}`)
    expect(fora).toEqual([])
  })

  // Sem encaixe o Avatar trata tudo como chapeu, e foi assim que espada,
  // cajado e raio foram parar na testa da pessoa.
  it('todo acessorio declara onde encosta', () => {
    const sem = pecasDoSlot('acessorio')
      .filter((p) => !p.encaixe)
      .map((p) => p.id)
    expect(sem).toEqual([])
  })

  it('nenhum sprite passa do tamanho que o pipeline promete', () => {
    const grandes = CATALOGO.filter((p) => p.largura > 384 || p.altura > 384).map((p) => p.id)
    expect(grandes).toEqual([])
  })
})
