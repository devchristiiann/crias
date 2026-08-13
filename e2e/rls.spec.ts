import { expect, test } from '@playwright/test'
import { apagarUsuario, comoAdmin, comoUsuario, criarUsuario, logar } from './supabase'

/**
 * Isolamento entre usuarios no banco REAL, batendo na API como um atacante bateria:
 * sem passar pelo front, com o access_token de um usuario tentando alcancar o outro.
 * A UI apenas esconde. Quem tem que negar aqui e o Postgres.
 */

const SENHA = 'senha-de-teste-12345'
const marca = `e2e-rls-${Date.now()}`
const emailA = `${marca}-a@example.com`
const emailB = `${marca}-b@example.com`

let idA: string | null = null
let idB: string | null = null
let tokenA = ''
let tokenB = ''
let ocorrenciaA = ''
let premioA = ''

test.describe.serial('isolamento entre usuarios', () => {
  test.beforeAll(async () => {
    idA = await criarUsuario(emailA, SENHA, 'Usuario A')
    idB = await criarUsuario(emailB, SENHA, 'Usuario B')
    tokenA = await logar(emailA, SENHA)
    tokenB = await logar(emailB, SENHA)

    const habito = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: 'Correr de manha',
        p_regra: { tipo: 'diaria' },
        p_icone: 'target',
        p_lembrete: null,
        p_ouro_base: 10,
        p_group_id: null,
      },
    })
    expect(habito.status, JSON.stringify(habito.corpo)).toBe(200)
    expect(habito.corpo).toMatchObject({ ok: true })

    const ocorrencias = await comoUsuario(
      tokenA,
      '/rest/v1/occurrences?select=id,user_id&order=data_sp.asc&limit=1',
    )
    expect(ocorrencias.status, JSON.stringify(ocorrencias.corpo)).toBe(200)
    expect(
      (ocorrencias.corpo as unknown[]).length,
      'criar_habito precisa gerar ocorrencia',
    ).toBe(1)
    const primeira = (ocorrencias.corpo as { id: string; user_id: string }[])[0]
    expect(primeira.user_id).toBe(idA)
    ocorrenciaA = primeira.id

    const premio = await comoUsuario(tokenA, '/rest/v1/rewards', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { user_id: idA, titulo: 'Cinema no sabado', custo_ouro: 30 },
    })
    expect(premio.status, JSON.stringify(premio.corpo)).toBe(201)
    premioA = (premio.corpo as { id: string }[])[0].id

    // Ouro visivel em A para a leitura cruzada ter o que vazar.
    const ouro = await comoAdmin(`/rest/v1/profiles?id=eq.${idA}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: { ouro: 777 },
    })
    expect(ouro.status, JSON.stringify(ouro.corpo)).toBe(200)
    expect((ouro.corpo as { ouro: number }[])[0].ouro).toBe(777)
  })

  test.afterAll(async () => {
    await apagarUsuario(idA)
    await apagarUsuario(idB)
  })

  test('B nao le occurrences de A', async () => {
    const r = await comoUsuario(
      tokenB,
      `/rest/v1/occurrences?select=id,user_id,status&user_id=eq.${idA}`,
    )
    expect(r.status).toBe(200)
    expect(r.corpo, 'RLS de occurrences deixou vazar linha de outro usuario').toEqual([])

    // Tambem pelo id direto, sem filtro por dono.
    const porId = await comoUsuario(tokenB, `/rest/v1/occurrences?select=id&id=eq.${ocorrenciaA}`)
    expect(porId.corpo).toEqual([])
  })

  test('B nao le profiles.ouro de A', async () => {
    const r = await comoUsuario(tokenB, `/rest/v1/profiles?select=id,nome,ouro&id=eq.${idA}`)
    expect(r.status).toBe(200)
    expect(r.corpo, 'RLS de profiles deixou vazar o perfil de outro usuario').toEqual([])

    // Varredura sem filtro: B so pode enxergar a propria linha.
    const tudo = await comoUsuario(tokenB, '/rest/v1/profiles?select=id,ouro')
    expect((tudo.corpo as { id: string }[]).map((p) => p.id)).toEqual([idB])
  })

  test('B nao le rewards de A', async () => {
    const r = await comoUsuario(tokenB, `/rest/v1/rewards?select=id,titulo,custo_ouro&user_id=eq.${idA}`)
    expect(r.status).toBe(200)
    expect(r.corpo, 'RLS de rewards deixou vazar premio de outro usuario').toEqual([])

    const porId = await comoUsuario(tokenB, `/rest/v1/rewards?select=id&id=eq.${premioA}`)
    expect(porId.corpo).toEqual([])
  })

  test('check_in na ocorrencia de A responde ocorrencia_invalida para B', async () => {
    const r = await comoUsuario(tokenB, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaA, p_foto: null },
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ error: 'ocorrencia_invalida' })

    // E o ouro de A nao pode ter se mexido.
    const perfilA = await comoAdmin(`/rest/v1/profiles?select=ouro&id=eq.${idA}`)
    expect((perfilA.corpo as { ouro: number }[])[0].ouro).toBe(777)
  })

  test('B nao altera o proprio ouro por PATCH em profiles', async () => {
    const antes = await comoAdmin(`/rest/v1/profiles?select=ouro&id=eq.${idB}`)
    const ouroAntes = (antes.corpo as { ouro: number }[])[0].ouro

    const r = await comoUsuario(tokenB, `/rest/v1/profiles?id=eq.${idB}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: { ouro: 999999 },
    })
    expect(
      r.ok,
      `privilegio de coluna deveria barrar o UPDATE de ouro, veio ${r.status} ${JSON.stringify(r.corpo)}`,
    ).toBe(false)

    const depois = await comoAdmin(`/rest/v1/profiles?select=ouro&id=eq.${idB}`)
    expect((depois.corpo as { ouro: number }[])[0].ouro).toBe(ouroAntes)

    // A coluna liberada continua funcionando, senao a trava teria quebrado o app.
    const nome = await comoUsuario(tokenB, `/rest/v1/profiles?id=eq.${idB}`, {
      method: 'PATCH',
      body: { nome: 'Usuario B renomeado' },
    })
    expect(nome.status, JSON.stringify(nome.corpo)).toBe(204)
  })
})
