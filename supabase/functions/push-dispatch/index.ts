import { createClient } from 'jsr:@supabase/supabase-js@2'
import { montarCopy, type Toque } from '../_shared/copy.ts'
import { enviarPush, type ChavesVapid } from '../_shared/webpush.ts'

/**
 * Dispara a escada de toques. Chamada pelo pg_cron a cada 5 minutos.
 *
 * A funcao nao decide QUANDO nem PARA QUEM: isso vem de toques_pendentes(),
 * no banco, onde da para testar com SQL. Aqui so monta a frase, assina e envia.
 */

interface LinhaToque {
  occurrence_id: string
  token_rapido: string
  toque: Toque
  bit_toque: number
  proximo_toque: string | null
  user_id: string
  nome: string
  habito: string
  grupo: string | null
  streak: number
  feitos_no_grupo: number
  total_grupo: number
  ouro: number
  vida: number
  horas: number
  // Progresso do dia. So o toque 'alarme' usa, mas vem em toda linha: a RPC nao
  // tem por que devolver coluna condicional.
  vezes_feitas: number
  vezes_alvo: number
  endpoint: string
  p256dh: string
  auth: string
}

interface LinhaAviso {
  aviso_id: string
  user_id: string
  titulo: string
  corpo: string
  url: string | null
  // Nulos quando a conta nao tem aparelho inscrito. A fila usa left join de
  // proposito: sem push a pessoa ainda precisa do aviso na central do app.
  endpoint: string | null
  p256dh: string | null
  auth: string | null
}

