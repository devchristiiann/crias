/**
 * Web Push sobre Web Crypto puro.
 *
 * Implementa o encapsulamento aes128gcm da RFC 8291 e a autenticacao VAPID da
 * RFC 8292. Sem biblioteca porque o runtime ja tem tudo: ECDH P-256, HKDF,
 * AES-GCM e ECDSA. Uma dependencia aqui so acrescentaria superficie de falha
 * num caminho que precisa funcionar sempre.
 */

const CODIFICADOR = new TextEncoder()

export interface Assinatura {
  endpoint: string
  p256dh: string
  auth: string
}

export interface ChavesVapid {
  subject: string
  publicKey: string
  privateKey: string
}

export function base64urlParaBytes(texto: string): Uint8Array {
  const base64 = (texto + '='.repeat((4 - (texto.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const bruto = atob(base64)
  const saida = new Uint8Array(bruto.length)
  for (let i = 0; i < bruto.length; i += 1) saida[i] = bruto.charCodeAt(i)
  return saida
}

export function bytesParaBase64url(bytes: Uint8Array): string {
  let bruto = ''
  for (const b of bytes) bruto += String.fromCharCode(b)
  return btoa(bruto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concatenar(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((soma, p) => soma + p.length, 0)
  const saida = new Uint8Array(total)
  let posicao = 0
  for (const p of partes) {
    saida.set(p, posicao)
    posicao += p.length
  }
  return saida
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const derivado = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    chave,
    bytes * 8,
  )
  return new Uint8Array(derivado)
}

/** Chave publica nao comprimida (0x04 || X || Y) vira JWK para o Web Crypto. */
function jwkDaChave(publica: Uint8Array, privada?: Uint8Array): JsonWebKey {
  if (publica.length !== 65 || publica[0] !== 0x04) {
    throw new Error('Chave pública VAPID fora do formato esperado')
  }
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesParaBase64url(publica.slice(1, 33)),
    y: bytesParaBase64url(publica.slice(33, 65)),
    ext: true,
  }
  if (privada) jwk.d = bytesParaBase64url(privada)
  return jwk
}

async function assinarVapid(endpoint: string, chaves: ChavesVapid): Promise<string> {
  const origem = new URL(endpoint).origin
  const cabecalho = { typ: 'JWT', alg: 'ES256' }
  const corpo = {
    aud: origem,
    // 12 horas: o suficiente para o disparo e curto o bastante se vazar em log.
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: chaves.subject,
  }

  const parte = (o: unknown) => bytesParaBase64url(CODIFICADOR.encode(JSON.stringify(o)))
  const assinavel = `${parte(cabecalho)}.${parte(corpo)}`

  const chave = await crypto.subtle.importKey(
    'jwk',
    jwkDaChave(base64urlParaBytes(chaves.publicKey), base64urlParaBytes(chaves.privateKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const assinatura = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    chave,
    CODIFICADOR.encode(assinavel),
  )

  return `${assinavel}.${bytesParaBase64url(new Uint8Array(assinatura))}`
}

async function cifrar(assinatura: Assinatura, texto: string) {
  const uaPublica = base64urlParaBytes(assinatura.p256dh)
  const authSecret = base64urlParaBytes(assinatura.auth)

  const efemero = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', efemero.publicKey))

  const uaChave = await crypto.subtle.importKey(
    'raw',
    uaPublica,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const segredo = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, efemero.privateKey, 256),
  )

  // RFC 8291: o "key info" amarra o segredo as duas chaves publicas envolvidas.
  const infoChave = concatenar(
    CODIFICADOR.encode('WebPush: info\0'),
    uaPublica,
    asPublica,
  )
  const ikm = await hkdf(authSecret, segredo, infoChave, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, CODIFICADOR.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, CODIFICADOR.encode('Content-Encoding: nonce\0'), 12)

  const chaveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 0x02 marca o ultimo registro. Mensagem cabe sempre em um registro so.
  const claro = concatenar(CODIFICADOR.encode(texto), new Uint8Array([0x02]))
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, chaveAes, claro),
  )

  const tamanhoRegistro = new Uint8Array(4)
  new DataView(tamanhoRegistro.buffer).setUint32(0, 4096)

  return concatenar(salt, tamanhoRegistro, new Uint8Array([asPublica.length]), asPublica, cifrado)
}

export interface ResultadoEnvio {
  status: number
  /** Endpoint morto: a assinatura precisa sair da tabela. */
  expirada: boolean
}

export async function enviarPush(
  assinatura: Assinatura,
  carga: unknown,
  chaves: ChavesVapid,
  ttlSegundos = 3600,
): Promise<ResultadoEnvio> {
  const corpo = await cifrar(assinatura, JSON.stringify(carga))
  const jwt = await assinarVapid(assinatura.endpoint, chaves)

  const resposta = await fetch(assinatura.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${chaves.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSegundos),
      Urgency: 'high',
    },
    body: corpo,
  })

  return { status: resposta.status, expirada: resposta.status === 404 || resposta.status === 410 }
}
