import { expect, test, type Page } from '@playwright/test'
import { apagarUsuario, comoAdmin, comoUsuario, criarUsuario, logar } from './supabase'

/**
 * O feed do grupo ao vivo para quem JA ROLOU.
 *
 * O feed pagina de oito em oito. Enquanto ele invalidava a consulta inteira a
 * cada check-in de colega, quem tinha rolado para a segunda pagina pagava uma
 * consulta por pagina, e a saida de nao invalidar deixava o cartao novo de fora
 * ate a pessoa sair e voltar: check-in de colega sumia do feed ao vivo, que e o
 * coracao social do app.
 *
 * O cenario e o do bug: dez desafios, nove ja concluidos por A, B com o feed
 * aberto e rolado ate a segunda pagina. O decimo check-in de A tem que aparecer
 * na tela de B sem recarregar.
 *
 * Dois usuarios criados e apagados aqui, sem tocar em conta de ninguem.
 */

const SENHA = 'senha-de-teste-12345'
const carimbo = Date.now()
const emailA = `e2e-vivo-a-${carimbo}@example.com`
const emailB = `e2e-vivo-b-${carimbo}@example.com`
const NOME_A = `Vivo A ${carimbo}`
const NOME_GRUPO = `Ao vivo ${carimbo}`

/** Dez desafios: oito enchem a primeira pagina, o nono obriga a segunda. */
const TITULOS = Array.from({ length: 10 }, (_, i) => `Desafio ${String(i + 1).padStart(2, '0')}`)
const AO_VIVO = TITULOS[TITULOS.length - 1]

let idA = ''
let idB = ''
let tokenA = ''
let grupoId = ''
/** Ocorrencia de hoje de A, por titulo do desafio. */
const ocorrenciaDe = new Map<string, string>()

async function pularOnboarding(id: string) {
  const r = await comoAdmin(`/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    body: { personagem_definido: true },
    headers: { Prefer: 'return=minimal' },
  })
  expect(r.ok, JSON.stringify(r.corpo)).toBe(true)
}

async function entrarNoApp(page: Page, email: string) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible()
}

/** Marca o desafio como feito pela API, que e o mesmo caminho do app. */
async function concluir(titulo: string) {
  const r = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
    method: 'POST',
    body: { p_occ: ocorrenciaDe.get(titulo) },
  })
  expect(r.corpo, `${titulo}: ${JSON.stringify(r.corpo)}`).toMatchObject({ completou: true })
}

test.describe.serial('feed do grupo ao vivo', () => {
  test.beforeAll(async () => {
    idA = await criarUsuario(emailA, SENHA, NOME_A)
    idB = await criarUsuario(emailB, SENHA, `Vivo B ${carimbo}`)
    await pularOnboarding(idA)
    await pularOnboarding(idB)
    tokenA = await logar(emailA, SENHA)
    const tokenB = await logar(emailB, SENHA)

    // Sem foto obrigatoria: o que esta em prova e o cartao chegando ao vivo, e
    // nao a comprovacao, que o e2e de grupo ja cobre.
    const grupo = await comoUsuario(tokenA, '/rest/v1/rpc/criar_grupo', {
      method: 'POST',
      body: { p_nome: NOME_GRUPO, p_exige_foto: false },
    })
    expect(grupo.status, JSON.stringify(grupo.corpo)).toBe(200)
    grupoId = (grupo.corpo as { id: string }).id

    const entrada = await comoUsuario(tokenB, '/rest/v1/rpc/entrar_grupo', {
      method: 'POST',
      body: { p_codigo: (grupo.corpo as { codigo: string }).codigo },
    })
    expect(entrada.corpo, JSON.stringify(entrada.corpo)).toMatchObject({ ok: true })

    for (const titulo of TITULOS) {
      const desafio = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
        method: 'POST',
        body: {
          p_titulo: titulo,
          p_regra: { tipo: 'diaria' },
          p_icone: 'book-open',
          p_lembrete: null,
          p_ouro_base: 10,
          p_group_id: grupoId,
        },
      })
      expect(desafio.corpo, JSON.stringify(desafio.corpo)).toMatchObject({ ok: true })

      const habitoId = (desafio.corpo as { id: string }).id
      const ocorrencias = await comoUsuario(
        tokenA,
        `/rest/v1/occurrences?select=id&habit_id=eq.${habitoId}&user_id=eq.${idA}&order=data_sp.asc&limit=1`,
      )
      const ocorrencia = (ocorrencias.corpo as { id: string }[])[0]?.id
      expect(ocorrencia, `${titulo} sem ocorrencia de hoje`).toBeTruthy()
      ocorrenciaDe.set(titulo, ocorrencia)
    }

    // Nove concluidos antes de B abrir a tela. O decimo fica para o teste.
    for (const titulo of TITULOS.slice(0, -1)) await concluir(titulo)
  })

  test.afterAll(async () => {
    await apagarUsuario(idB)
    await apagarUsuario(idA)
  })

  test('check-in de colega aparece para quem ja rolou ate a segunda pagina', async ({ page }) => {
    // A espera pelo Realtime e registrada ANTES de navegar, senao a corrida e
    // com o proprio teste: o check-in de A ia mais rapido que a entrada de B no
    // canal, nao havia ninguem ouvindo, e a falha aparecia como "o feed nao
    // atualizou". Esperar so a conexao abrir nao basta, e foi medido: a suite
    // inteira continuou falhando uma vez a cada tres. O que prova que da para
    // ouvir e a RESPOSTA do servidor ao pedido de entrada no canal, que e o
    // `phx_reply` com status ok.
    const socket = page.waitForEvent('websocket', (ws) => ws.url().includes('/realtime/'))
    await entrarNoApp(page, emailB)
    await page.goto(`/grupos/${grupoId}`)
    const canal = await socket
    await canal.waitForEvent(
      'framereceived',
      (quadro) =>
        typeof quadro.payload === 'string' &&
        quadro.payload.includes('phx_reply') &&
        quadro.payload.includes('"status":"ok"'),
    )
    // A primeira pagina traz os oito mais recentes, do nono para o segundo.
    await expect(page.getByText(`concluiu ${TITULOS[8]}`)).toBeVisible()

    // A segunda pagina so e pedida quando a sentinela encosta na tela. Sem
    // rolar ate ela, o bug nem aparece: com uma pagina so tudo sempre funcionou.
    const items = page.locator('li', { hasText: 'concluiu' })
    await expect(items).toHaveCount(8)
    await page.evaluate(() => {
      const conteudo = document.getElementById('conteudo')
      if (conteudo) conteudo.scrollTop = conteudo.scrollHeight
    })
    await expect(items).toHaveCount(9)
    await expect(page.getByText(`concluiu ${TITULOS[0]}`)).toBeVisible()

    // Marca que so sobrevive se a pagina NAO recarregar.
    await page.evaluate(() => Object.assign(window, { semRecarga: true }))

    await concluir(AO_VIVO)

    await expect(page.getByText(`concluiu ${AO_VIVO}`)).toBeVisible()
    await expect(items).toHaveCount(10)
    expect(await page.evaluate(() => 'semRecarga' in window)).toBe(true)
  })
})