function comparacaoConstante(a: string, b: string) {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

Deno.serve(async (requisicao) => {
  const segredoEsperado = Deno.env.get('CRIAS_INTERNAL_SECRET')
  const segredoRecebido = requisicao.headers.get('x-internal-secret') ?? ''

  if (!segredoEsperado || !comparacaoConstante(segredoRecebido, segredoEsperado)) {
    return new Response(JSON.stringify({ error: 'nao_autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const chaves: ChavesVapid = {
    subject: Deno.env.get('VAPID_SUBJECT') ?? '',
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  }
  if (!chaves.publicKey || !chaves.privateKey || !chaves.subject) {
    // Falha alto: sem chave nao existe push, e silenciar isso esconderia o
    // problema justamente no pilar do produto.
    return new Response(JSON.stringify({ error: 'vapid_ausente' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase.rpc('toques_pendentes', { p_limite: 200 })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const linhas = (data ?? []) as LinhaToque[]
  const apiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1`
  const registradas = new Set<string>()
  let enviados = 0
  let expiradas = 0

  for (const linha of linhas) {
    const frase = montarCopy(
      linha.toque,
      {
        nome: linha.nome,
        habito: linha.habito,
        grupo: linha.grupo,
        streak: linha.streak,
        feitosNoGrupo: linha.feitos_no_grupo,
        totalGrupo: linha.total_grupo,
        ouro: linha.ouro,
        vida: linha.vida,
        horas: linha.horas,
        feitas: linha.vezes_feitas ?? 0,
        alvo: linha.vezes_alvo ?? 1,
      },
      linha.occurrence_id,
    )

    const carga = {
      titulo: frase.titulo,
      corpo: frase.corpo,
      toque: linha.toque,
      // A tag e o id da ocorrencia: o toque novo substitui o anterior na bandeja.
      tag: `occ-${linha.occurrence_id}`,
      url: `/hoje?occ=${linha.occurrence_id}`,
      token_rapido: linha.token_rapido,
      api: apiUrl,
    }

    try {
      const resultado = await enviarPush(
        { endpoint: linha.endpoint, p256dh: linha.p256dh, auth: linha.auth },
        carga,
        chaves,
      )

      if (resultado.expirada) {
        await supabase.rpc('remover_sub', { p_endpoint: linha.endpoint })
        expiradas += 1
        continue
      }

      if (resultado.status >= 200 && resultado.status < 300) enviados += 1
    } catch (erro) {
      console.error('falha ao enviar push', linha.occurrence_id, String(erro))
      continue
    }

    // Um usuario pode ter varios aparelhos. O bit da ocorrencia vira uma vez so,
    // depois de tentar todos, senao o segundo aparelho nunca receberia.
    if (!registradas.has(linha.occurrence_id)) {
      registradas.add(linha.occurrence_id)
      await supabase.rpc('registrar_toque', {
        p_occ: linha.occurrence_id,
        p_bit: linha.bit_toque,
        p_proximo: linha.proximo_toque,
      })

      // A mesma frase que foi para a bandeja fica guardada na central de
      // notificacoes do app, com a mesma url, para quem so abre depois ainda
      // conseguir chegar no desafio. Aproveita o mesmo ponto do registrar_toque:
      // uma linha por ocorrencia, nunca uma por aparelho.
      //
      // Falha aqui nao interrompe nada. O push e o pilar do produto, a linha e o
      // registro: perder o registro e ruim, perder o envio e inaceitavel.
      try {
        const { error: erroNotificacao } = await supabase.from('notificacoes').insert({
          user_id: linha.user_id,
          titulo: carga.titulo,
          corpo: carga.corpo,
          url: carga.url,
        })
        if (erroNotificacao) {
          console.error('falha ao gravar notificacao', linha.occurrence_id, erroNotificacao.message)
        }
      } catch (erro) {
        console.error('falha ao gravar notificacao', linha.occurrence_id, String(erro))
      }
    }
  }

  // Drena a fila de avisos do produto depois da escada de toques. E uma fila
  // separada de toques_pendentes: nao nasce de ocorrencia, entao nao tem
  // token_rapido nem acao de concluir, so titulo, corpo e url para abrir.
  let avisosEnviados = 0
  const avisosCarimbados = new Set<string>()

  try {
    const { data: avisos, error: erroAvisos } = await supabase.rpc('avisos_pendentes', {
      p_limite: 200,
    })
    if (erroAvisos) throw erroAvisos

    for (const aviso of (avisos ?? []) as LinhaAviso[]) {
      const cargaAviso: Record<string, unknown> = {
        titulo: aviso.titulo,
        corpo: aviso.corpo,
        tag: `aviso-${aviso.aviso_id}`,
        api: apiUrl,
      }
      if (aviso.url !== null) cargaAviso.url = aviso.url

      // Sem aparelho nao ha o que cifrar, mas o aviso segue para o carimbo e
      // para a central: quem nunca ligou o push e justamente quem so vai
      // descobrir o recado abrindo o app.
      if (aviso.endpoint && aviso.p256dh && aviso.auth) {
        try {
          const resultado = await enviarPush(
            { endpoint: aviso.endpoint, p256dh: aviso.p256dh, auth: aviso.auth },
            cargaAviso,
            chaves,
          )

          if (resultado.expirada) {
            await supabase.rpc('remover_sub', { p_endpoint: aviso.endpoint })
            expiradas += 1
          } else if (resultado.status >= 200 && resultado.status < 300) {
            avisosEnviados += 1
          }
        } catch (erro) {
          console.error('falha ao enviar aviso', aviso.aviso_id, String(erro))
        }
      }

      // A fila devolve uma linha por aparelho, mas o carimbo e a linha na
      // central sao por aviso: a primeira linha processada de cada aviso
      // carimba, tenha o push saido, falhado ou nem existido aparelho para
      // tentar, e as linhas seguintes do mesmo aviso so tentam o proprio
      // envio. Aviso que falha ao enviar tambem precisa ser carimbado, senao
      // reenfileira e tenta de novo a cada 5 minutos para sempre, sem nunca
      // aparecer na central.
      //
      // ponytail: esta fila nao passa pelo teto de 10 notificacoes por dia
      // por usuario que a escada de toques respeita. Hoje e um aviso por
      // conta, uma vez, entao nao ha risco. Se um dia virar canal recorrente
      // de produto, o teto precisa ser estendido para ca tambem, senao vira
      // spam sem trava.
      if (!avisosCarimbados.has(aviso.aviso_id)) {
        avisosCarimbados.add(aviso.aviso_id)
        const { error: erroCarimbo } = await supabase.rpc('marcar_aviso_enviado', {
          p_aviso: aviso.aviso_id,
        })

        if (erroCarimbo) {
          console.error('falha ao carimbar aviso', aviso.aviso_id, erroCarimbo.message)
        } else {
          // Registro para a central de notificacoes, mesma regra da escada: o
          // push e o pilar, a linha e so o registro, entao falha aqui nao volta.
          try {
            const { error: erroNotificacao } = await supabase.from('notificacoes').insert({
              user_id: aviso.user_id,
              titulo: aviso.titulo,
              corpo: aviso.corpo,
              url: aviso.url,
            })
            if (erroNotificacao) {
              console.error('falha ao gravar notificacao de aviso', aviso.aviso_id, erroNotificacao.message)
            }
          } catch (erro) {
            console.error('falha ao gravar notificacao de aviso', aviso.aviso_id, String(erro))
          }
        }
      }
    }
  } catch (erro) {
    // A escada de toques ja rodou e ja respondeu por quem depende de push de
    // ocorrencia. Um problema so na fila de avisos nao pode derrubar isso.
    console.error('falha ao buscar avisos pendentes', String(erro))
  }

  return new Response(
    JSON.stringify({ candidatos: linhas.length, enviados, expiradas, avisosEnviados }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
