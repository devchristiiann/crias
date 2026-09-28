// Executa SQL no projeto Supabase do Crias via Management API.
//
// Uso:
//   node scripts/sql.mjs supabase/migrations/0003_gerador_ocorrencias.sql
//   node scripts/sql.mjs -e "select public.hoje_sp()"
//
// O PAT sbp_ do .env e um access token da conta inteira: enxerga todos os
// projetos dela. Por isso o guard abaixo exige que o ref do .env seja o mesmo
// do supabase/config.toml, dois lugares independentes que precisam concordar.
import { readFileSync } from 'node:fs'

const REF_ESPERADO = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
  .match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).trim()]
    }),
)

if (!REF_ESPERADO || env.SUPABASE_PROJECT_REF !== REF_ESPERADO) {
  console.error(`ABORTADO: SUPABASE_PROJECT_REF (${env.SUPABASE_PROJECT_REF}) difere do project_id do supabase/config.toml (${REF_ESPERADO})`)
  process.exit(1)
}

const args = process.argv.slice(2)
const query = args[0] === '-e' ? args[1] : readFileSync(args[0], 'utf8')

const resposta = await fetch(
  `https://api.supabase.com/v1/projects/${REF_ESPERADO}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      // Sem User-Agent o Cloudflare na frente da API responde 403.
      'User-Agent': 'curl/8.4.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  },
)

const corpo = await resposta.text()
if (!resposta.ok) {
  console.error(`HTTP ${resposta.status}`, corpo)
  process.exit(1)
}
console.log(corpo)
