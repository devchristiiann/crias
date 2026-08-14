/**
 * Cria e apaga uma conta descartavel no Supabase REAL, para a conferencia
 * manual em producao. Fica fora do `playwright test` de proposito: e ferramenta
 * de inspecao, nao suite. Uso:
 *   node e2e/conta-temporaria.mjs criar
 *   node e2e/conta-temporaria.mjs apagar <id>
 */
process.loadEnvFile()

const REF = 'oeaftenwsmbkdxqseqrb'
const URL_SUPABASE = process.env.VITE_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!URL_SUPABASE.includes(REF)) {
  throw new Error(`VITE_SUPABASE_URL nao aponta para o projeto ${REF}: ${URL_SUPABASE}`)
}
if (!SERVICE) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY no .env')

async function admin(caminho, method = 'GET', body) {
  const r = await fetch(`${URL_SUPABASE}${caminho}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const texto = await r.text()
  let corpo = texto
  try {
    corpo = texto ? JSON.parse(texto) : null
  } catch {
    /* resposta sem corpo JSON, fica o texto cru */
  }
  if (!r.ok) throw new Error(`${method} ${caminho}: ${r.status} ${texto}`)
  return corpo
}

const [acao, argumento] = process.argv.slice(2)

if (acao === 'criar') {
  const email = `conferencia-arte-${Date.now()}@exemplo-crias.test`
  const senha = `Cr${Date.now()}!aa`
  const usuario = await admin('/auth/v1/admin/users', 'POST', {
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: 'Conferencia de arte' },
  })
  // Ouro suficiente para comprar um pedestal pelo caminho normal da loja.
  await admin(`/rest/v1/profiles?id=eq.${usuario.id}`, 'PATCH', { ouro: 5000 })
  console.log(JSON.stringify({ id: usuario.id, email, senha }))
} else if (acao === 'apagar') {
  if (!argumento) throw new Error('falta o id do usuario')
  await admin(`/auth/v1/admin/users/${argumento}`, 'DELETE')
  console.log('apagada', argumento)
} else {
  throw new Error('use: criar | apagar <id>')
}
