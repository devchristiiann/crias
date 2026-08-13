// Gera favicon, icones do PWA, badge de notificacao e a logo do app a partir
// de uma unica arte: arte-origem/logo.png.
//
// Uso:
//   node scripts/gerar-icones.mjs
//
// Por que gerar em vez de commitar PNG pronto: trocar a arte da marca precisa
// ser uma operacao de um comando, nao seis exportacoes manuais que saem
// desalinhadas entre si. Este script e a fonte da verdade dos seis arquivos de
// public/ listados em SAIDAS, e roda de novo sem efeito colateral: mesma
// entrada, mesmos bytes.
//
// A arte de origem e a garra em preto com sombreado cinza, contorno branco e
// vaos brancos entre os dedos, sobre fundo branco. Ela tem tres tons e mais
// nada: 67% dos pixels no preto do corpo (luminancia ate 15), 12% no cinza do
// sombreado (perto de 56) e 19% no branco de dentro do desenho. A conversao tem
// tres passos:
//
//   1. Inundacao a partir da borda marca o fundo. So o branco CONECTADO a borda
//      vira fundo: o contorno branco e os vaos entre as garras ficam de fora,
//      porque estao cercados de preto. Sem isso, um corte por limiar global
//      comeria o desenho por dentro.
//   2. Degrade: a luminancia de cada pixel vira um vermelho da rampa. O preto do
//      corpo vira o vermelho escuro, o cinza do sombreado vira o proprio
//      --primary, e dali para cima segue clareando ate o branco. E a distancia
//      entre esses dois vermelhos que mantem o volume da garra.
//   3. O alfa vem da tinta, nao do preenchimento da silhueta: quanto mais
//      escuro, mais opaco. Isso preserva a suavizacao das curvas e deixa o
//      branco de dentro do desenho transparente. Sobre o fundo do icone ele vira
//      a linha clara que separa os dedos, e na logo da tela de entrar ele deixa
//      passar o fundo da pagina, o que faz a mesma imagem servir nos dois temas.
//      O fundo marcado no passo 1 tem o alfa zerado na marra: o branco da arte
//      nao e puro (varia entre 245 e 255) e sem isso a sujeira viraria uma nevoa
//      por cima do icone.
//
// O passo 2 existe porque a primeira versao deste script pintava a garra de
// branco chapado sobre fundo vermelho. Cor chapada joga fora o unico dado que
// separa o corpo do sombreado, e a garra virava um decalque sem profundidade.
// Cor chapada nunca mais: o degrade e o que preserva o desenho.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const RAIZ = new URL('../', import.meta.url)
const caminho = (relativo) => fileURLToPath(new URL(relativo, RAIZ))

// --- cores da marca ---------------------------------------------------------

// A cor vive em src/index.css e em lugar nenhum mais. Ler e converter aqui evita
// a copia de hexadecimal que so alguem percebe estar velha quando o icone ja
// esta na tela de inicio de todo mundo.
const CSS = readFileSync(caminho('src/index.css'), 'utf8')

/** Le um token HSL de src/index.css. Pega a primeira ocorrencia, que e a do
 *  `:root`, ou seja, sempre o tema claro. */
function token(nome) {
  const achado = CSS.match(new RegExp(`--${nome}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`))
  if (!achado) throw new Error(`nao achei --${nome} em src/index.css`)
  const [matiz, saturacao, luz] = achado.slice(1).map(Number)
  return { matiz, saturacao: saturacao / 100, luz: luz / 100 }
}

function hslParaRgb({ matiz: h, saturacao: s, luz: l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const faixa = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][faixa]
  return [r, g, b].map((v) => Math.round((v + m) * 255))
}

const paraHex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

const PRIMARIA = token('primary')

// O icone e um quadrado e precisa de fundo. Ele usa o --background do tema
// claro, nao o vermelho: a arte agora e vermelha, e vermelho sobre vermelho
// some. O mesmo hexadecimal e o quadro do app instalado, conferido em QUADRO no
// fim do arquivo.
const FUNDO_ICONE = paraHex(hslParaRgb(token('background')))

// --- leitura e recorte da arte ----------------------------------------------

const { data, info } = await sharp(caminho('arte-origem/logo.png'))
  .flatten({ background: '#ffffff' })
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width: LARGURA, height: ALTURA } = info
const TOTAL = LARGURA * ALTURA

const luminancia = new Uint8Array(TOTAL)
for (let i = 0; i < TOTAL; i += 1) {
  luminancia[i] = (data[i * 3] * 299 + data[i * 3 + 1] * 587 + data[i * 3 + 2] * 114) / 1000
}

// Passo 1: inundacao de 4 vizinhos a partir de toda a moldura. Pilha explicita
// em vez de recursao porque a imagem tem 4 milhoes de pixels e a chamada
// recursiva estoura a pilha do Node antes de terminar o primeiro lado.
const LIMIAR_FUNDO = 225
const ehFundo = new Uint8Array(TOTAL)
const pilha = new Int32Array(TOTAL)
let topo = 0

