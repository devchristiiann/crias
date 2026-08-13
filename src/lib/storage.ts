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

/**
 * Quantas assinaturas saem ao mesmo tempo.
 *
 * Uma chamada por caminho so e barata enquanto o numero de caminhos e pequeno.
 * O feed pede oito por pagina e a lista de grupos pede um por grupo, mas as
 * enquetes pedem uma por validacao aberta, e num grupo grande isso nao tem teto
 * nenhum: sem esta janela, abrir a tela dispararia dezenas de requisicoes de uma
 * vez no celular de quem so queria ver o placar. Oito e a largura da pagina do
 * feed, que e o maior lote do caminho normal.
 */
const EM_PARALELO = 8

/**
 * Tamanho de entrega da imagem. A foto original sobe em 1080px e o Storage
 * redimensiona na borda, entao cada tela pede so o que ela mostra.
 *
 * `resize: 'contain'` e obrigatorio: sem ele o padrao e `cover`, que recorta
 * para encher a caixa e corta a lateral da foto. Sem `format`, o Storage
 * negocia pelo `Accept` do navegador e devolve WebP.
 */
export interface Entrega {
  /** Maior lado horizontal em pixels, ja contando a densidade da tela. */
  largura: number
  /** 20 a 100. Abaixo de 60 o artefato aparece em foto de camera. */
  qualidade: number
}

/**
 * URLs assinadas de um lote de caminhos, ja com a transformacao de entrega.
 *
 * Uma chamada por caminho, e nao `createSignedUrls`: a versao em lote do SDK
 * nao aceita `transform`, e o token e quem carrega a transformacao. Passar
 * largura na query de um token sem transformacao e ignorado em silencio, o que
 * devolveria a foto inteira achando que reduziu. As chamadas vao em paralelo e
 * o cache abaixo evita repetir a assinatura da mesma foto.
 */
export async function assinarEmLote(
  bucket: string,
  caminhos: string[],
  segundos: number,
  entrega: Entrega,
): Promise<Map<string, string>> {
  const url = new Map<string, string>()
  if (caminhos.length === 0) return url

  const agora = Date.now()
  // A transformacao entra na chave: a mesma foto entregue em 160px e em 960px
  // sao duas URLs diferentes, e uma chave so faria a lista de grupos servir a
  // versao grande que o detalhe assinou primeiro.
  const chaveDe = (caminho: string) =>
    `${bucket}:${entrega.largura}x${entrega.qualidade}:${caminho}`
  const faltando: string[] = []

  for (const caminho of caminhos) {
    const guardada = CACHE.get(chaveDe(caminho))
    if (guardada && guardada.expiraEm > agora + MARGEM_MS) {
      url.set(caminho, guardada.url)
      continue
    }
    if (!faltando.includes(caminho)) faltando.push(caminho)
  }

  if (faltando.length === 0) return url

  const assinar = async (caminho: string) => {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(caminho, segundos, {
      transform: { width: entrega.largura, resize: 'contain', quality: entrega.qualidade },
    })
    // Imagem e acessorio de tela: falhar aqui devolve o mapa sem ela, em vez
    // de derrubar a lista inteira por causa de uma URL que nao assinou.
    return [caminho, data?.signedUrl ?? null] as const
  }

  const assinadas: (readonly [string, string | null])[] = []
  for (let i = 0; i < faltando.length; i += EM_PARALELO) {
    assinadas.push(...(await Promise.all(faltando.slice(i, i + EM_PARALELO).map(assinar))))
  }

  if (CACHE.size > TETO_CACHE) {
    for (const [chave, guardada] of CACHE) {
      if (guardada.expiraEm <= agora) CACHE.delete(chave)
    }
  }

  for (const [caminho, assinada] of assinadas) {
    if (!assinada) continue
    url.set(caminho, assinada)
    CACHE.set(chaveDe(caminho), { url: assinada, expiraEm: agora + segundos * 1000 })
  }
  return url
}
