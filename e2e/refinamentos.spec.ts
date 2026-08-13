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
 * A migration 0019 trouxe RPCs e tabelas novas. Aqui cada uma apanha como um
 * atacante bateria: no banco REAL, pela API REST, com o access_token de quem
 * nao deveria poder. `comoAdmin` so monta e confere o cenario, nunca decide se
 * o isolamento valeu.
 *
 * Tres usuarios, todos criados aqui e apagados no fim:
 *   A  dono de tudo que precisa ser protegido.
 *   B  estranho, sem NENHUM grupo em comum com A. E ele quem tenta atravessar.
 *   C  membro do grupo de A, para os casos que exigem estar dentro do grupo.
 *
 * A ordem dos blocos nao segue a ordem da lista de casos de proposito: C sai do
 * grupo no caso 9, e o caso 16 precisa dele ainda dentro. Sair antes tornaria o
 * 16 um teste que passa pelo motivo errado.
 */

const SENHA = 'senha-de-teste-12345'
const marca = `e2e-ref-${Date.now()}`
const emailA = `${marca}-a@example.com`
const emailB = `${marca}-b@example.com`
const emailC = `${marca}-c@example.com`

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000'
const NOME_GRUPO = 'Grupo com foto'

let idA = ''
let idB = ''
let idC = ''
let tokenA = ''
let tokenB = ''
let tokenC = ''

let ocorrenciaFeitaA = '' // check-in de A que B vai tentar desfazer
let ocorrenciaEconomia = '' // a cobaia da contabilidade de ouro
let ocorrenciaFoto = '' // ocorrencia do desafio do grupo que exige foto
let habitoRuimA = ''
let notificacaoA = ''
let grupoA = ''

const ouroDe = async (id: string) => {
  const r = await comoAdmin(`/rest/v1/profiles?select=ouro&id=eq.${id}`)
  return (r.corpo as { ouro: number }[])[0].ouro
}

async function criarHabitoPessoal(token: string, titulo: string) {
  const r = await comoUsuario(token, '/rest/v1/rpc/criar_habito', {
    method: 'POST',
    body: {
      p_titulo: titulo,
      p_regra: { tipo: 'diaria' },
      p_icone: 'target',
      p_lembrete: null,
      p_ouro_base: 10,
      p_group_id: null,
    },
  })
  expect(r.status, JSON.stringify(r.corpo)).toBe(200)
  expect(r.corpo, JSON.stringify(r.corpo)).toMatchObject({ ok: true })
  return (r.corpo as { id: string }).id
}

async function ocorrenciaDeHoje(token: string, habito: string, dono: string) {
  const r = await comoUsuario(
    token,
    `/rest/v1/occurrences?select=id&habit_id=eq.${habito}&user_id=eq.${dono}&order=data_sp.asc&limit=1`,
  )
  expect(r.status, JSON.stringify(r.corpo)).toBe(200)
  expect((r.corpo as unknown[]).length, 'habito bom precisa gerar ocorrencia').toBe(1)
  return (r.corpo as { id: string }[])[0].id
}

