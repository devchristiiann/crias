import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ANON,
  URL_SUPABASE,
  apagarUsuario,
  comoAdmin,
  comoUsuario,
  criarUsuario,
  logar,
} from './supabase'

/**
 * Os quatro refinamentos de grupo, no banco REAL e pela tela de 360px:
 *
 *   1. Atividade com foto, data e hora, e a foto abrindo em tela cheia.
 *   2. Concluir o desafio de dentro do grupo, igual a tela Hoje.
 *   3. Codigo de convite fora da pagina e dentro de administrar grupo.
 *   4. Quem so tem um grupo cai direto nele, e o Voltar leva para a lista.
 *
 * Dois usuarios criados aqui e apagados no fim. B faz o check-in com foto para
 * A encontrar a comprovacao de outra pessoa no feed: e esse cruzamento que o
 * RLS precisa deixar passar para membro do grupo, e so para ele.
 */

const SENHA = 'senha-de-teste-12345'
const carimbo = Date.now()
const NOME_A = `Grupo A ${carimbo}`
const NOME_B = `Grupo B ${carimbo}`
const emailA = `e2e-grupo-a-${carimbo}@example.com`
const emailB = `e2e-grupo-b-${carimbo}@example.com`
const NOME_GRUPO = `Turma ${carimbo}`
const TITULO_DESAFIO = 'Estudar trinta minutos'

/** PNG 1x1 valido. Arquivo de verdade, so o menor possivel. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const caminhoPng = join(tmpdir(), `crias-e2e-${carimbo}.png`)

let idA = ''
let idB = ''
let grupoId = ''
let codigoConvite = ''

/** O onboarding e outra historia. Conta criada pela API entra direto no app. */
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

async function semScrollHorizontal(page: Page, tela: string) {
  // A folha entra deslizando de baixo. Medir no meio da animacao acusa 16px
  // fora da viewport que nao existem quando ela assenta. Espera so as animacoes
  // que terminam: o giro do carregando roda para sempre.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )

  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    alturaViewport: window.innerHeight,
    folhas: [...document.querySelectorAll('dialog[open]')].map(
      (d) => d.getBoundingClientRect().bottom,
    ),
  }))
  expect(m.scrollWidth, `${tela}: scroll horizontal`).toBeLessThanOrEqual(m.clientWidth)
  for (const fundo of m.folhas) {
    expect(fundo, `${tela}: folha passa da viewport`).toBeLessThanOrEqual(m.alturaViewport + 1)
  }
}

