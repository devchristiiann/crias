/**
 * Processa as imagens geradas no Gemini e devolve sprites prontos para o app.
 *
 * O que cada etapa resolve, na ordem em que os problemas aparecem:
 *  1. Fundo. Nem toda imagem veio com magenta em tudo, umas vieram lilas nas
 *     bordas. Por isso o fundo nao e removido por cor fixa: e inundacao a
 *     partir da borda, que pega qualquer fundo chapado, seja ele qual for.
 *  2. Copias. Varias imagens vieram com o mesmo personagem tres vezes, e uma
 *     veio com um respingo solto. As ilhas de pixel sao agrupadas por posicao
 *     horizontal e so o maior grupo sobrevive.
 *  3. Grade nativa. A imagem tem 2048 px mas o pixel de verdade e um bloco de
 *     dezenas de px. Reduzir sem descobrir o tamanho do bloco borra tudo.
 *  4. Compressao. Paleta indexada, que e onde pixel art fica em poucos KB.
 */
import sharp from 'sharp'
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ENTRADA = '~/Downloads'
const SAIDA = '~/Desktop/Kortx/PROJETO - Crias/public/sprites'

/* Mapa gerado a partir da inspecao visual das folhas de contato. A chave e o
 * pedaco unico do nome que o Gemini gera. */
const MAPA = {
  personagem: {
    '1fg769': ['rob-1', 'Robô Sucata'],      '217l8i': ['pes-3', 'Anã Ferreira'],
    '3ggga5': ['anp-4', 'Lobo'],             '5uxrlq': ['pes-5', 'Criança Aventureira'],
    '7foj91': ['rob-4', 'Andróide Polido'],  '7lg4w7': ['anf-7', 'Filhote de Foca'],
    '8nqiec': ['deu-1', 'Mini Zeus'],        'av6et0': ['anf-1', 'Panda'],
    'b085f4': ['deu-5', 'Medusa'],           'ba1kl5': ['anf-2', 'Raposa'],
    'bezyrj': ['deu-2', 'Mini Thor'],        'bnzail': ['mof-5', 'Morceguinho'],
    'cna7js': ['pes-2', 'Mago Barrigudo'],   'diaf5y': ['anf-4', 'Capivara'],
    'gfkld4': ['fol-2', 'Curupira'],         'jf74pe': ['fol-4', 'Boitatá'],
    'k4uaho': ['rob-3', 'Drone Mensageiro'], 'kq2fzx': ['mof-3', 'Fantasminha'],
    'lalo5l': ['pes-6', 'Corredora'],        'mc031d': ['anp-2', 'Urso Ranzinza'],
    'natv6t': ['pes-4', 'Vovó Guerreira'],   'nqa50w': ['anf-5', 'Pinguim'],
    'o9rixo': ['mop-6', 'Golem de Pedra'],   'p3bfqi': ['pes-1', 'Guerreira Robusta'],
    'q314w9': ['mop-4', 'Esqueleto'],        'q5i935': ['mop-3', 'Slime Mutante'],
    'scjjl2': ['deu-6', 'Kitsune'],          'skrnhx': ['anf-3', 'Coelho'],
    'xht923': ['deu-4', 'Poseidon'],         'yd3vbm': ['anp-1', 'T-Rex'],
    'z1vwao': ['anp-6', 'Águia'],
  },
  atleta: {
    '2qpx24': ['atl-1', 'Camisa 10'],   'jkp8qi': ['atl-2', 'Lenda do Garrafão'],
    'oc47se': ['atl-3', 'Rei da Quadra'], 'pzdsn5': ['atl-4', 'Cabeceador'],
    'yz0g3l': ['atl-5', 'Sorriso Craque'],
  },
  cenario: {
    '1nynfp': ['cen-4', 'Aura de Fogo'],       '52al5p': ['cen-1', 'Pedestal de Madeira'],
    '5enxj5': ['cen-10', 'Moldura Lendária'],  'gsmakk': ['cen-7', 'Chuva de Estrelas'],
    'h1ygbr': ['cen-5', 'Aura de Gelo'],       'j3l1w6': ['cen-3', 'Pedestal de Ouro'],
    'neve0b': ['cen-6', 'Aura Elétrica'],      'r71wvn': ['cen-2', 'Pedestal de Pedra'],
  },
  fundo: {
    '2lwxcv': ['fun-1', 'Portal Celeste'], 'cnrd2b': ['fun-2', 'Caverna de Lava'],
    'dbj0hv': ['fun-3', 'Ruínas Douradas'], 'k8bsgr': ['fun-4', 'Bosque Encantado'],
  },
  item: {
    '2098ho': ['ace-14', 'Raio'],            '3fs9o4': ['ace-15', 'Capa'],
    'ggz7kg': ['ace-3', 'Capacete Viking'],  'iw9kpc': ['ace-2', 'Chapéu de Mago'],
    'kgcd6t': ['ace-1', 'Coroa'],            'sdjb2h': ['ace-10', 'Cajado'],
    'v633pm': ['ace-11', 'Martelo'],         'xjxbtl': ['ace-12', 'Espada de Raio'],
    'zkq1vz': ['ace-16', 'Asas'],
  },
}