test.describe.serial('refinamentos da 0019', () => {
  test.beforeAll(async () => {
    idA = await criarUsuario(emailA, SENHA, 'Refino A')
    idB = await criarUsuario(emailB, SENHA, 'Refino B')
    idC = await criarUsuario(emailC, SENHA, 'Refino C')
    tokenA = await logar(emailA, SENHA)
    tokenB = await logar(emailB, SENHA)
    tokenC = await logar(emailC, SENHA)

    // 1) Um check-in ja feito, para B tentar desfazer o que e de A.
    const habitoFeito = await criarHabitoPessoal(tokenA, 'Correr de manha')
    ocorrenciaFeitaA = await ocorrenciaDeHoje(tokenA, habitoFeito, idA)
    const primeiro = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaFeitaA, p_foto: null },
    })
    expect(primeiro.status, JSON.stringify(primeiro.corpo)).toBe(200)
    expect(primeiro.corpo, JSON.stringify(primeiro.corpo)).toMatchObject({ completou: true })
    // Com um check-in do dia ja fechado, nenhum check-in seguinte e o primeiro do
    // dia, entao nenhum abre bau. Sem isso o teste de marcar e desmarcar viraria
    // sorteio, e `bau_aberto` derrubaria o desfazer por outro motivo.
    expect(primeiro.corpo, 'o primeiro check-in nao pode abrir bau').toMatchObject({ bau: false })

    // 2) A cobaia da economia, separada da de cima para nao misturar estados.
    const habitoEconomia = await criarHabitoPessoal(tokenA, 'Ler um capitulo')
    ocorrenciaEconomia = await ocorrenciaDeHoje(tokenA, habitoEconomia, idA)

    // 3) Habito de perda de A, com uma recaida registrada: e ela que povoa
    //    `recaidas` e `vida_eventos` para a leitura cruzada ter o que vazar.
    const ruim = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: 'Rolar o feed',
        p_regra: { tipo: 'diaria' },
        p_icone: 'target',
        p_lembrete: null,
        p_ouro_base: 10,
        p_group_id: null,
        p_tipo: 'ruim',
        p_pune_ouro: false,
      },
    })
    expect(ruim.status, JSON.stringify(ruim.corpo)).toBe(200)
    expect(ruim.corpo, JSON.stringify(ruim.corpo)).toMatchObject({ ok: true })
    habitoRuimA = (ruim.corpo as { id: string }).id

    const recaida = await comoUsuario(tokenA, '/rest/v1/rpc/registrar_recaida', {
      method: 'POST',
      body: { p_habito: habitoRuimA },
    })
    expect(recaida.status, JSON.stringify(recaida.corpo)).toBe(200)
    expect(recaida.corpo, JSON.stringify(recaida.corpo)).toMatchObject({
      ok: true,
      vida_perdida: 5,
      ouro_perdido: 0,
    })

    // 4) Notificacao de A. Quem grava de verdade e o push-dispatch com
    //    service_role, entao o cenario nasce pelo mesmo caminho.
    const notificacao = await comoAdmin('/rest/v1/notificacoes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        user_id: idA,
        titulo: 'Hora de correr',
        corpo: 'Voce tem uma pendencia hoje',
        url: '/hoje',
      },
    })
    expect(notificacao.status, JSON.stringify(notificacao.corpo)).toBe(201)
    notificacaoA = (notificacao.corpo as { id: string }[])[0].id

    // 5) Grupo de A que exige foto, com C dentro.
    const grupo = await comoUsuario(tokenA, '/rest/v1/rpc/criar_grupo', {
      method: 'POST',
      body: { p_nome: NOME_GRUPO, p_exige_foto: true },
    })
    expect(grupo.status, JSON.stringify(grupo.corpo)).toBe(200)
    const { id: grupoId, codigo } = grupo.corpo as { id: string; codigo: string }
    grupoA = grupoId

    const entrada = await comoUsuario(tokenC, '/rest/v1/rpc/entrar_grupo', {
      method: 'POST',
      body: { p_codigo: codigo },
    })
    expect(entrada.status, JSON.stringify(entrada.corpo)).toBe(200)
    expect(entrada.corpo, JSON.stringify(entrada.corpo)).toMatchObject({ ok: true })

    const desafio = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: 'Desafio com foto',
        p_regra: { tipo: 'diaria' },
        p_icone: 'target',
        p_lembrete: null,
        p_ouro_base: 10,
        p_group_id: grupoA,
      },
    })
    expect(desafio.status, JSON.stringify(desafio.corpo)).toBe(200)
    ocorrenciaFoto = await ocorrenciaDeHoje(tokenA, (desafio.corpo as { id: string }).id, idA)

    // B nao compartilha grupo nenhum com A: os casos de isolamento tem que
    // falhar por nao ser dele, nao por ser de um grupo alheio.
    const gruposDeB = await comoAdmin(`/rest/v1/group_members?select=group_id&user_id=eq.${idB}`)
    expect(gruposDeB.corpo, 'B precisa comecar sem grupo').toEqual([])
  })

  test.afterAll(async () => {
    await apagarUsuario(idA)
    await apagarUsuario(idB)
    await apagarUsuario(idC)
  })

  // ----------------------------------------------------- isolamento A contra B

  test('1. B nao desfaz o check-in de A', async () => {
    const r = await comoUsuario(tokenB, '/rest/v1/rpc/desfazer_check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaFeitaA },
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ error: 'ocorrencia_invalida' })

    const depois = await comoAdmin(
      `/rest/v1/occurrences?select=status,vezes_feitas,ouro_creditado&id=eq.${ocorrenciaFeitaA}`,
    )
    const linha = (depois.corpo as { status: string; vezes_feitas: number; ouro_creditado: number }[])[0]
    expect(linha.status, 'o check-in de A tinha que continuar feito').toBe('feito')
    expect(linha.vezes_feitas).toBe(1)
    expect(linha.ouro_creditado).toBeGreaterThan(0)
  })

  test('2. B nao registra recaida no habito de perda de A', async () => {
    const r = await comoUsuario(tokenB, '/rest/v1/rpc/registrar_recaida', {
      method: 'POST',
      body: { p_habito: habitoRuimA },
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ error: 'sem_permissao' })

    // Nem uma linha, nem um centavo de vida saiu de B ou de A.
    const doB = await comoAdmin(`/rest/v1/recaidas?select=id&user_id=eq.${idB}`)
    expect(doB.corpo).toEqual([])
    const doA = await comoAdmin(`/rest/v1/recaidas?select=id&habit_id=eq.${habitoRuimA}`)
    expect((doA.corpo as unknown[]).length, 'so a recaida que o proprio A registrou').toBe(1)
  })

  test('3. marcar_notificacoes_lidas de B nao alcanca a notificacao de A', async () => {
    const r = await comoUsuario(tokenB, '/rest/v1/rpc/marcar_notificacoes_lidas', {
      method: 'POST',
      body: { p_id: notificacaoA },
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.corpo).toEqual({ ok: true, marcadas: 0 })

    const depois = await comoAdmin(`/rest/v1/notificacoes?select=lida_em&id=eq.${notificacaoA}`)
    expect(
      (depois.corpo as { lida_em: string | null }[])[0].lida_em,
      'a notificacao de A tinha que continuar nao lida',
    ).toBeNull()
  })

  test('4. B nao le notificacoes, recaidas nem vida_eventos de A', async () => {
    for (const tabela of ['notificacoes', 'recaidas', 'vida_eventos']) {
      // Cenario valido: A tem linha nas tres, senao o vazio nao provaria nada.
      const existe = await comoAdmin(`/rest/v1/${tabela}?select=id&user_id=eq.${idA}`)
      expect((existe.corpo as unknown[]).length, `A precisa ter linha em ${tabela}`).toBeGreaterThan(0)

      const r = await comoUsuario(tokenB, `/rest/v1/${tabela}?select=id,user_id&user_id=eq.${idA}`)
      expect(r.status, JSON.stringify(r.corpo)).toBe(200)
      expect(r.corpo, `RLS de ${tabela} deixou vazar linha de outro usuario`).toEqual([])

      // Varredura sem filtro tambem: B nao tem nada, entao tem que vir vazio.
      const tudo = await comoUsuario(tokenB, `/rest/v1/${tabela}?select=id`)
      expect(tudo.status, JSON.stringify(tudo.corpo)).toBe(200)
      expect(tudo.corpo, `varredura em ${tabela} vazou`).toEqual([])
    }
  })

  test('5. B nao escreve nas tabelas novas', async () => {
    const tentativas: [string, Record<string, unknown>][] = [
      ['notificacoes', { user_id: idB, titulo: 'Invadido', corpo: 'escrito pelo cliente' }],
      ['recaidas', { habit_id: habitoRuimA, user_id: idB, vida_perdida: 0, ouro_perdido: 0 }],
      ['vida_eventos', { user_id: idB, delta: 50, vida_depois: 50, motivo: 'renascimento' }],
    ]

    for (const [tabela, linha] of tentativas) {
      const r = await comoUsuario(tokenB, `/rest/v1/${tabela}`, { method: 'POST', body: linha })
      // Recusa por privilegio, nao por rota errada: um 404 de nome trocado faria
      // este teste passar sem provar nada.
      expect(
        [401, 403],
        `${tabela} aceitou escrita direta do cliente: ${r.status} ${JSON.stringify(r.corpo)}`,
      ).toContain(r.status)

      const gravado = await comoAdmin(`/rest/v1/${tabela}?select=id&user_id=eq.${idB}`)
      expect(gravado.corpo, `${tabela} gravou linha vinda do cliente`).toEqual([])
    }
  })

  test('6. colunas de contabilidade de occurrences nao sao legiveis pelo cliente', async () => {
    // A e dono das linhas, entao RLS nao tem o que negar: o que barra aqui e
    // privilegio de coluna, igual ao token_rapido da 0013.
    for (const coluna of ['ouro_creditado', 'streak_anterior', 'data_streak_anterior', 'bau_no']) {
      const r = await comoUsuario(tokenA, `/rest/v1/occurrences?select=id,${coluna}`)
      expect(
        r.status,
        `${coluna} deveria estar fora do grant, veio ${JSON.stringify(r.corpo)}`,
      ).toBe(403)
    }

    const tela = await comoUsuario(tokenA, '/rest/v1/occurrences?select=id,status,data_sp')
    expect(tela.status, JSON.stringify(tela.corpo)).toBe(200)
    expect((tela.corpo as unknown[]).length).toBeGreaterThan(0)
  })

  // ------------------------------------------------------------------ economia

  test('11. maquina de ouro: desfazer recusa quando o saldo ja foi gasto', async () => {
    const ouroAntes = await ouroDe(idA)

    const marcou = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaEconomia, p_foto: null },
    })
    expect(marcou.status, JSON.stringify(marcou.corpo)).toBe(200)
    expect(marcou.corpo, JSON.stringify(marcou.corpo)).toMatchObject({ completou: true, bau: false })
    const ganho = (marcou.corpo as { ouro_ganho: number }).ouro_ganho
    expect(ganho).toBeGreaterThan(0)
    expect(await ouroDe(idA)).toBe(ouroAntes + ganho)

    // Gastar tudo. Zerar pela service_role e o caminho mais curto e diz a mesma
    // verdade que resgatar um premio do valor do saldo: o ouro nao esta mais la.
    const zerou = await comoAdmin(`/rest/v1/profiles?id=eq.${idA}`, {
      method: 'PATCH',
      body: { ouro: 0 },
    })
    expect(zerou.status, JSON.stringify(zerou.corpo)).toBe(204)

    const recusado = await comoUsuario(tokenA, '/rest/v1/rpc/desfazer_check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaEconomia },
    })
    expect(recusado.status).toBe(200)
    expect(
      recusado.corpo,
      'clamp em zero aqui era a maquina de ouro infinito',
    ).toEqual({ error: 'saldo_gasto' })
    expect(await ouroDe(idA), 'o desfazer recusado nao pode ter creditado nada').toBe(0)

    const ocorrencia = await comoAdmin(
      `/rest/v1/occurrences?select=status,ouro_creditado&id=eq.${ocorrenciaEconomia}`,
    )
    expect((ocorrencia.corpo as { status: string; ouro_creditado: number }[])[0]).toMatchObject({
      status: 'feito',
      ouro_creditado: ganho,
    })

    // Com saldo de novo, o desfazer cobra o valor cheio e o saldo volta a ser
    // exatamente o de antes do check-in.
    const devolveu = await comoAdmin(`/rest/v1/profiles?id=eq.${idA}`, {
      method: 'PATCH',
      body: { ouro: ouroAntes + ganho },
    })
    expect(devolveu.status, JSON.stringify(devolveu.corpo)).toBe(204)

    const desfez = await comoUsuario(tokenA, '/rest/v1/rpc/desfazer_check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaEconomia },
    })
    expect(desfez.status, JSON.stringify(desfez.corpo)).toBe(200)
    expect(desfez.corpo, JSON.stringify(desfez.corpo)).toMatchObject({
      ok: true,
      ouro_devolvido: ganho,
    })
    expect(await ouroDe(idA), 'o estorno tem que cobrar o valor cheio').toBe(ouroAntes)
  })

  test('12. marcar e desmarcar tres vezes deixa o ouro exatamente igual', async () => {
    const inicial = await ouroDe(idA)

    for (let volta = 1; volta <= 3; volta++) {
      const marcou = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
        method: 'POST',
        body: { p_occ: ocorrenciaEconomia, p_foto: null },
      })
      expect(marcou.status, JSON.stringify(marcou.corpo)).toBe(200)
      expect(marcou.corpo, `volta ${volta}: ${JSON.stringify(marcou.corpo)}`).toMatchObject({
        completou: true,
        bau: false,
      })
      const ganho = (marcou.corpo as { ouro_ganho: number }).ouro_ganho
      expect(await ouroDe(idA), `volta ${volta}: o check-in nao pagou o que disse`).toBe(
        inicial + ganho,
      )

      const desfez = await comoUsuario(tokenA, '/rest/v1/rpc/desfazer_check_in', {
        method: 'POST',
        body: { p_occ: ocorrenciaEconomia },
      })
      expect(desfez.status, JSON.stringify(desfez.corpo)).toBe(200)
      expect(desfez.corpo, `volta ${volta}: ${JSON.stringify(desfez.corpo)}`).toMatchObject({
        ok: true,
        ouro_devolvido: ganho,
      })
      expect(await ouroDe(idA), `volta ${volta}: sobrou ouro do ciclo`).toBe(inicial)
    }

    expect(await ouroDe(idA), 'tres ciclos nao podem ter criado nem sumido ouro').toBe(inicial)
  })

  test('13. desfazer recusa ocorrencia sem contabilidade gravada', async () => {
    const marcou = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaEconomia, p_foto: null },
    })
    expect(marcou.status, JSON.stringify(marcou.corpo)).toBe(200)
    expect(marcou.corpo, JSON.stringify(marcou.corpo)).toMatchObject({ completou: true })
    const ouroMarcado = await ouroDe(idA)

    // Check-in de antes da 0019: pagou ouro e nao registrou quanto.
    const apagou = await comoAdmin(`/rest/v1/occurrences?id=eq.${ocorrenciaEconomia}`, {
      method: 'PATCH',
      body: { ouro_creditado: 0 },
    })
    expect(apagou.status, JSON.stringify(apagou.corpo)).toBe(204)

    const r = await comoUsuario(tokenA, '/rest/v1/rpc/desfazer_check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaEconomia },
    })
    expect(r.status).toBe(200)
    expect(
      r.corpo,
      'estornar zero e reabrir a ocorrencia deixaria ela pagar de novo',
    ).toEqual({ error: 'sem_contabilidade' })

    const depois = await comoAdmin(
      `/rest/v1/occurrences?select=status&id=eq.${ocorrenciaEconomia}`,
    )
    expect((depois.corpo as { status: string }[])[0].status).toBe('feito')
    expect(await ouroDe(idA)).toBe(ouroMarcado)
  })

  // ------------------------------------------------------------ foto no grupo

  test('14. grupo que exige foto recusa check-in sem foto', async () => {
    const r = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaFoto, p_foto: null },
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ error: 'foto_obrigatoria' })

    const depois = await comoAdmin(
      `/rest/v1/occurrences?select=status,vezes_feitas&id=eq.${ocorrenciaFoto}`,
    )
    expect((depois.corpo as { status: string; vezes_feitas: number }[])[0]).toMatchObject({
      status: 'pendente',
      vezes_feitas: 0,
    })
  })

  test('15. caminho inventado na propria pasta nao vale como foto', async () => {
    const inventado = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaFoto, p_foto: `${idA}/nao-existe-refino.webp` },
    })
    expect(inventado.status).toBe(200)
    expect(
      inventado.corpo,
      'sem conferir storage.objects, exigir foto vira exigir que a pessoa digite um caminho',
    ).toEqual({ error: 'foto_invalida' })

    const caminho = `${idA}/${ocorrenciaFoto}/refino.webp`
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

    const valido = await comoUsuario(tokenA, '/rest/v1/rpc/check_in', {
      method: 'POST',
      body: { p_occ: ocorrenciaFoto, p_foto: caminho },
    })
    expect(valido.status, JSON.stringify(valido.corpo)).toBe(200)
    expect(valido.corpo, JSON.stringify(valido.corpo)).toMatchObject({ completou: true })

    const gravado = await comoAdmin(
      `/rest/v1/occurrences?select=foto_path,status&id=eq.${ocorrenciaFoto}`,
    )
    expect((gravado.corpo as { foto_path: string; status: string }[])[0]).toMatchObject({
      foto_path: caminho,
      status: 'feito',
    })
  })

  // ------------------------------------------------------- habito de perda

  test('16. membro que nao e dono nao cria habito de perda no grupo', async () => {
    // C e membro do grupo de A. Habito de perda de grupo aparece no Hoje de todo
    // mundo e cobra de quem aperta, entao criar e do dono.
    const membro = await comoAdmin(
      `/rest/v1/group_members?select=user_id&group_id=eq.${grupoA}&user_id=eq.${idC}`,
    )
    expect((membro.corpo as unknown[]).length, 'C precisa estar no grupo aqui').toBe(1)

    const r = await comoUsuario(tokenC, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: 'Zoar o grupo',
        p_regra: { tipo: 'diaria' },
        p_icone: 'target',
        p_lembrete: null,
        p_ouro_base: 10,
        p_group_id: grupoA,
        p_tipo: 'ruim',
        p_pune_ouro: true,
      },
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ error: 'grupo_invalido' })

    const criado = await comoAdmin(
      `/rest/v1/habits?select=id&group_id=eq.${grupoA}&tipo=eq.ruim`,
    )
    expect(criado.corpo, 'nenhum habito de perda podia ter nascido no grupo').toEqual([])
  })

  test('17. habito de perda nao gera ocorrencia', async () => {
    const r = await comoAdmin(`/rest/v1/occurrences?select=id&habit_id=eq.${habitoRuimA}`)
    expect(
      r.corpo,
      'habito de perda nao vence, nao notifica e nao aparece como tarefa',
    ).toEqual([])
  })

  test('18. tipo invalido em criar_habito responde tipo_invalido', async () => {
    const r = await comoUsuario(tokenA, '/rest/v1/rpc/criar_habito', {
      method: 'POST',
      body: {
        p_titulo: 'Habito de tipo estranho',
        p_regra: { tipo: 'diaria' },
        p_icone: 'target',
        p_lembrete: null,
        p_ouro_base: 10,
        p_group_id: null,
        p_tipo: 'pessimo',
      },
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ error: 'tipo_invalido' })

    const criado = await comoAdmin(
      `/rest/v1/habits?select=id&user_id=eq.${idA}&titulo=eq.Habito de tipo estranho`,
    )
    expect(criado.corpo).toEqual([])
  })

  // --------------------------------------------------------------------- grupos

  test('7. membro nao exclui nem renomeia o grupo do dono', async () => {
    const excluir = await comoUsuario(tokenC, '/rest/v1/rpc/excluir_grupo', {
      method: 'POST',
      body: { p_grupo: grupoA },
    })
    expect(excluir.status).toBe(200)
    expect(excluir.corpo).toEqual({ error: 'sem_permissao' })

    const renomear = await comoUsuario(tokenC, '/rest/v1/rpc/atualizar_grupo', {
      method: 'POST',
      body: { p_grupo: grupoA, p_nome: 'Sequestrado', p_exige_foto: false },
    })
    expect(renomear.status).toBe(200)
    expect(renomear.corpo).toEqual({ error: 'sem_permissao' })

    const depois = await comoAdmin(`/rest/v1/groups?select=nome,exige_foto&id=eq.${grupoA}`)
    expect((depois.corpo as { nome: string; exige_foto: boolean }[])[0]).toMatchObject({
      nome: NOME_GRUPO,
      exige_foto: true,
    })
  })

  test('8. o dono nao sai do proprio grupo', async () => {
    const r = await comoUsuario(tokenA, '/rest/v1/rpc/sair_grupo', {
      method: 'POST',
      body: { p_grupo: grupoA },
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ error: 'dono_nao_sai' })

    const membro = await comoAdmin(
      `/rest/v1/group_members?select=user_id,papel&group_id=eq.${grupoA}&user_id=eq.${idA}`,
    )
    expect((membro.corpo as unknown[]).length, 'o dono tinha que continuar no grupo').toBe(1)
  })

  test('9. membro sai e perde o acesso ao grupo', async () => {
    const r = await comoUsuario(tokenC, '/rest/v1/rpc/sair_grupo', {
      method: 'POST',
      body: { p_grupo: grupoA },
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.corpo).toMatchObject({ ok: true })

    const grupo = await comoUsuario(tokenC, `/rest/v1/groups?select=id,nome&id=eq.${grupoA}`)
    expect(grupo.status, JSON.stringify(grupo.corpo)).toBe(200)
    expect(grupo.corpo, 'quem saiu continuava lendo o grupo').toEqual([])

    const membros = await comoUsuario(
      tokenC,
      `/rest/v1/group_members?select=user_id&group_id=eq.${grupoA}`,
    )
    expect(membros.status, JSON.stringify(membros.corpo)).toBe(200)
    expect(membros.corpo, 'quem saiu continuava lendo os membros').toEqual([])

    const conferido = await comoAdmin(
      `/rest/v1/group_members?select=user_id&group_id=eq.${grupoA}&user_id=eq.${idC}`,
    )
    expect(conferido.corpo).toEqual([])
  })

  test('10. grupo inexistente e grupo sem permissao respondem a mesma coisa', async () => {
    // C acabou de sair: para ele o grupo de A existe e nao e dele. Se a resposta
    // fosse diferente da de um id que nao existe, daria para varrer ids.
    for (const rpc of ['excluir_grupo', 'atualizar_grupo', 'sair_grupo']) {
      const corpoExtra = rpc === 'atualizar_grupo' ? { p_nome: 'Tanto faz' } : {}

      const inexistente = await comoUsuario(tokenC, `/rest/v1/rpc/${rpc}`, {
        method: 'POST',
        body: { p_grupo: UUID_INEXISTENTE, ...corpoExtra },
      })
      const semPermissao = await comoUsuario(tokenC, `/rest/v1/rpc/${rpc}`, {
        method: 'POST',
        body: { p_grupo: grupoA, ...corpoExtra },
      })

      expect(inexistente.status).toBe(200)
      expect(semPermissao.status).toBe(200)
      expect(inexistente.corpo).toEqual({ error: 'sem_permissao' })
      expect(
        semPermissao.corpo,
        `${rpc} distingue inexistente de sem permissao e vira oraculo de enumeracao`,
      ).toEqual(inexistente.corpo)
    }

    // E o grupo continua de pe depois de todas as tentativas.
    const grupo = await comoAdmin(`/rest/v1/groups?select=id,nome&id=eq.${grupoA}`)
    expect((grupo.corpo as { nome: string }[])[0].nome).toBe(NOME_GRUPO)
  })
})
