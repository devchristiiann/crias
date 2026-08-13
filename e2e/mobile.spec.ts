import { expect, test, type Page } from '@playwright/test'
import { apagarUsuario, comoAdmin } from './supabase'

/**
 * Percurso completo em 360px contra o backend real: entrar, cadastrar, onboarding
 * e as quatro abas. Em cada tela valem as quatro regras de qualidade mobile do projeto.
 */

const SENHA = 'senha-de-teste-12345'
const carimbo = Date.now()
const NOME = `E2E ${carimbo}`
const EMAIL = `e2e-mobile-${carimbo}@example.com`

let idUsuario: string | null = null

/** As quatro assercoes obrigatorias de toda tela mobile. */
async function verificarTela(page: Page, tela: string) {
  const m = await page.evaluate(() => {
    const raiz = document.documentElement
    return {
      scrollWidth: raiz.scrollWidth,
      clientWidth: raiz.clientWidth,
      scrollY: window.scrollY,
      alturaViewport: window.innerHeight,
      campos: [...document.querySelectorAll('input, select, textarea')].map((c) => ({
        descricao: `${c.tagName.toLowerCase()}${c.getAttribute('type') ? `[type=${c.getAttribute('type')}]` : ''}#${c.id || 's/id'}`,
        fonte: Number.parseFloat(getComputedStyle(c).fontSize),
      })),
      folhas: [...document.querySelectorAll('dialog[open]')].map(
        (d) => d.getBoundingClientRect().bottom,
      ),
    }
  })

  expect(m.scrollWidth, `${tela}: scroll horizontal`).toBeLessThanOrEqual(m.clientWidth)
  expect(m.scrollY, `${tela}: nao abriu no topo`).toBe(0)

  for (const campo of m.campos) {
    expect(campo.fonte, `${tela}: ${campo.descricao} com fonte abaixo de 16px, iOS daria zoom`)
      .toBeGreaterThanOrEqual(16)
  }

  for (const fundo of m.folhas) {
    expect(fundo, `${tela}: folha aberta passa da viewport`).toBeLessThanOrEqual(
      m.alturaViewport + 1,
    )
  }
}

/** So as regras que sobrevivem a um passo interno, onde a rota nao muda. */
async function verificarSemTopo(page: Page, tela: string) {
  const m = await page.evaluate(() => {
    const raiz = document.documentElement
    return {
      scrollWidth: raiz.scrollWidth,
      clientWidth: raiz.clientWidth,
      alturaViewport: window.innerHeight,
      campos: [...document.querySelectorAll('input, select, textarea')].map((c) => ({
        descricao: `${c.tagName.toLowerCase()}${c.getAttribute('type') ? `[type=${c.getAttribute('type')}]` : ''}`,
        fonte: Number.parseFloat(getComputedStyle(c).fontSize),
      })),
      folhas: [...document.querySelectorAll('dialog[open]')].map(
        (d) => d.getBoundingClientRect().bottom,
      ),
    }
  })

  expect(m.scrollWidth, `${tela}: scroll horizontal`).toBeLessThanOrEqual(m.clientWidth)
  for (const campo of m.campos) {
    expect(campo.fonte, `${tela}: ${campo.descricao} com fonte abaixo de 16px`).toBeGreaterThanOrEqual(16)
  }
  for (const fundo of m.folhas) {
    expect(fundo, `${tela}: folha aberta passa da viewport`).toBeLessThanOrEqual(m.alturaViewport + 1)
  }
}