/* Fundo de perfil e cena inteira, nao tem recorte nem silhueta: passa direto
 * para a reducao. Os outros tipos sao recortados. */
const ALVO = { personagem: 128, atleta: 128, cenario: 128, item: 96, fundo: 384 }
const TOL_FUNDO = 46

/* Imagens que o Gemini devolveu com a mesma arte repetida lado a lado. */
const TRIPLICADOS = new Set(['rob-1', 'anf-1'])
/* Imagens com respingo solto que nao faz parte do desenho. */
const RESPINGO = new Set(['anp-1'])

async function carregar(caminho) {
  const { data, info } = await sharp(caminho).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { px: data, w: info.width, h: info.height }
}

const dist = (b, a, c) =>
  Math.abs(b[a] - b[c]) + Math.abs(b[a + 1] - b[c + 1]) + Math.abs(b[a + 2] - b[c + 2])

/**
 * Inundacao a partir da borda. Pega fundo chapado de qualquer cor, e nao so
 * magenta, porque algumas imagens vieram lilas nas laterais.
 *
 * A comparacao e sempre contra as cores colhidas NA BORDA, nunca contra o
 * pixel vizinho. Comparar com o vizinho parece equivalente e nao e: numa
 * imagem com o fundo levemente degrade, cada passo cabe na tolerancia e a
 * inundacao caminha para dentro do personagem. Foi assim que a capivara virou
 * um contorno oco na primeira passada.
 */
function coresDaBorda({ px, w, h }) {
  const reps = []
  const ver = (x, y) => {
    const o = (y * w + x) * 4
    for (const r of reps) {
      if (Math.abs(r[0] - px[o]) + Math.abs(r[1] - px[o + 1]) + Math.abs(r[2] - px[o + 2]) <= 70) {
        r[3]++
        return
      }
    }
    if (reps.length < 8) reps.push([px[o], px[o + 1], px[o + 2], 1])
  }
  for (let x = 0; x < w; x += 2) { ver(x, 0); ver(x, h - 1) }
  for (let y = 0; y < h; y += 2) { ver(0, y); ver(w - 1, y) }
  // Cor que aparece em menos de 2% da borda e detalhe vazado, nao e fundo.
  const minimo = ((w + h) / 2) * 0.02
  return reps.filter((r) => r[3] >= minimo)
}

function ehFundo(px, o, reps, tol) {
  for (const r of reps) {
    if (Math.abs(r[0] - px[o]) + Math.abs(r[1] - px[o + 1]) + Math.abs(r[2] - px[o + 2]) <= tol) return true
  }
  return false
}

