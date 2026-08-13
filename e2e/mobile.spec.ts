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

    // Passo 3: grupo. A permissao de notificacao saiu daqui de proposito e
    // hoje vive em Ajustes, entao ela nao pode voltar a aparecer no onboarding.
    await expect(page.getByRole('heading', { name: 'Chame alguém' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ativar notificações/ })).toHaveCount(0)
    await verificarSemTopo(page, '/onboarding passo 3 grupo')
    await page.getByLabel('Criar um grupo').fill(`Turma ${carimbo}`)
    await page.getByRole('button', { name: 'Criar grupo' }).click()

    // Passo 4: tour guiado, uma tela por toque.
    await expect(page.getByRole('heading', { name: 'Conheça o app' })).toBeVisible()
    await verificarSemTopo(page, '/onboarding passo 4 tour')
    for (let i = 0; i < 4; i += 1) {
      await page.getByRole('button', { name: /Ver a próxima tela|Terminar o tour/ }).click()
    }

    // Passo 5: instalar. O navegador do teste nao roda instalado, entao o passo
    // aparece; num aparelho com o app instalado ele e pulado.
    await expect(page.getByRole('heading', { name: 'Instale o Crias' })).toBeVisible()
    await verificarSemTopo(page, '/onboarding passo 5 instalar')
    await page.getByRole('button', { name: 'Entrar no app' }).click()

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

    // Trilha, o botao redondo no centro do menu.
    await page.getByRole('link', { name: 'Trilha' }).click()
    await page.waitForURL('**/trilha')
    await expect(page.getByRole('heading', { name: 'Sua trilha' })).toBeVisible()
    await verificarTela(page, '/trilha')

    // Ajustes.
    await page.getByRole('link', { name: 'Ajustes' }).click()
    await page.waitForURL('**/configuracoes')
    await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
    await expect(page.getByText(EMAIL)).toBeVisible()
    await verificarTela(page, '/configuracoes')

    await verificarMenuFixo(page, '/configuracoes')

    // Volta para Hoje: rota trocada tem que voltar ao topo.
    await page.getByRole('link', { name: 'Hoje' }).click()
    await page.waitForURL('**/hoje')
    await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible()
    await verificarTela(page, '/hoje apos rolar em /configuracoes')

    await verificarMenuFixo(page, '/hoje')
  })
})

/**
 * O menu inferior tem que continuar colado no rodape depois de rolar, e nenhum
 * conteudo pode terminar por baixo dele.
 *
 * Bug real ja visto no Safari do iPhone: com `position: fixed` e o body rolando,
 * o menu descia junto com a pagina e os ultimos elementos ficavam escondidos.
 */
async function verificarMenuFixo(page: Page, tela: string) {
  const conteudo = page.locator('#conteudo')
  const nav = page.locator('nav').last()

  const antes = await nav.boundingBox()
  await conteudo.evaluate((el) => el.scrollBy(0, 2000))
  await page.waitForTimeout(300)
  const depois = await nav.boundingBox()

  expect(antes, `${tela}: menu deveria existir`).toBeTruthy()
  expect(depois, `${tela}: menu deveria continuar na tela apos rolar`).toBeTruthy()
  expect(
    Math.abs((depois?.y ?? 0) - (antes?.y ?? 0)),
    `${tela}: o menu se moveu ao rolar a pagina`,
  ).toBeLessThan(2)

  const altura = page.viewportSize()?.height ?? 0
  expect(
    (depois?.y ?? 0) + (depois?.height ?? 0),
    `${tela}: o menu nao esta encostado no rodape`,
  ).toBeLessThanOrEqual(altura + 1)

  // A area que rola tem que terminar onde o menu comeca. Enquanto isso valer,
  // nenhum conteudo consegue ficar escondido atras dele: o que passa da borda
  // e recortado pela propria area, e o usuario alcanca rolando.
  const caixaConteudo = await conteudo.boundingBox()
  expect(
    (caixaConteudo?.y ?? 0) + (caixaConteudo?.height ?? 0),
    `${tela}: a area de conteudo invade o espaco do menu`,
  ).toBeLessThanOrEqual((depois?.y ?? 0) + 1)

  // E o fim da lista tem que ser alcancavel: rolando ate embaixo, o ultimo
  // elemento precisa terminar acima do menu.
  const fimVisivel = await conteudo.evaluate((el) => {
    el.scrollTop = el.scrollHeight
    const ultimo = el.lastElementChild?.lastElementChild
    if (!ultimo) return true
    return ultimo.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1
  })
  expect(fimVisivel, `${tela}: o fim do conteudo nao e alcancavel`).toBe(true)
}
