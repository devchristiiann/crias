import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Resolve a acao tocada na propria notificacao, sem abrir o app.
 *
 * Nao ha JWT aqui: o Service Worker nao carrega a sessao do usuario. A
 * autorizacao e o `token_rapido`, que so existe dentro da carga cifrada do web
 * push, e portanto so o dono daquela assinatura consegue ler. O token e de uso
 * unico e gira a cada chamada, entao interceptar um envio antigo nao serve.
 */

const CABECALHOS = {
  'Content-Type': 'application/json',
  // O Service Worker chama de outra origem que nao a da funcao.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let corpo: { token?: unknown; acao?: unknown }
  try {
    corpo = await requisicao.json()
  } catch {
    return responder({ error: 'corpo_invalido' })
  }

  const token = typeof corpo.token === 'string' ? corpo.token : ''
  const acao = corpo.acao === 'adiar' ? 'adiar' : 'concluir'

  // Valida o formato antes de tocar no banco: assim uma varredura de tokens
  // malformados nem chega a virar consulta.
  if (!UUID.test(token)) {
    return responder({ error: 'token_invalido' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase.rpc('check_in_por_token', {
    p_token: token,
    p_acao: acao,
  })

  if (error) {
    console.error('check_in_por_token falhou', error.message)
    return responder({ error: 'falha_interna' })
  }

  return responder(data)
})

/**
 * Sempre HTTP 200 com o erro no corpo. O SDK do Supabase trata status 4xx como
 * falha de invocacao e nem le o corpo, entao o front perderia a mensagem.
 */
function responder(corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status: 200, headers: CABECALHOS })
}
