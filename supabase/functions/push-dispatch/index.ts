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
  endpoint: string
  p256dh: string
  auth: string
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

  return new Response(
    JSON.stringify({ candidatos: linhas.length, enviados, expiradas }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