function removerFundo(img) {
  const { px, w, h } = img
  const reps = coresDaBorda(img)
  if (!reps.length) throw new Error('não achei cor de fundo na borda')

  const fundo = new Uint8Array(w * h)
  const fila = []
  const empilhar = (x, y) => {
    const i = y * w + x
    if (fundo[i] || !ehFundo(px, i * 4, reps, TOL_FUNDO)) return
    fundo[i] = 1
    fila.push(i)
  }
  for (let x = 0; x < w; x++) { empilhar(x, 0); empilhar(x, h - 1) }
  for (let y = 0; y < h; y++) { empilhar(0, y); empilhar(w - 1, y) }
  while (fila.length) {
    const i = fila.pop()
    const x = i % w, y = (i / w) | 0
    if (x > 0) empilhar(x - 1, y)
    if (x < w - 1) empilhar(x + 1, y)
    if (y > 0) empilhar(x, y - 1)
    if (y < h - 1) empilhar(x, y + 1)
  }

  // Halo: o pixel da borda do contorno vem meio misturado com o fundo e vira
  // franja rosa em cima de qualquer tela. Duas passadas de erosao so em quem
  // encosta no fundo e ainda parece fundo, com tolerancia maior.
  for (let passada = 0; passada < 2; passada++) {
    const marcar = []
    for (let i = 0; i < w * h; i++) {
      if (fundo[i]) continue
      const x = i % w, y = (i / w) | 0
      const vizinho =
        (x > 0 && fundo[i - 1]) || (x < w - 1 && fundo[i + 1]) ||
        (y > 0 && fundo[i - w]) || (y < h - 1 && fundo[i + w])
      if (vizinho && ehFundo(px, i * 4, reps, TOL_FUNDO * 2.6)) marcar.push(i)
    }
    if (!marcar.length) break
    for (const i of marcar) fundo[i] = 1
  }

  // Magenta sobrevivente. O que ficou preso dentro da silhueta nao encosta na
  // borda, entao a inundacao nunca chega nele. Como magenta nao existe em
  // nenhuma arte desta colecao, apagar por cor pura aqui e seguro.
  for (const r of reps) {
    if (!(r[0] > 150 && r[2] > 150 && r[1] < 110)) continue
    for (let i = 0; i < w * h; i++) {
      const o = i * 4
      if (Math.abs(r[0] - px[o]) + Math.abs(r[1] - px[o + 1]) + Math.abs(r[2] - px[o + 2]) <= 130) fundo[i] = 1
    }
  }

  for (let i = 0; i < w * h; i++) if (fundo[i]) px[i * 4 + 3] = 0
}

/** Faixas de colunas com conteudo, separadas por colunas totalmente vazias. */
function faixas({ px, w, h }) {
  const cheia = new Uint8Array(w)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) if (px[(y * w + x) * 4 + 3]) { cheia[x] = 1; break }
  }
  const fs = []
  let ini = -1
  for (let x = 0; x <= w; x++) {
    if (x < w && cheia[x]) { if (ini < 0) ini = x }
    else if (ini >= 0) { fs.push([ini, x - 1]); ini = -1 }
  }
  return fs
}

/**
 * Ilhas de pixel opaco, agrupadas por proximidade horizontal.
 *
 * Por padrao TUDO fica: asa esquerda, rabo solto e chuva de estrelas sao
 * ilhas separadas de proposito, e escolher so a maior mutila o sprite. Some
 * apenas respingo, e o grupo do meio so e escolhido em quem veio triplicado.
 */
