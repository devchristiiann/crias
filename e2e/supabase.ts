/**
 * Acesso direto ao Supabase REAL nos testes. Sem mock, sem fixture.
 * O guarda de `ref` existe porque o mesmo PAT enxerga outro projeto da conta:
 * se a URL nao for a do Crias, o arquivo se recusa a rodar.
 */
process.loadEnvFile()

export const REF = 'oeaftenwsmbkdxqseqrb'
export const URL_SUPABASE = process.env.VITE_SUPABASE_URL ?? ''
export const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!URL_SUPABASE.includes(REF)) {
  throw new Error(`VITE_SUPABASE_URL nao aponta para o projeto ${REF}: ${URL_SUPABASE}`)
}
if (!ANON || !SERVICE) {
  throw new Error('Faltam VITE_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY no .env')
}

type Opcoes = { method?: string; body?: unknown; headers?: Record<string, string> }

async function chamar(chave: string, token: string, caminho: string, o: Opcoes = {}) {
  const resposta = await fetch(`${URL_SUPABASE}${caminho}`, {
    method: o.method ?? 'GET',
    headers: {
      apikey: chave,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...o.headers,
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  })
  const texto = await resposta.text()
  let corpo: unknown = texto
  try {
    corpo = texto ? JSON.parse(texto) : null
  } catch {
    /* resposta sem corpo JSON, fica o texto cru */
  }
  return { status: resposta.status, ok: resposta.ok, corpo: corpo as never }
}

/** service_role: usado so para montar e desmontar o cenario, nunca para asserir isolamento. */
export const comoAdmin = (caminho: string, o?: Opcoes) => chamar(SERVICE, SERVICE, caminho, o)

/** Exatamente o que o navegador faz: anon key + access_token do usuario. */
export const comoUsuario = (token: string, caminho: string, o?: Opcoes) =>
  chamar(ANON, token, caminho, o)

export async function criarUsuario(email: string, senha: string, nome: string) {
  const r = await comoAdmin('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: senha, email_confirm: true, user_metadata: { nome } },
  })
  if (!r.ok) throw new Error(`nao criou ${email}: ${r.status} ${JSON.stringify(r.corpo)}`)
  return (r.corpo as { id: string }).id
}

export async function logar(email: string, senha: string) {
  const r = await chamar(ANON, ANON, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password: senha },
  })
  if (!r.ok) throw new Error(`login falhou para ${email}: ${r.status} ${JSON.stringify(r.corpo)}`)
  return (r.corpo as { access_token: string }).access_token
}

/** Apaga o usuario e, por cascade, perfil, habitos, ocorrencias, premios e grupos. */
export async function apagarUsuario(id: string | null) {
  if (!id) return
  await comoAdmin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' })
}