test.describe.serial('percurso mobile em 360px', () => {
  test.afterAll(async () => {
    if (!idUsuario) {
      const r = await comoAdmin(`/rest/v1/profiles?select=id&nome=eq.${encodeURIComponent(NOME)}`)
      idUsuario = (r.corpo as { id: string }[] | null)?.[0]?.id ?? null
    }
    await apagarUsuario(idUsuario)
  })

  test('entrar, cadastrar, onboarding e as quatro abas', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto('/entrar')
    await expect(page.getByRole('heading', { name: 'Crias' })).toBeVisible()
    await verificarTela(page, '/entrar')

    // O caminho para criar conta precisa estar visivel na propria tela de
    // entrada, como alternador, e nao escondido num botao de texto embaixo.
    await expect(page.getByRole('tab', { name: 'Entrar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Esqueci minha senha' })).toBeVisible()

    await page.getByRole('tab', { name: 'Criar conta' }).click()
    await expect(page.getByLabel('Seu nome')).toBeVisible()
    await verificarSemTopo(page, '/entrar (criar conta)')

    await page.getByLabel('Seu nome').fill(NOME)
    await page.getByLabel('E-mail').fill(EMAIL)
    await page.getByLabel('Senha').fill(SENHA)
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click()

    await page.waitForURL('**/onboarding', { timeout: 30_000 })

    const perfil = await comoAdmin(
      `/rest/v1/profiles?select=id&nome=eq.${encodeURIComponent(NOME)}`,
    )
    idUsuario = (perfil.corpo as { id: string }[])[0]?.id ?? null
    expect(idUsuario, 'o trigger deveria ter criado o perfil no cadastro').toBeTruthy()

    // Passo 1 de 4: personagem.
    await expect(page.getByRole('heading', { name: 'Seu personagem' })).toBeVisible()
    await verificarTela(page, '/onboarding passo 1 personagem')
    await page.getByLabel('Como te chamamos').fill(NOME)
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Passo 2 de 4: primeiro habito.
    await expect(page.getByRole('heading', { name: 'Seu primeiro hábito' })).toBeVisible()
    await verificarSemTopo(page, '/onboarding passo 2 habito')
    await page.getByLabel('O que você vai fazer').fill('Beber água')
    await page.getByRole('button', { name: 'Criar e continuar' }).click()

    // Passo 3 de 4: notificacoes.
    await expect(page.getByRole('heading', { name: 'Notificações' })).toBeVisible()
    await verificarSemTopo(page, '/onboarding passo 3 notificacoes')
    await page.getByRole('button', { name: 'Deixar para depois' }).click()

    // Passo 4 de 4: grupo.
    await expect(page.getByRole('heading', { name: 'Chame alguém' })).toBeVisible()
    await verificarSemTopo(page, '/onboarding passo 4 grupo')
    await page.getByLabel('Criar um grupo').fill(`Turma ${carimbo}`)
    await page.getByRole('button', { name: 'Criar grupo' }).click()

    // Aba Hoje.
    await page.waitForURL('**/hoje', { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible()
    await expect(page.getByText('Beber água')).toBeVisible()
    await verificarTela(page, '/hoje')

    // Folha de novo habito: precisa caber na viewport.
    await page.getByRole('button', { name: 'Novo hábito' }).click()
    await expect(page.locator('dialog[open]')).toBeVisible()
    await page.waitForTimeout(400)
    await verificarSemTopo(page, '/hoje com folha aberta')
    await page.getByRole('button', { name: 'Fechar' }).click()
    await expect(page.locator('dialog[open]')).toHaveCount(0)

    // Aba Grupos.
    await page.getByRole('link', { name: 'Grupos' }).click()
    await page.waitForURL('**/grupos')
    await expect(page.getByRole('heading', { name: 'Grupos' })).toBeVisible()
    await expect(page.getByText(`Turma ${carimbo}`)).toBeVisible()
    await verificarTela(page, '/grupos')

    // Aba Loja.
    await page.getByRole('link', { name: 'Loja' }).click()
    await page.waitForURL('**/loja')
    await expect(page.getByRole('heading', { name: 'Loja' })).toBeVisible()
    await verificarTela(page, '/loja')

    // Aba Perfil.
    await page.getByRole('link', { name: 'Perfil' }).click()
    await page.waitForURL('**/perfil')
    await expect(page.getByRole('heading', { name: NOME })).toBeVisible()
    await verificarTela(page, '/perfil')

    // Volta para Hoje: rota trocada tem que voltar ao topo.
    await page.mouse.wheel(0, 600)
    await page.getByRole('link', { name: 'Hoje' }).click()
    await page.waitForURL('**/hoje')
    await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible()
    await verificarTela(page, '/hoje apos rolar em /perfil')
  })
})