function figuras({ px, w, h }, escolha) {
  const marca = new Int32Array(w * h).fill(-1)
  const ilhas = []
  for (let s = 0; s < w * h; s++) {
    if (px[s * 4 + 3] === 0 || marca[s] >= 0) continue
    const id = ilhas.length
    const ilha = { area: 0, x0: w, x1: 0, y0: h, y1: 0 }
    const fila = [s]
    marca[s] = id
    while (fila.length) {
      const i = fila.pop()
      const x = i % w, y = (i / w) | 0
      ilha.area++
      if (x < ilha.x0) ilha.x0 = x
      if (x > ilha.x1) ilha.x1 = x
      if (y < ilha.y0) ilha.y0 = y
      if (y > ilha.y1) ilha.y1 = y
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (px[j * 4 + 3] === 0 || marca[j] >= 0) continue
        marca[j] = id
        fila.push(j)
      }
    }
    ilhas.push(ilha)
  }
  if (!ilhas.length) throw new Error('imagem ficou vazia depois de remover o fundo')

  // Agrupa ilhas que se sobrepoem no eixo x, com folga: rabo, chifre e cauda
  // frequentemente sao ilhas separadas do corpo, e nao podem ser perdidos.
  const folga = Math.round(w * 0.02)
  const grupos = []
  for (const ilha of ilhas.slice().sort((a, b) => a.x0 - b.x0)) {
    const g = grupos.find((g) => ilha.x0 <= g.x1 + folga && ilha.x1 >= g.x0 - folga)
    if (g) {
      g.area += ilha.area
      g.x0 = Math.min(g.x0, ilha.x0); g.x1 = Math.max(g.x1, ilha.x1)
      g.y0 = Math.min(g.y0, ilha.y0); g.y1 = Math.max(g.y1, ilha.y1)
    } else grupos.push({ ...ilha })
  }
  grupos.sort((a, b) => a.x0 - b.x0)
  const maior = grupos.reduce((a, b) => (b.area > a.area ? b : a))

  // Respingo solto so e removido em quem tem respingo, senao asa esquerda e
  // chuva de estrelas somem junto.
  // Meio por cento do maior grupo e fagulha de brilho do fundo, nunca desenho.
  // Se sobrar, ela estica a caixa e o personagem sai minusculo no recorte.
  const piso = escolha === 'respingo' ? 0.15 : 0.005
  const mantidos = grupos.filter((g) => g.area >= maior.area * piso)

  const caixa = mantidos.reduce((a, g) => ({
    x0: Math.min(a.x0, g.x0), x1: Math.max(a.x1, g.x1),
    y0: Math.min(a.y0, g.y0), y1: Math.max(a.y1, g.y1),
  }), { x0: w, x1: 0, y0: h, y1: 0 })

  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] === 0) continue
    const x = i % w, y = (i / w) | 0
    const dentro = mantidos.some((g) => x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1)
    if (!dentro) px[i * 4 + 3] = 0
  }
  return { caixa, ilhas: ilhas.length, grupos: grupos.length, mantidos: mantidos.length }
}

/** Descobre o tamanho do bloco de pixel da arte. */
function grade({ px, w, h }, x0, y0, x1, y1) {
  const larg = x1 - x0 + 1
  const contagem = new Map()
  for (let y = y0; y <= y1; y += 3) {
    let corrida = 1
    for (let x = x0 + 1; x <= x1; x++) {
      const a = (y * w + x) * 4, b = (y * w + x - 1) * 4
      const igual = px[a + 3] === px[b + 3] && dist(px, a, b) === 0
      if (igual) corrida++
      else { if (corrida > 1) contagem.set(corrida, (contagem.get(corrida) || 0) + 1); corrida = 1 }
    }
  }
  let melhor = 1, votos = 0
  for (const [tam, n] of contagem) if (tam >= 4 && tam <= 64 && n > votos) { votos = n; melhor = tam }
  // Confere: o bloco tem que caber um numero razoavel de vezes na largura.
  if (larg / melhor < 12 || larg / melhor > 400) melhor = Math.max(1, Math.round(larg / 96))
  return melhor
}

