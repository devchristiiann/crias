import { supabase } from './supabase'

interface UrlGuardada {
  url: string
  expiraEm: number
}

/**
 * URLs ja assinadas nesta sessao, por `bucket:caminho`.
 *
 * Sem isso, toda invalidacao de grupo reassinava as mesmas fotos, o token
 * mudava, o `src` de cada `<img>` mudava junto e o celular baixava o feed
 * inteiro de novo a cada check-in de colega.
 */
const CACHE = new Map<string, UrlGuardada>()

/** URL que vence em menos de um minuto ja conta como vencida. */
const MARGEM_MS = 60_000

/** Teto do cache. Passou disso, as vencidas saem antes de entrar mais. */
const TETO_CACHE = 200

export async function assinarEmLote(
  bucket: string,
  caminhos: string[],
  segundos: number,
): Promise<Map<string, string>> {
  const url = new Map<string, string>()
  if (caminhos.length === 0) return url

  const agora = Date.now()
  const faltando: string[] = []

  for (const caminho of caminhos) {
    const guardada = CACHE.get(`${bucket}:${caminho}`)
    if (guardada && guardada.expiraEm > agora + MARGEM_MS) {
      url.set(caminho, guardada.url)
      continue
    }
    faltando.push(caminho)
  }

  if (faltando.length === 0) return url

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(faltando, segundos)
  // Imagem e acessorio de tela: falhar aqui devolve o mapa sem ela, em vez de
  // derrubar a lista inteira por causa de uma URL que nao assinou.
  if (error) return url

  if (CACHE.size > TETO_CACHE) {
    for (const [chave, guardada] of CACHE) {
      if (guardada.expiraEm <= agora) CACHE.delete(chave)
    }
  }

  for (const item of data ?? []) {
    if (!item.signedUrl || !item.path) continue
    url.set(item.path, item.signedUrl)
    CACHE.set(`${bucket}:${item.path}`, {
      url: item.signedUrl,
      expiraEm: agora + segundos * 1000,
    })
  }
  return url
}
