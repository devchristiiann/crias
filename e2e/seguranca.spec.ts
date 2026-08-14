import { expect, test } from '@playwright/test'
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
 * Os seis furos que a auditoria adversarial explorou de verdade e que a migration
 * 0013 fechou. Um teste por furo, no banco REAL, batendo na API como o atacante
 * bateu: sem front, sem mock. Se qualquer um voltar, aqui quebra antes do deploy.
 */

const SENHA = 'senha-de-teste-12345'
const marca = `e2e-seg-${Date.now()}`
const emailA = `${marca}-a@example.com`
const emailB = `${marca}-b@example.com`

let idA: string | null = null
let idB: string | null = null
let tokenA = ''
let tokenB = ''
let ocorrenciaHoje = ''
let ocorrenciaFutura = ''

const daquiADias = (dias: number) =>
  new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10)

test.describe.serial('correcoes de seguranca da 0013', () => {
  test.beforeAll(async () => {
    idA = await criarUsuario(emailA, SENHA, 'Usuario A')
    idB = await criarUsuario(emailB, SENHA, 'Usuario B')
    tokenA = await logar(emailA, SENHA)
    tokenB = await logar(emailB, SENHA)

    // B precisa ser colega de grupo de A, senao o teste do token_rapido passaria
    // por RLS de linha e nao provaria nada sobre privilegio de coluna.
    const grupo = await comoUsuario(tokenA, '/rest/v1/rpc/criar_grupo', {
      method: 'POST',
      body: { p_nome: 'Grupo de teste' },
    })
    expect(grupo.status, JSON.stringify(grupo.corpo)).toBe(200)
    const { id: grupoId, codigo } = grupo.corpo as { id: string; codigo: string }

    const entrada = await comoUsuario(tokenB, '/rest/v1/rpc/entrar_grupo', {
      method: 'POST',
      body: { p_codigo: codigo },
    })
    expect(entrada.status, JSON.stringify(entrada.corpo)).toBe(200)
    expect(entrada.corpo).toMatchObject({ ok: true })

    const desafio = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: 'Desafio do grupo',
        p_regra: { tipo: 'diaria' },
        p_icone: 'target',
        p_lembrete: null,
        p_ouro_base: 10,
        p_group_id: grupoId,
      },
    })
    expect(desafio.status, JSON.stringify(desafio.corpo)).toBe(200)
    expect(desafio.corpo).toMatchObject({ ok: true })

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
    const habitoId = (habito.corpo as { id: string }).id

    const hoje = await comoUsuario(
      tokenA,
      `/rest/v1/occurrences?select=id&habit_id=eq.${habitoId}&order=data_sp.asc&limit=1`,
    )
    expect(hoje.status, JSON.stringify(hoje.corpo)).toBe(200)
    expect((hoje.corpo as unknown[]).length, 'criar_habito precisa gerar ocorrencia').toBe(1)
    ocorrenciaHoje = (hoje.corpo as { id: string }[])[0].id

    // Ocorrencia futura pela service_role: usuario comum nao consegue mais criar,
    // e e exatamente esse cenario que a trava de janela precisa recusar.
    const data = daquiADias(30)
    const futura = await comoAdmin('/rest/v1/occurrences', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        habit_id: habitoId,
        user_id: idA,
        data_sp: data,
        inicio_janela: data,
        vence_em: `${data}T23:59:00-03:00`,
      },
    })
    expect(futura.status, JSON.stringify(futura.corpo)).toBe(201)
    ocorrenciaFutura = (futura.corpo as { id: string }[])[0].id
  })

  test.afterAll(async () => {
    await apagarUsuario(idA)
    await apagarUsuario(idB)
  })

  test('usuario comum nao executa as RPCs de manutencao', async () => {
    // O furo do ouro infinito: 400 dias de ocorrencias criadas de uma vez e
    // check-in em todas. A trava e EXECUTE revogado tambem de authenticated.
    const quatrocentos = await comoUsuario(tokenA, '/rest/v1/rpc/gerar_ocorrencias', {
      method: 'POST',
      body: { dias: 400 },
    })
    expect(quatrocentos.status, JSON.stringify(quatrocentos.corpo)).toBe(403)

    // A grafia p_dias sequer casa com a assinatura, entao morre no roteamento.
    // Vale a assercao mesmo assim: o que nao pode e a chamada passar.
    const grafiaErrada = await comoUsuario(tokenA, '/rest/v1/rpc/gerar_ocorrencias', {
      method: 'POST',
      body: { p_dias: 400 },
    })
    expect(grafiaErrada.status, JSON.stringify(grafiaErrada.corpo)).not.toBe(200)

    const atrasadas = await comoUsuario(tokenA, '/rest/v1/rpc/marcar_atrasadas', {
      method: 'POST',
      body: {},
    })
    expect(atrasadas.status, JSON.stringify(atrasadas.corpo)).toBe(403)

    const codigo = await comoUsuario(tokenA, '/rest/v1/rpc/gerar_codigo', {
      method: 'POST',
      body: {},
    })
    expect(codigo.status, JSON.stringify(codigo.corpo)).toBe(403)

    // Nenhuma ocorrencia futura pode ter nascido dessas tentativas.
    const alem = await comoAdmin(
      `/rest/v1/occurrences?select=id&user_id=eq.${idA}&data_sp=gt.${daquiADias(60)}`,
    )
    expect(alem.corpo).toEqual([])
  })

  test('colega de grupo nao le occurrences.token_rapido', async () => {
    // B enxerga as linhas de A pela policy de grupo, e por isso RLS nao basta:
    // o token e a unica autorizacao da acao da notificacao.
    const visiveis = await comoUsuario(
      tokenB,
      `/rest/v1/occurrences?select=id,user_id&user_id=eq.${idA}`,
    )
    expect(visiveis.status).toBe(200)
    expect(
      (visiveis.corpo as unknown[]).length,
      'cenario invalido: B precisa enxergar linha de A para o teste valer',
    ).toBeGreaterThan(0)

    const token = await comoUsuario(tokenB, '/rest/v1/occurrences?select=id,token_rapido')
    expect(
      token.status,
      `privilegio de coluna deveria barrar token_rapido, veio ${JSON.stringify(token.corpo)}`,
    ).toBe(403)

    // As colunas que a tela usa continuam liberadas, senao a trava quebraria o app.
    const tela = await comoUsuario(tokenB, '/rest/v1/occurrences?select=id,status,data_sp')
    expect(tela.status, JSON.stringify(tela.corpo)).toBe(200)
    expect((tela.corpo as unknown[]).length).toBeGreaterThan(0)
  })

  test('check_in recusa foto apontada para a pasta de outro usuario', async () => {
    const alheia = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaHoje, p_foto: `${idB}/qualquer.webp` },
    })
    expect(alheia.status).toBe(200)
    expect(alheia.corpo).toEqual({ error: 'foto_invalida' })

    // O caminho recusado nao pode ter ficado gravado na ocorrencia.
    const gravado = await comoAdmin(
      `/rest/v1/occurrences?select=foto_path,status&id=eq.${ocorrenciaHoje}`,
    )
    expect((gravado.corpo as { foto_path: string | null }[])[0].foto_path).toBeNull()

    // Pasta certa nao basta: o arquivo tem que existir. Sem esta trava, "exigir
    // foto" virava exigir que a pessoa DIGITASSE um caminho.
    const inventada = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaHoje, p_foto: `${idA}/nao-existe.webp` },
    })
    expect(inventada.status).toBe(200)
    expect(inventada.corpo).toEqual({ error: 'foto_invalida' })

    // Pasta certa e arquivo existente ainda nao bastam: o segundo segmento tem
    // que ser a ocorrencia que esta sendo marcada. Sem isso, UMA foto na vida
    // satisfazia `exige_foto` de qualquer rotina, para sempre.
    const deOutraOcorrencia = `${idA}/${crypto.randomUUID()}/arquivo.webp`
    const uploadOutra = await fetch(
      `${URL_SUPABASE}/storage/v1/object/checkins/${deOutraOcorrencia}`,
      {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'image/webp',
          'x-upsert': 'true',
        },
        body: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]),
      },
    )
    expect(uploadOutra.status, await uploadOutra.clone().text()).toBe(200)

    const emprestada = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaHoje, p_foto: deOutraOcorrencia },
    })
    expect(emprestada.status).toBe(200)
    expect(emprestada.corpo, JSON.stringify(emprestada.corpo)).toEqual({ error: 'foto_invalida' })

    const caminho = `${idA}/${ocorrenciaHoje}/arquivo.webp`
    const upload = await fetch(`${URL_SUPABASE}/storage/v1/object/checkins/${caminho}`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'image/webp',
        'x-upsert': 'true',
      },
      body: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]),
    })
    expect(upload.status, await upload.clone().text()).toBe(200)

    const propria = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaHoje, p_foto: caminho },
    })
    expect(propria.status).toBe(200)
    expect(propria.corpo, JSON.stringify(propria.corpo)).toMatchObject({ completou: true })
  })

  test('item_equipado nao muda por PATCH direto em profiles', async () => {
    const antes = await comoAdmin(`/rest/v1/profiles?select=item_equipado&id=eq.${idA}`)
    const equipadoAntes = (antes.corpo as { item_equipado: string | null }[])[0].item_equipado

    const r = await comoUsuario(tokenA, `/rest/v1/profiles?id=eq.${idA}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: { item_equipado: 'item-02' },
    })
    expect(
      r.status,
      `equipar tem que passar por equipar_item, veio ${JSON.stringify(r.corpo)}`,
    ).toBe(403)

    const depois = await comoAdmin(`/rest/v1/profiles?select=item_equipado&id=eq.${idA}`)
    expect((depois.corpo as { item_equipado: string | null }[])[0].item_equipado).toBe(
      equipadoAntes,
    )

    // Nome continua editavel, senao o onboarding quebra.
    const nome = await comoUsuario(tokenA, `/rest/v1/profiles?id=eq.${idA}`, {
      method: 'PATCH',
      body: { nome: 'Usuario A renomeado' },
    })
    expect(nome.status, JSON.stringify(nome.corpo)).toBeLessThan(300)
  })

  test('push_subs recusa endpoint fora dos servicos de push reais', async () => {
    // Endereco de metadados da nuvem: o dispatch buscaria isso com service_role.
    const ssrf = await comoUsuario(tokenA, '/rest/v1/push_subs', {
      method: 'POST',
      body: {
        user_id: idA,
        endpoint: 'http://169.254.169.254/latest/meta-data/',
        p256dh: 'chave-fake',
        auth: 'auth-fake',
      },
    })
    expect(ssrf.status, `constraint deveria barrar, veio ${JSON.stringify(ssrf.corpo)}`).toBe(400)

    const gravado = await comoAdmin(
      `/rest/v1/push_subs?select=endpoint&user_id=eq.${idA}&endpoint=like.http://169.254*`,
    )
    expect(gravado.corpo).toEqual([])

    const legitimo = await comoUsuario(tokenA, '/rest/v1/push_subs', {
      method: 'POST',
      body: {
        user_id: idA,
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        p256dh: 'chave-fake',
        auth: 'auth-fake',
      },
    })
    expect(legitimo.status, JSON.stringify(legitimo.corpo)).toBe(201)
  })

  // O teto de ouro por rotina subiu de 10 para 30 na 0030, e ele vive em tres
  // lugares que precisam concordar: a constraint da tabela, a `criar_habito` e a
  // `config_valida`. O formulario nao conta, porque a RPC e chamavel direto. Sem
  // um caso que passe do teto e outro que encoste nele, um dos tres podia ficar
  // no numero velho e ninguem veria.
  test('criar_habito aceita o teto de ouro e recusa um a mais', async () => {
    const acima = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: 'Ouro acima do teto',
        p_regra: { tipo: 'diaria' },
        p_ouro_base: 31,
        p_group_id: null,
      },
    })
    expect(acima.status).toBe(200)
    expect(acima.corpo).toEqual({ error: 'ouro_base_invalido' })

    const noTeto = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: 'Ouro no teto',
        p_regra: { tipo: 'diaria' },
        p_ouro_base: 30,
        p_group_id: null,
      },
    })
    expect(noTeto.status, JSON.stringify(noTeto.corpo)).toBe(200)
    expect(noTeto.corpo).toMatchObject({ ok: true })
  })

  test('check_in recusa ocorrencia que ainda nao abriu', async () => {
    const r = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaFutura, p_foto: null },
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ error: 'ocorrencia_futura' })

    const depois = await comoAdmin(
      `/rest/v1/occurrences?select=status,vezes_feitas&id=eq.${ocorrenciaFutura}`,
    )
    expect((depois.corpo as { status: string; vezes_feitas: number }[])[0]).toMatchObject({
      status: 'pendente',
      vezes_feitas: 0,
    })
  })
})