test.describe.serial('refinamentos de grupo', () => {
  test.beforeAll(async () => {
    writeFileSync(caminhoPng, PNG_1X1)

    idA = await criarUsuario(emailA, SENHA, NOME_A)
    idB = await criarUsuario(emailB, SENHA, NOME_B)
    await pularOnboarding(idA)
    await pularOnboarding(idB)
    const tokenA = await logar(emailA, SENHA)
    const tokenB = await logar(emailB, SENHA)

    // Grupo igual ao de producao: com foto obrigatoria no check-in.
    const grupo = await comoUsuario(tokenA, '/rest/v1/rpc/criar_grupo', {
      method: 'POST',
      body: { p_nome: NOME_GRUPO, p_exige_foto: true },
    })
    expect(grupo.status, JSON.stringify(grupo.corpo)).toBe(200)
    grupoId = (grupo.corpo as { id: string }).id
    codigoConvite = (grupo.corpo as { codigo: string }).codigo

    const entrada = await comoUsuario(tokenB, '/rest/v1/rpc/entrar_grupo', {
      method: 'POST',
      body: { p_codigo: codigoConvite },
    })
    expect(entrada.corpo, JSON.stringify(entrada.corpo)).toMatchObject({ ok: true })

    const desafio = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: TITULO_DESAFIO,
        p_regra: { tipo: 'diaria' },
        p_icone: 'book-open',
        p_lembrete: null,
        p_ouro_base: 10,
        p_group_id: grupoId,
      },
    })
    expect(desafio.corpo, JSON.stringify(desafio.corpo)).toMatchObject({ ok: true })
    const habitoId = (desafio.corpo as { id: string }).id

    // B conclui com foto, pela API, exatamente como o app faz: sobe o arquivo
    // para a propria pasta e manda o caminho para a RPC.
    const ocorrencias = await comoUsuario(
      tokenB,
      `/rest/v1/occurrences?select=id&habit_id=eq.${habitoId}&user_id=eq.${idB}&order=data_sp.asc&limit=1`,
    )
    const ocorrenciaB = (ocorrencias.corpo as { id: string }[])[0]?.id
    expect(ocorrenciaB, 'desafio de grupo precisa gerar ocorrencia para o membro').toBeTruthy()

    const caminhoFoto = `${idB}/${ocorrenciaB}.png`
    const envio = await fetch(`${URL_SUPABASE}/storage/v1/object/checkins/${caminhoFoto}`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${tokenB}`, 'Content-Type': 'image/png' },
      body: PNG_1X1,
    })
    expect(envio.status, await envio.text()).toBe(200)

    const checkIn = await comoUsuario(tokenB, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaB, p_foto: caminhoFoto },
    })
    expect(checkIn.corpo, JSON.stringify(checkIn.corpo)).toMatchObject({ completou: true })
  })

  test.afterAll(async () => {
    await apagarUsuario(idB)
    await apagarUsuario(idA)
  })

  test('grupo unico abre sozinho, sem codigo na pagina', async ({ page }) => {
    await entrarNoApp(page, emailA)

    await page.goto('/grupos')
    await expect(page).toHaveURL(new RegExp(`/grupos/${grupoId}$`))
    await expect(page.getByRole('heading', { name: NOME_GRUPO })).toBeVisible()

    // 3. O codigo saiu da pagina do grupo. Ele existe no DOM porque a folha de
    // administrar fica montada e fechada, entao o que se cobra e nao aparecer.
    await expect(page.getByText('Código de convite')).toBeHidden()
    await expect(page.getByText(codigoConvite)).toBeHidden()
    await semScrollHorizontal(page, 'grupo')

    // E vive dentro de administrar grupo.
    await page.getByRole('button', { name: 'Administrar grupo' }).click()
    await expect(page.getByText('Código de convite')).toBeVisible()
    await expect(page.getByText(codigoConvite)).toBeVisible()
    await semScrollHorizontal(page, 'administrar grupo')
    await page.getByRole('button', { name: 'Fechar' }).click()
  })

  test('atividade mostra quem concluiu, quando e a foto em tela cheia', async ({ page }) => {
    await entrarNoApp(page, emailA)
    await page.goto(`/grupos/${grupoId}`)

    const atividade = page.getByRole('heading', { name: 'Atividade' })
    await expect(atividade).toBeVisible()
    // O nome tambem aparece no ranking, acima. O do feed e o ultimo.
    await expect(page.getByText(NOME_B).last()).toBeVisible()
    await expect(page.getByText(`concluiu ${TITULO_DESAFIO}`)).toBeVisible()
    // Data e hora de Sao Paulo. O check-in acabou de acontecer, entao e hoje.
    await expect(page.getByText(/^Hoje, \d{2}:\d{2}$/)).toBeVisible()

    const foto = page.getByRole('img', { name: `Comprovação de ${NOME_B} em ${TITULO_DESAFIO}` })
    await expect(foto).toBeVisible()
    // A foto e de OUTRO membro: se o RLS ou a policy do bucket negasse, a URL
    // assinada nao existiria e a imagem nao teria largura nenhuma.
    await expect
      .poll(() => foto.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)

    await foto.click()
    const ampliada = page.locator('dialog[open] img')
    await expect(ampliada).toBeVisible()
    // Tocar na propria foto nao pode fechar: o dedo cai em cima dela.
    await ampliada.click()
    await expect(ampliada).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(ampliada).toBeHidden()
    await semScrollHorizontal(page, 'atividade')
  })

  test('concluir o desafio de dentro do grupo', async ({ page }) => {
    await entrarNoApp(page, emailA)
    await page.goto(`/grupos/${grupoId}`)

    await page.getByRole('button', { name: new RegExp(TITULO_DESAFIO) }).first().click()
    await expect(page.getByRole('button', { name: 'Concluir' })).toBeVisible()

    // O grupo exige foto: sem ela o proprio botao nasce desabilitado.
    await expect(page.getByRole('button', { name: 'Concluir' })).toBeDisabled()
    // O campo da folha, nao o da capa do grupo, que fica na pagina atras.
    await page.locator('dialog[open] input[type="file"]').setInputFiles(caminhoPng)
    await expect(page.getByRole('button', { name: 'Foto anexada' })).toBeVisible()

    await page.getByRole('button', { name: 'Concluir' }).click()
    await expect(page.getByText(/de ouro\./)).toBeVisible()

    // O feed do grupo passa a mostrar o check-in de quem esta olhando.
    await expect(page.getByText(`concluiu ${TITULO_DESAFIO}`)).toHaveCount(2)
  })

  test('voltar leva para a lista, sem cair de novo no grupo', async ({ page }) => {
    await entrarNoApp(page, emailA)
    await page.goto(`/grupos/${grupoId}`)

    // O Voltar da pagina, nao a aba Grupos do menu: a aba leva para a lista sem
    // o `todos` e o atalho de grupo unico traz a pessoa de volta para ca.
    await page.locator('#conteudo').getByRole('link', { name: 'Grupos' }).click()
    await expect(page).toHaveURL(/\/grupos\?todos=1$/)
    await expect(page.getByRole('button', { name: 'Criar' })).toBeVisible()
    await expect(page.getByText(NOME_GRUPO)).toBeVisible()
    await semScrollHorizontal(page, 'lista de grupos')
  })

  /**
   * O atalho de grupo unico tem um jeito de morder: o dono exclui o unico
   * grupo, a lista ainda tem um item em cache e o atalho devolve a pessoa para
   * dentro do grupo que acabou de sumir, que responde erro de carregamento.
   */
  test('excluir o unico grupo cai na lista vazia, nao de volta no grupo', async ({ page }) => {
    await entrarNoApp(page, emailA)
    await page.goto(`/grupos/${grupoId}`)

    await page.getByRole('button', { name: 'Administrar grupo' }).click()
    await page.getByRole('button', { name: 'Excluir grupo' }).click()
    await page.getByRole('button', { name: 'Excluir', exact: true }).click()

    await expect(page).toHaveURL(/\/grupos\?todos=1$/)
    await expect(page.getByText(/ainda não participa de nenhum grupo/)).toBeVisible()
  })

  /**
   * O feed pagina de oito em oito por cursor. Este e o unico caso que prova o
   * cursor: com uma pagina so, um `getNextPageParam` quebrado passaria batido.
   * Roda por ultimo porque cria um segundo grupo, e o atalho de grupo unico
   * dos casos anteriores depende de A ter exatamente um.
   */
  test('atividade carrega o resto ao rolar', async ({ page }) => {
    const tokenA = await logar(emailA, SENHA)
    const tokenB = await logar(emailB, SENHA)

    const grupo = await comoUsuario(tokenA, '/rest/v1/rpc/criar_grupo', {
      method: 'POST',
      body: { p_nome: `Ritmo ${carimbo}`, p_exige_foto: false },
    })
    const segundoGrupo = (grupo.corpo as { id: string }).id
    await comoUsuario(tokenB, '/rest/v1/rpc/entrar_grupo', {
      method: 'POST',
      body: { p_codigo: (grupo.corpo as { codigo: string }).codigo },
    })

    // Cinco desafios, dois membros: dez conclusoes, mais que uma pagina.
    for (let i = 0; i < 5; i++) {
      const desafio = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
        method: 'POST',
        body: {
          p_titulo: `Ritmo ${i}`,
          p_regra: { tipo: 'diaria' },
          p_icone: 'target',
          p_lembrete: null,
          p_ouro_base: 10,
          p_group_id: segundoGrupo,
        },
      })
      const habito = (desafio.corpo as { id: string }).id
      for (const [token, dono] of [
        [tokenA, idA],
        [tokenB, idB],
      ]) {
        const r = await comoUsuario(
          token,
          `/rest/v1/occurrences?select=id&habit_id=eq.${habito}&user_id=eq.${dono}&order=data_sp.asc&limit=1`,
        )
        const occ = (r.corpo as { id: string }[])[0].id
        const feito = await comoUsuario(token, '/rest/v1/rpc/check_in', {
          method: 'POST',
          body: { p_occ: occ, p_foto: null },
        })
        expect(feito.corpo, JSON.stringify(feito.corpo)).toMatchObject({ completou: true })
      }
    }

    await entrarNoApp(page, emailA)
    await page.goto(`/grupos/${segundoGrupo}`)

    const cartoes = page.getByText(/^concluiu Ritmo \d$/)
    await expect(cartoes).toHaveCount(8)

    // Quem rola e o `<main>`, nao a janela.
    await page.locator('#conteudo').evaluate((e) => e.scrollTo(0, e.scrollHeight))
    await expect(cartoes).toHaveCount(10)
  })

  /**
   * O ranking e por ouro ganho no grupo, nao por ofensiva. Os dois membros aqui
   * ficam com ofensiva 1, entao pelo criterio antigo empatavam e o desempate
   * seria o alfabeto. Quem fez o desafio que vale mais tem que ficar na frente.
   */
  test('ranking segue o ouro, nao a ofensiva', async ({ page }) => {
    const tokenA = await logar(emailA, SENHA)
    const tokenB = await logar(emailB, SENHA)

    const grupo = await comoUsuario(tokenA, '/rest/v1/rpc/criar_grupo', {
      method: 'POST',
      body: { p_nome: `Placar ${carimbo}`, p_exige_foto: false },
    })
    const terceiroGrupo = (grupo.corpo as { id: string }).id
    await comoUsuario(tokenB, '/rest/v1/rpc/entrar_grupo', {
      method: 'POST',
      body: { p_codigo: (grupo.corpo as { codigo: string }).codigo },
    })

    // A pega o desafio barato, B pega o caro.
    const alvos = [
      { titulo: 'Alongar', ouro: 3, token: tokenA, dono: idA },
      { titulo: 'Treino pesado', ouro: 10, token: tokenB, dono: idB },
    ]
    for (const alvo of alvos) {
      const desafio = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
        method: 'POST',
        body: {
          p_titulo: alvo.titulo,
          p_regra: { tipo: 'diaria' },
          p_icone: 'target',
          p_lembrete: null,
          p_ouro_base: alvo.ouro,
          p_group_id: terceiroGrupo,
        },
      })
      const habito = (desafio.corpo as { id: string }).id
      const r = await comoUsuario(
        alvo.token,
        `/rest/v1/occurrences?select=id&habit_id=eq.${habito}&user_id=eq.${alvo.dono}&order=data_sp.asc&limit=1`,
      )
      const feito = await comoUsuario(alvo.token, '/rest/v1/rpc/check_in', {
        method: 'POST',
        body: { p_occ: (r.corpo as { id: string }[])[0].id, p_foto: null },
      })
      expect(feito.corpo, JSON.stringify(feito.corpo)).toMatchObject({ completou: true })
    }

    await entrarNoApp(page, emailA)
    await page.goto(`/grupos/${terceiroGrupo}`)

    await expect(page.getByRole('heading', { name: 'Ranking do mês' })).toBeVisible()

    // A lista do acumulado e de cima para baixo, sem podio embaralhando a ordem.
    const geral = page.getByRole('heading', { name: 'Desde o começo' }).locator('xpath=../..')
    await expect(geral.locator('li').first()).toContainText(NOME_B)
    await expect(geral.locator('li').nth(1)).toContainText('Você')
  })
})