const empilhar = (i) => {
  if (!ehFundo[i] && luminancia[i] >= LIMIAR_FUNDO) {
    ehFundo[i] = 1
    pilha[topo] = i
    topo += 1
  }
}

for (let x = 0; x < LARGURA; x += 1) {
  empilhar(x)
  empilhar((ALTURA - 1) * LARGURA + x)
}
for (let y = 0; y < ALTURA; y += 1) {
  empilhar(y * LARGURA)
  empilhar(y * LARGURA + LARGURA - 1)
}
while (topo > 0) {
  topo -= 1
  const i = pilha[topo]
  const x = i % LARGURA
  const y = (i / LARGURA) | 0
  if (x > 0) empilhar(i - 1)
  if (x < LARGURA - 1) empilhar(i + 1)
  if (y > 0) empilhar(i - LARGURA)
  if (y < ALTURA - 1) empilhar(i + LARGURA)
}

// Passo 3: alfa pela tinta, fundo zerado.
const TINTA_CHEIA = 60
const TINTA_ZERO = 238
const alfa = new Uint8Array(TOTAL)
for (let i = 0; i < TOTAL; i += 1) {
  if (ehFundo[i]) continue
  const cobertura = (TINTA_ZERO - luminancia[i]) / (TINTA_ZERO - TINTA_CHEIA)
  alfa[i] = Math.max(0, Math.min(1, cobertura)) * 255
}

// Recorte da moldura vazia: sem isso a arte entraria nos icones com a margem
// enorme do arquivo original e sairia minuscula dentro do quadrado.
let esquerda = LARGURA
let topoY = ALTURA
let direita = -1
let baixo = -1
for (let y = 0; y < ALTURA; y += 1) {
  for (let x = 0; x < LARGURA; x += 1) {
    if (alfa[y * LARGURA + x] <= 8) continue
    if (x < esquerda) esquerda = x
    if (x > direita) direita = x
    if (y < topoY) topoY = y
    if (y > baixo) baixo = y
  }
}
if (direita < 0) throw new Error('a arte ficou vazia depois de remover o fundo')

const ARTE_LARGURA = direita - esquerda + 1
const ARTE_ALTURA = baixo - topoY + 1

// --- rampas de cor ----------------------------------------------------------

/** Luminancia do cinza do sombreado na arte de origem. E o ponto da rampa que
 *  recebe o --primary exato. */
const TOM_SOMBREADO = 56

/** Luminosidade HSL do vermelho que substitui o preto do corpo. Quanto menor,
 *  mais profundidade e mais contraste no tamanho de favicon; abaixo disto o
 *  corpo fecha e o sombreado deixa de ser um degrade para virar um recorte. */
const LUZ_CORPO = 0.24

/** Passo 2: preto do corpo vira vermelho escuro, cinza do sombreado vira o
 *  --primary, e o resto sobe ate o branco. */
const TINGIDA = (lum) => {
  const luz =
    lum <= TOM_SOMBREADO
      ? LUZ_CORPO + (PRIMARIA.luz - LUZ_CORPO) * (lum / TOM_SOMBREADO)
      : PRIMARIA.luz + (1 - PRIMARIA.luz) * ((lum - TOM_SOMBREADO) / (255 - TOM_SOMBREADO))
  return hslParaRgb({ ...PRIMARIA, luz })
}

/** So para o badge do Android, que descarta a cor e le so o alfa. */
const CHAPADA_BRANCA = () => [255, 255, 255]

/** Arte recortada, tingida pela rampa, com o alfa calculado acima. A rampa vira
 *  tabela de 256 entradas: sao dois milhoes de pixels e converter HSL em cada um
 *  seria pagar a mesma conta milhares de vezes pelo mesmo tom. */
function arte(rampa) {
  const tabela = new Uint8Array(256 * 3)
  for (let v = 0; v < 256; v += 1) {
    const [r, g, b] = rampa(v)
    tabela[v * 3] = r
    tabela[v * 3 + 1] = g
    tabela[v * 3 + 2] = b
  }
  const rgba = Buffer.alloc(ARTE_LARGURA * ARTE_ALTURA * 4)
  for (let y = 0; y < ARTE_ALTURA; y += 1) {
    for (let x = 0; x < ARTE_LARGURA; x += 1) {
      const origem = (y + topoY) * LARGURA + (x + esquerda)
      const destino = (y * ARTE_LARGURA + x) * 4
      const tom = luminancia[origem] * 3
      rgba[destino] = tabela[tom]
      rgba[destino + 1] = tabela[tom + 1]
      rgba[destino + 2] = tabela[tom + 2]
      rgba[destino + 3] = alfa[origem]
    }
  }
  return sharp(rgba, { raw: { width: ARTE_LARGURA, height: ARTE_ALTURA, channels: 4 } })
}

