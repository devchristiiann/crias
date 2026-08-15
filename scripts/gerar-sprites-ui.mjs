/**
 * Recorta os sprites de interface a partir da arte de origem: a pocao de
 * vida, a pocao de ouro e o escudo de ofensiva.
 *
 * Uso:
 *   node scripts/gerar-sprites-ui.mjs
 *
 * Estes tres NAO sao itens de loja. Nao entram em `avatar_items`, nao entram
 * no catalogo de pecas e nao tem preco: sao icone de tela, no lugar onde
 * antes havia `Shield` e `HeartPulse` do lucide. O resto do app e pixel art,
 * e um icone de traco no meio disso destoa.
 *
 * A arte de origem, `arte-origem/pocoes.jpg`, tem os tres frascos lado a
 * lado, separados por linhas divisorias pretas: vermelha (vida), azul
 * (ouro, pela estrela do rotulo) e verde (escudo, pela folha do rotulo). O
 * arquivo verde continua se chamando `escudo.png` de proposito: e o nome
 * que a tela ja consome, e trocar quebraria isso sem ganhar nada.
 *
 * A saida e PNG de paleta indexada em `public/sprites/ui/`, 64 por 64,
 * transparente, no mesmo formato dos sprites do avatar.
 */
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = new URL('../', import.meta.url)
const caminho = (relativo) => fileURLToPath(new URL(relativo, RAIZ))

const LADO = 64
const ORIGEM = caminho('arte-origem/pocoes.jpg')

// Pixel quase branco em todo canal e fundo, nao desenho: a mesma regra serve
// para achar a caixa do frasco e para virar transparencia.
const QUASE_BRANCO = 235
function ehQuaseBranco(r, g, b) {
  return r > QUASE_BRANCO && g > QUASE_BRANCO && b > QUASE_BRANCO
}

const SAIDAS = [
  ['pocao-vida.png'],
  ['pocao-ouro.png'],
  ['escudo.png'],
]

async function main() {
  const origem = sharp(ORIGEM)
  const meta = await origem.metadata()
  const { width, height } = meta
  const largoTerco = width / 3

  mkdirSync(caminho('public/sprites/ui'), { recursive: true })

  for (let i = 0; i < SAIDAS.length; i++) {
    const [arquivo] = SAIDAS[i]

    // Margem de seguranca de 3% do terco em cada lado, antes do trim: as
    // linhas divisorias pretas duplas vivem exatamente na borda do terco, e
    // sem essa margem elas entrariam na caixa do frasco como se fossem
    // desenho.
    const margem = Math.round(largoTerco * 0.03)
    const left = Math.round(i * largoTerco) + margem
    const right = Math.round((i + 1) * largoTerco) - margem
    const largura = right - left

    const { data, info } = await sharp(ORIGEM)
      .extract({ left, top: 0, width: largura, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Cada frasco tem faiscas soltas espalhadas ao redor, e a faisca mais
    // distante estica a caixa inteira: foi assim que a pocao azul saiu com
    // menos da metade dos pixels opacos das outras. Faisca e ponto isolado,
    // frasco e massa continua, entao conta pixel opaco por linha e por
    // coluna primeiro: uma linha ou coluna so entra na caixa se tiver pelo
    // menos 8% da densidade da linha (ou coluna) mais cheia da imagem. Isso
    // separa os dois sem precisar de lista de excecao por pocao.
    const porLinha = new Array(info.height).fill(0)
    const porColuna = new Array(info.width).fill(0)
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const o = (y * info.width + x) * 4
        if (ehQuaseBranco(data[o], data[o + 1], data[o + 2])) continue
        porLinha[y]++
        porColuna[x]++
      }
    }
    const LIMIAR_DENSIDADE = 0.08
    const maxLinha = porLinha.reduce((m, v) => Math.max(m, v), 0)
    const maxColuna = porColuna.reduce((m, v) => Math.max(m, v), 0)
    const linhaDensa = porLinha.map((c) => c >= maxLinha * LIMIAR_DENSIDADE)
    const colunaDensa = porColuna.map((c) => c >= maxColuna * LIMIAR_DENSIDADE)

    // Caixa dos pixels que nao sao fundo, restrita as linhas e colunas
    // densas. E ela que descarta a metade de baixo vazia da imagem e as
    // faiscas soltas, e sobra so o frasco.
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1
    for (let y = 0; y < info.height; y++) {
      if (!linhaDensa[y]) continue
      for (let x = 0; x < info.width; x++) {
        if (!colunaDensa[x]) continue
        const o = (y * info.width + x) * 4
        if (ehQuaseBranco(data[o], data[o + 1], data[o + 2])) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (maxX < 0) {
      throw new Error(`${arquivo}: nenhum pixel de desenho encontrado no terco ${i}`)
    }

    // Recuo de 2 pixels em volta da caixa: sem ele o filtro de densidade
    // corta rente demais e leva junto o contorno preto do frasco.
    const RECUO = 2
    minX = Math.max(0, minX - RECUO)
    minY = Math.max(0, minY - RECUO)
    maxX = Math.min(info.width - 1, maxX + RECUO)
    maxY = Math.min(info.height - 1, maxY + RECUO)

    const bbLargura = maxX - minX + 1
    const bbAltura = maxY - minY + 1

    // Copia so a caixa recortada, com o fundo ja virando alfa 0 antes do
    // redimensionamento: fazer depois deixa uma franja branca na borda.
    const recorte = Buffer.alloc(bbLargura * bbAltura * 4)
    for (let y = 0; y < bbAltura; y++) {
      for (let x = 0; x < bbLargura; x++) {
        const oOrig = ((y + minY) * info.width + (x + minX)) * 4
        const oNovo = (y * bbLargura + x) * 4
        const r = data[oOrig], g = data[oOrig + 1], b = data[oOrig + 2]
        recorte[oNovo] = r
        recorte[oNovo + 1] = g
        recorte[oNovo + 2] = b
        recorte[oNovo + 3] = ehQuaseBranco(r, g, b) ? 0 : 255
      }
    }

    // Saida em raw, nao em PNG: sharp nao sabe inferir formato de entrada
    // raw, e toBuffer() sem isso falha na hora de compor com o canvas.
    const { data: dadosRedim, info: infoRedim } = await sharp(recorte, {
      raw: { width: bbLargura, height: bbAltura, channels: 4 },
    })
      .resize(LADO, LADO, { fit: 'inside', kernel: 'nearest' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const png = await sharp({
      create: { width: LADO, height: LADO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{
        input: dadosRedim,
        raw: { width: infoRedim.width, height: infoRedim.height, channels: 4 },
        gravity: 'center',
      }])
      .png({ palette: true, colours: 64, compressionLevel: 9 })
      .toBuffer()

    const destino = caminho('public/sprites/ui/' + arquivo)
    writeFileSync(destino, png)

    // Conta pixel opaco na saida final para pegar recorte que so achou fundo.
    const { data: finalData } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let opacos = 0
    for (let p = 3; p < finalData.length; p += 4) {
      if (finalData[p] > 0) opacos++
    }
    if (opacos < 200) {
      console.error(`${arquivo}: so ${opacos} pixels opacos, recorte pegou fundo em vez da pocao`)
      process.exit(1)
    }
    console.log(arquivo, LADO + 'x' + LADO, (png.length / 1024).toFixed(1) + 'kb', opacos + ' px opacos')
  }
}

await main()
