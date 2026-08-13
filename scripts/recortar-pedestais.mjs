/**
 * Recorta os tres cenarios de pedestal numa plataforma baixa.
 *
 * Uso:
 *   node scripts/recortar-pedestais.mjs
 *   node scripts/gerar-catalogo.mjs
 *
 * Por que existe: a arte saiu do gerador como movel inteiro, alta demais para
 * ser chao. `cen-2` tinha 100 por 128 e `cen-3` 128 por 119, quase quadrados.
 * Desenhados sob os pes numa faixa baixa, um sprite desses ou aparece como
 * tira de 20% de largura, ou vira painel atras do corpo. Nenhum dos dois e
 * pedestal. O que serve de plataforma e a superficie de cima mais um corpo
 * curto, e e exatamente esse pedaco que este script isola.
 *
 * O corte e sempre do topo para baixo, na altura que da o `ASPECTO` alvo sobre
 * a largura real da arte. Assim os tres saem com a mesma proporcao e o Avatar
 * pode ter uma unica caixa de plataforma para todos, sem tarja preta e sem
 * numero por id.
 *
 * O arquivo e regravado com o MESMO nome e o MESMO id: os ids sao os mesmos de
 * `avatar_items`, e trocar um deles apagaria a posse de quem ja comprou.
 *
 * Roda de novo sem estragar o que ja foi cortado: quem ja esta baixo o
 * bastante e pulado. Depois de rodar `processar-sprites.mjs` de novo, os PNG
 * voltam altos e este script volta a ter trabalho.
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = new URL('../', import.meta.url)
const caminho = (relativo) => fileURLToPath(new URL(relativo, RAIZ))

/** Largura dividida pela altura da plataforma pronta. Casa com a caixa que o
 *  Avatar reserva para o chao (CHAO_LARGURA sobre CHAO_ALTURA). */
const ASPECTO = 2.8

/** Folga do "ja esta baixo". Sem ela, cada rodada raspava mais uma linha,
 *  porque a largura encolhe no reenquadramento e a altura alvo cai junto. */
const FOLGA = 2

const PEDESTAIS = ['cen-1', 'cen-2', 'cen-3']

/** Menor retangulo que contem todo pixel opaco. */
function caixa(px, largura, altura) {
  let x0 = largura
  let y0 = altura
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (px[(y * largura + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) throw new Error('sprite sem nenhum pixel opaco')
  return { x0, y0, x1, y1 }
}

const manifesto = JSON.parse(readFileSync(caminho('public/sprites/manifesto.json'), 'utf8'))

for (const id of PEDESTAIS) {
  const registro = manifesto.find((r) => r.id === id)
  if (!registro) throw new Error('nao achei no manifesto: ' + id)

  const destino = caminho('public' + registro.arquivo)
  const { data, info } = await sharp(destino).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const inteira = caixa(data, info.width, info.height)
  const largura = inteira.x1 - inteira.x0 + 1
  const altura = inteira.y1 - inteira.y0 + 1
  const alvo = Math.round(largura / ASPECTO)

  if (altura <= alvo + FOLGA) {
    console.log(id, 'ja e plataforma', largura + 'x' + altura)
    continue
  }

  const faixa = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: inteira.x0, top: inteira.y0, width: largura, height: alvo })
    .raw()
    .toBuffer()

  // Reenquadrar de novo na horizontal. A base larga do movel podia ser o que
  // definia a largura, e ela nao esta mais aqui: sem esta segunda passada
  // sobrariam colunas vazias na lateral e a plataforma nasceria descentrada.
  const util = caixa(faixa, largura, alvo)
  const larguraFinal = util.x1 - util.x0 + 1
  const bruto = await sharp(faixa, { raw: { width: largura, height: alvo, channels: 4 } })
    .extract({ left: util.x0, top: 0, width: larguraFinal, height: alvo })
    .raw()
    .toBuffer()

  // Mesma compressao do pipeline: paleta indexada e 48 cores, que e onde pixel
  // art fica em poucos KB sem perder cor chapada.
  const png = await sharp(bruto, { raw: { width: larguraFinal, height: alvo, channels: 4 } })
    .png({ palette: true, colours: 48, effort: 10, compressionLevel: 9 })
    .toBuffer()

  writeFileSync(destino, png)
  registro.saida = larguraFinal + 'x' + alvo
  registro.kb = +(png.length / 1024).toFixed(1)
  console.log(id, largura + 'x' + altura, '->', registro.saida, registro.kb + 'kb')
}

writeFileSync(caminho('public/sprites/manifesto.json'), JSON.stringify(manifesto, null, 2) + '\n')
console.log('manifesto atualizado')