const VERMELHA = arte(TINGIDA)
const BRANCA = arte(CHAPADA_BRANCA)

// --- saidas -----------------------------------------------------------------

// `ocupacao` e a fracao do lado do quadrado que a maior dimensao da arte ocupa.
// O resto e respiro.
//
// A arte e quase quadrada (proporcao ~0.88), entao para caber no circulo de
// zona segura de 80% do formato maskable a diagonal precisa caber: com essa
// proporcao, 0.60 e o limite. Acima disso o launcher do Android come a ponta da
// garra ao recortar em circulo ou gota.
const SAIDAS = [
  { nome: 'favicon.png', lado: 48, ocupacao: 0.88, fundo: FUNDO_ICONE, tinta: VERMELHA },
  { nome: 'icone-192.png', lado: 192, ocupacao: 0.78, fundo: FUNDO_ICONE, tinta: VERMELHA },
  { nome: 'icone-512.png', lado: 512, ocupacao: 0.78, fundo: FUNDO_ICONE, tinta: VERMELHA },
  { nome: 'icone-512-maskable.png', lado: 512, ocupacao: 0.6, fundo: FUNDO_ICONE, tinta: VERMELHA },
  // Badge do Android: o sistema descarta a cor e desenha so o alfa como
  // mascara. Precisa ser silhueta branca sobre transparente, senao o aparelho
  // mostra um quadrado cinza no lugar da marca. E a unica saida que nao leva o
  // degrade, porque cor nenhuma sobrevive ali.
  { nome: 'badge.png', lado: 96, ocupacao: 0.94, fundo: null, tinta: BRANCA },
  // Logo dentro do app, sobre o fundo da pagina. O branco de dentro do desenho e
  // transparente, entao ela le no tema claro e no escuro sem precisar de duas
  // imagens e um seletor de tema so para trocar arquivo.
  { nome: 'logo.png', lado: 256, ocupacao: 1, fundo: null, tinta: VERMELHA },
]

for (const saida of SAIDAS) {
  const alvo = Math.round(saida.lado * saida.ocupacao)
  const desenho = await saida.tinta
    .clone()
    .resize({ width: alvo, height: alvo, fit: 'inside' })
    .png()
    .toBuffer()

  const quadro = saida.fundo
    ? sharp({
        create: { width: saida.lado, height: saida.lado, channels: 4, background: saida.fundo },
      })
    : sharp({
        create: {
          width: saida.lado,
          height: saida.lado,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })

  await quadro
    .composite([{ input: desenho, gravity: 'center' }])
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toFile(caminho(`public/${saida.nome}`))

  // Confere o arquivo gravado, nao a variavel que o originou: e o byte no disco
  // que o navegador vai baixar. O canto prova a regra mais facil de quebrar sem
  // perceber, que e badge colorido ou icone com fundo furado.
  const gravado = await sharp(caminho(`public/${saida.nome}`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height } = gravado.info
  if (width !== saida.lado || height !== saida.lado) {
    throw new Error(`${saida.nome} saiu ${width}x${height}, esperava ${saida.lado}`)
  }
  const cantoOpaco = gravado.data[3] === 255
  if (saida.fundo && !cantoOpaco) throw new Error(`${saida.nome} ficou com o fundo furado`)
  if (!saida.fundo && cantoOpaco) throw new Error(`${saida.nome} precisa de fundo transparente`)

  const bytes = readFileSync(caminho(`public/${saida.nome}`)).length
  process.stdout.write(`${saida.nome} ${width}x${height} ${bytes} bytes\n`)
}

// O quadro do app instalado e o mesmo fundo do icone: a moldura da janela, a
// barra de status e a tela de abertura. Sao arquivos estaticos, que nao leem o
// token, entao carregam o hexadecimal escrito na mao. O comentario ao lado deles
// avisa; esta conferencia e quem cobra.
const QUADRO = [
  ['index.html', /name="theme-color" content="(#[0-9a-fA-F]{6})"/],
  ['public/manifest.webmanifest', /"theme_color":\s*"(#[0-9a-fA-F]{6})"/],
  ['public/manifest.webmanifest', /"background_color":\s*"(#[0-9a-fA-F]{6})"/],
]
for (const [arquivo, padrao] of QUADRO) {
  const achado = readFileSync(caminho(arquivo), 'utf8').match(padrao)
  if (!achado) throw new Error(`nao achei a cor do quadro em ${arquivo}`)
  if (achado[1].toLowerCase() !== FUNDO_ICONE) {
    throw new Error(`${arquivo} esta com ${achado[1]} e o fundo do icone e ${FUNDO_ICONE}`)
  }
}
process.stdout.write(`quadro do app instalado ${FUNDO_ICONE}\n`)
