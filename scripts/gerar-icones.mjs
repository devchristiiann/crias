// Gera os icones PNG do PWA a partir do sprite base do proprio app.
//
// Uso:
//   node scripts/gerar-icones.mjs
//
// Por que gerar em vez de commitar PNG pronto: o personagem vive em
// src/lib/sprites.ts como matriz de caracteres. Se a paleta do 'base-01' mudar,
// o icone da tela de inicio precisa mudar junto, e isso so acontece se ele for
// derivado da mesma fonte. Rodar de novo e mais barato que abrir um editor.
//
// Por que codificar PNG na mao: pixel art escalada por inteiro nao precisa de
// nenhum filtro, reamostragem ou espaco de cor. O formato PNG minimo (RGBA sem
// filtro por linha) cabe em poucas dezenas de linhas com o zlib da stdlib, o
// que evita colocar sharp ou canvas na arvore de dependencias so por causa de
// cinco arquivos estaticos.
import { deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'

const RAIZ = new URL('../', import.meta.url)
const FUNDO = '#e04545' // mesmo valor do token --primary, hsl(0 67% 56%)

// --- leitura do sprite ------------------------------------------------------

// O sprite mora em TypeScript e este script roda em Node puro, entao a fonte e
// lida como texto. Extrair por regex mantem uma unica copia da arte no projeto:
// duplicar a matriz aqui seria a forma garantida de os dois dessincronizarem.
const fonte = readFileSync(new URL('src/lib/sprites.ts', RAIZ), 'utf8')

const constante = (nome) => {
  const achado = fonte.match(new RegExp(`const ${nome} = '(#[0-9a-fA-F]{6})'`))
  if (!achado) throw new Error(`nao achei a constante ${nome} em sprites.ts`)
  return achado[1]
}

const blocoCorpo = fonte.match(/const CORPO = \[([\s\S]*?)\n\] as const/)
if (!blocoCorpo) throw new Error('nao achei a matriz CORPO em sprites.ts')
const GRADE = blocoCorpo[1].match(/'[^']*'/g).map((linha) => linha.slice(1, -1))

const argumentos = fonte.match(/'base-01':[^)]*paletaBase\(([^)]*)\)/)
if (!argumentos) throw new Error('nao achei a base-01 em sprites.ts')
const [cabelo, pele, peleSombra, camisa, calca, sapato] = argumentos[1].match(/#[0-9a-fA-F]{6}/g)

// Mesma ordem de paletaBase() em sprites.ts.
const PALETA = {
  k: constante('CONTORNO'),
  h: cabelo,
  p: pele,
  P: peleSombra,
  e: constante('OLHO'),
  m: constante('BOCA'),
  c: camisa,
  l: calca,
  b: sapato,
}

const LADO = GRADE.length

// --- codificacao PNG --------------------------------------------------------

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const TABELA_CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(dados) {
  let c = 0xffffffff
  for (const byte of dados) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloco(tipo, dados) {
  const cabecalho = Buffer.alloc(4)
  cabecalho.writeUInt32BE(dados.length, 0)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const verificacao = Buffer.alloc(4)
  verificacao.writeUInt32BE(crc32(corpo), 0)
  return Buffer.concat([cabecalho, corpo, verificacao])
}

function codificarPng(lado, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(lado, 0)
  ihdr.writeUInt32BE(lado, 4)
  ihdr[8] = 8 // 8 bits por canal
  ihdr[9] = 6 // truecolor com alfa
  // compressao 0, filtro 0, entrelacamento 0 ficam em zero por padrao.

  // Cada linha da imagem e precedida pelo byte de filtro. Zero significa "sem
  // filtro": para pixel art com blocos chapados o deflate ja comprime bem, e
  // filtro nenhum e o unico caso que nao precisa de decisao heuristica.
  const passo = 1 + lado * 4
  const bruto = Buffer.alloc(lado * passo)
  for (let y = 0; y < lado; y += 1) {
    rgba.copy(bruto, y * passo + 1, y * lado * 4, (y + 1) * lado * 4)
  }

  return Buffer.concat([
    ASSINATURA,
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(bruto, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

// --- desenho ----------------------------------------------------------------

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

function desenhar({ lado, ocupacao, fundo, monocromatico }) {
  const rgba = Buffer.alloc(lado * lado * 4)

  if (fundo) {
    const [r, g, b] = rgb(fundo)
    for (let i = 0; i < lado * lado; i += 1) {
      rgba[i * 4] = r
      rgba[i * 4 + 1] = g
      rgba[i * 4 + 2] = b
      rgba[i * 4 + 3] = 255
    }
  }

  // Escala inteira e centralizada: qualquer fator fracionario borraria a arte,
  // que so existe porque a borda de cada pixel e dura.
  const escala = Math.max(1, Math.floor((lado * ocupacao) / LADO))
  const inicio = Math.round((lado - LADO * escala) / 2)

  for (let y = 0; y < LADO; y += 1) {
    for (let x = 0; x < LADO; x += 1) {
      const caractere = GRADE[y][x]
      if (caractere === '.') continue
      const cor = monocromatico ? [255, 255, 255] : rgb(PALETA[caractere])
      for (let dy = 0; dy < escala; dy += 1) {
        for (let dx = 0; dx < escala; dx += 1) {
          const px = inicio + x * escala + dx
          const py = inicio + y * escala + dy
          if (px < 0 || py < 0 || px >= lado || py >= lado) continue
          const i = (py * lado + px) * 4
          rgba[i] = cor[0]
          rgba[i + 1] = cor[1]
          rgba[i + 2] = cor[2]
          rgba[i + 3] = 255
        }
      }
    }
  }

  return codificarPng(lado, rgba)
}

const ARQUIVOS = [
  { nome: 'icone-192.png', lado: 192, ocupacao: 0.75, fundo: FUNDO },
  { nome: 'icone-512.png', lado: 512, ocupacao: 0.75, fundo: FUNDO },
  // Maskable: 10% de margem em cada lado porque o Android recorta o icone na
  // forma do launcher (circulo, squircle, gota) e come o que passar da borda.
  { nome: 'icone-512-maskable.png', lado: 512, ocupacao: 0.8, fundo: FUNDO },
  // Badge do Android: o sistema so le o alfa e pinta a silhueta, por isso e
  // branco sobre transparente em vez da paleta colorida.
  { nome: 'badge.png', lado: 72, ocupacao: 0.9, fundo: null, monocromatico: true },
  { nome: 'favicon.png', lado: 48, ocupacao: 1, fundo: FUNDO },
]

for (const arquivo of ARQUIVOS) {
  const png = desenhar(arquivo)
  writeFileSync(new URL(`public/${arquivo.nome}`, RAIZ), png)

  // Confere relendo o IHDR gravado, nao a variavel que originou o arquivo: e o
  // que prova que o byte no disco descreve a imagem prometida.
  const gravado = readFileSync(new URL(`public/${arquivo.nome}`, RAIZ))
  const largura = gravado.readUInt32BE(16)
  const altura = gravado.readUInt32BE(20)
  const assinaturaOk = gravado.subarray(0, 8).equals(ASSINATURA)
  if (!assinaturaOk || largura !== arquivo.lado || altura !== arquivo.lado) {
    throw new Error(`${arquivo.nome} saiu invalido: ${largura}x${altura}`)
  }
  process.stdout.write(`${arquivo.nome} ${largura}x${altura} ${gravado.length} bytes\n`)
}