async function processar(tipo, arquivo, id, nome) {
  const img = await carregar(arquivo)
  const relatorio = { id, nome, tipo }

  let x0 = 0, y0 = 0, x1 = img.w - 1, y1 = img.h - 1
  if (tipo !== 'fundo') {
    removerFundo(img)

    if (TRIPLICADOS.has(id)) {
      // Mesma arte repetida lado a lado. As copias sao separadas por colunas
      // totalmente vazias, entao a divisao e exata. Fica a do meio.
      const fs = faixas(img)
      if (fs.length < 2) throw new Error(`esperava copias lado a lado, achei ${fs.length} faixa`)
      const [fx0, fx1] = fs[Math.floor(fs.length / 2)]
      for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) if (x < fx0 || x > fx1) img.px[(y * img.w + x) * 4 + 3] = 0
      }
      relatorio.copias = fs.length
    }

    const r = figuras(img, RESPINGO.has(id) ? 'respingo' : 'tudo')
    relatorio.ilhas = r.ilhas
    relatorio.grupos = r.grupos
    ;({ x0, y0, x1, y1 } = { x0: r.caixa.x0, y0: r.caixa.y0, x1: r.caixa.x1, y1: r.caixa.y1 })
  }

  const bloco = grade(img, x0, y0, x1, y1)
  relatorio.bloco = bloco
  const nativoL = Math.max(1, Math.round((x1 - x0 + 1) / bloco))
  const nativoA = Math.max(1, Math.round((y1 - y0 + 1) / bloco))
  const teto = ALVO[tipo]
  const escala = Math.min(1, teto / Math.max(nativoL, nativoA))
  const destL = Math.max(8, Math.round(nativoL * escala))
  const destA = Math.max(8, Math.round(nativoA * escala))
  relatorio.saida = destL + 'x' + destA

  let cano = sharp(img.px, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize(destL, destA, { kernel: 'nearest' })

  // Alfa binario. Meio transparente em pixel art so produz borda suja.
  const { data, info } = await cano.raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * 4
    // Reduzir mistura cor de fundo com contorno e cria magenta novo, que nao
    // existia antes da reducao. Ultima varredura, ja no tamanho final.
    if (data[o] > 140 && data[o + 2] > 140 && data[o + 1] < 100) { data[o + 3] = 0; continue }
    data[o + 3] = data[o + 3] < 128 ? 0 : 255
  }

  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ palette: true, colours: tipo === 'fundo' ? 128 : 48, effort: 10, compressionLevel: 9 })
    .toBuffer()

  const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const destino = join(SAIDA, tipo === 'fundo' ? 'fundos' : tipo === 'item' ? 'itens' : tipo === 'cenario' ? 'cenarios' : 'personagens', `${id}-${slug}.png`)
  writeFileSync(destino, png)
  relatorio.arquivo = destino.slice(destino.indexOf('/sprites/'))
  relatorio.kb = +(png.length / 1024).toFixed(1)

  // Ancora do chapeu: topo do conteudo, no centro horizontal da silhueta.
  // ponytail: a ancora da mao sai de uma fracao fixa da altura. Serve para
  // 90% dos corpos; o resto se corrige a mao no manifesto depois de ver.
  if (tipo === 'personagem' || tipo === 'atleta') {
    relatorio.ancoraCabeca = [Math.round(destL / 2), 0]
    relatorio.ancoraMao = [Math.round(destL * 0.86), Math.round(destA * 0.58)]
  }
  return relatorio
}

mkdirSync(SAIDA, { recursive: true })
for (const sub of ['personagens', 'itens', 'cenarios', 'fundos']) mkdirSync(join(SAIDA, sub), { recursive: true })

const PASTAS = { personagem: 'Personagens', atleta: 'Personagens/atletaas', cenario: 'Fundos', fundo: 'Fundos', item: 'Itens' }
const manifesto = []
const erros = []

for (const [tipo, mapa] of Object.entries(MAPA)) {
  const dir = join(ENTRADA, PASTAS[tipo])
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.png'))
  for (const [chave, [id, nome]] of Object.entries(mapa)) {
    const achado = arquivos.find((f) => f.includes(chave))
    if (!achado) { erros.push(`${id} ${nome}: nenhum arquivo com "${chave}" em ${PASTAS[tipo]}`); continue }
    try {
      const r = await processar(tipo, join(dir, achado), id, nome)
      manifesto.push(r)
      console.log(`${r.id.padEnd(7)} ${r.nome.padEnd(22)} bloco ${String(r.bloco).padStart(2)}  ${r.saida.padEnd(9)} ${String(r.kb).padStart(5)} KB  ${r.grupos > 1 ? "grupos " + r.grupos : ""}`)
    } catch (e) {
      erros.push(`${id} ${nome}: ${e.message}`)
    }
  }
}

writeFileSync(join(SAIDA, 'manifesto.json'), JSON.stringify(manifesto, null, 2))
const total = manifesto.reduce((s, r) => s + r.kb, 0)
console.log(`\n${manifesto.length} sprites, ${total.toFixed(0)} KB no total`)
if (erros.length) { console.log('\nFALHAS:'); erros.forEach((e) => console.log('  ' + e)) }
