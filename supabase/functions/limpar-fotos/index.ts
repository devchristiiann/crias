import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Apaga foto de check-in orfa. Chamada pelo pg_cron, uma vez por dia.
 *
 * A funcao nao decide O QUE e orfao: isso vem de public.fotos_orfas(), no
 * banco, onde da para conferir com SQL antes de qualquer coisa sumir. Bucket,
 * idade minima de 30 dias e "ninguem referencia este caminho" sao tres travas
 * que vivem la, numa consulta so. Aqui so se chama a API de Storage, que e a
 * unica que remove os bytes de verdade: o gatilho `protect_objects_delete`
 * recusa delete direto em `storage.objects`, e com razao, porque apagar a linha
 * deixaria os bytes no S3 para sempre.
 *
 * A `service_role` vem de `Deno.env` e de lugar nenhum mais. Ela nunca fica no
 * banco: o cron so manda o `internal_secret`, igual ao push-dispatch.
 */

// Segunda trava do bucket, redundante de proposito. `fotos_orfas()` ja filtra
// por `checkins`, e mesmo assim o nome esta escrito aqui e nao vem da lista:
// nenhum caminho recebido consegue mudar o bucket em que este delete cai.
const BUCKET = 'checkins'

// Teto por execucao. O job roda todo dia; o que passar do teto sai amanha.
// Vai como argumento para `fotos_orfas`: o corte e do banco, e nao daqui depois
// de o conjunto inteiro atravessar o PostgREST. Assim a lista continua sendo
// exatamente o que a limpeza apaga.
const LIMITE = 200

interface FotoOrfa {
  caminho: string
  bytes: number
  criado_em: string
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

  // O cron chama por POST. Sem esta trava um GET com o header apagaria tanto
  // quanto um POST, e GET e o metodo que qualquer coisa dispara sozinha:
  // prefetch de navegador, crawler, um link colado num chat.
  if (requisicao.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'metodo_nao_permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Codigo estavel no corpo, detalhe so no log. `error.message` do Postgres
  // carrega nome de tabela, de funcao e as vezes o proprio SQL, e nada disso
  // precisa sair pela resposta HTTP para o cron saber que a rodada falhou.
  const { data, error } = await supabase.rpc('fotos_orfas', { p_limite: LIMITE })
  if (error) {
    console.error('fotos_orfas falhou', error.message)
    return new Response(JSON.stringify({ error: 'listagem_falhou' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const caminhos = ((data ?? []) as FotoOrfa[]).map((f) => f.caminho)

  if (caminhos.length === 0) {
    return new Response(JSON.stringify({ tentados: 0, apagados: 0, falhas: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Um `remove` para o lote inteiro. Repetir um caminho que ja saiu nao tem
  // efeito: quem apaga a linha de `storage.objects` e a propria API, entao a
  // rodada seguinte nao ve mais o que ja foi embora.
  const { data: removidos, error: erroRemove } = await supabase.storage
    .from(BUCKET)
    .remove(caminhos)

  if (erroRemove) {
    console.error('falha ao apagar lote', erroRemove.message)
    return new Response(
      JSON.stringify({
        error: 'remocao_falhou',
        tentados: caminhos.length,
        apagados: 0,
        falhas: caminhos.length,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // `remove` devolve o que realmente saiu, nao o que foi pedido. Contar o
  // pedido como sucesso e exatamente a mentira que este par de contadores
  // existe para impedir: sem ele, uma rodada que nao apagou nada apareceria
  // como "succeeded" no cron.
  const apagados = removidos?.length ?? 0
  const falhas = caminhos.length - apagados
  if (falhas > 0) console.error('objetos nao removidos', falhas, 'de', caminhos.length)

  return new Response(
    JSON.stringify({ tentados: caminhos.length, apagados, falhas }),
    {
      status: apagados === 0 ? 500 : 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
