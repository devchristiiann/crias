/**
 * Desenha os sprites de interface: a pocao de vida e o escudo.
 *
 * Uso:
 *   node scripts/gerar-sprites-ui.mjs
 *
 * Estes dois NAO sao itens de loja. Nao entram em `avatar_items`, nao entram
 * no catalogo de pecas e nao tem preco: sao icone de tela, no lugar onde antes
 * havia `Shield` e `HeartPulse` do lucide. O resto do app e pixel art, e um
 * icone de traco no meio disso destoa.
 *
 * A arte e matriz de caractere com paleta, o mesmo formato de `src/lib/sprites.ts`:
 * da para mexer num pixel sem abrir editor de imagem, o resultado e byte a
 * byte o mesmo a cada rodada, e nao depende de gerador de imagem nenhum. A
 * saida e PNG de paleta indexada em `public/sprites/ui/`, 32 por 32,
 * transparente, no mesmo formato dos sprites do avatar.
 *
 * O tamanho 32 nao e enfeite: 16 nao cabe o gargalo da pocao junto com o bojo,
 * e acima de 32 o desenho pede sombra que este estilo nao tem.
 */
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = new URL('../', import.meta.url)
const caminho = (relativo) => fileURLToPath(new URL(relativo, RAIZ))

const LADO = 32

/* Pocao de vida. Rolha, gargalo, bojo redondo e o liquido com o brilho do
 * vidro em pe na esquerda, que e o que faz o bojo parecer curvo. */
const POCAO = {
  paleta: {
    k: '#17161c', // contorno
    c: '#8c5a2b', // rolha
    C: '#b07a3f', // rolha na luz
    v: '#cfe0ec', // vidro
    r: '#c0392b', // liquido
    R: '#e05a4a', // liquido na superficie
    s: '#8a2018', // liquido no fundo
    b: '#ffffff', // brilho
  },
  grade: [
    '................................',
    '................................',
    '............kkkkkkkk............',
    '...........kCCCCCCCck...........',
    '...........kCCCCCCcck...........',
    '...........kcccccccck...........',
    '..........kkkkkkkkkkkk..........',
    '..........kvvvvvvvvvvk..........',
    '..........kkkvvvvvvkkk..........',
    '............kvvvvvvk............',
    '............kvvvvvvk............',
    '...........kkvvvvvvkk...........',
    '.........kkkvvvvvvvvkkk.........',
    '........kkvvvvvvvvvvvvkk........',
    '.......kkvvvvvvvvvvvvvvkk.......',
    '......kkvvvvvvvvvvvvvvvvkk......',
    '.....kkvvbvvvvvvvvvvvvvvvkk.....',
    '.....kvvbbvvvvvvvvvvvvvvvvk.....',
    '.....kRRbbRRRRRRRRRRRRRRRRk.....',
    '.....krrbbrrrrrrrrrrrrrrrrk.....',
    '.....krrbbrrrrrrrrrrrrrrrrk.....',
    '.....krrbrrrrrrrrrrrrrrrrsk.....',
    '.....krrbrrrrrrrrrrrrrrrssk.....',
    '.....krrrrrrrrrrrrrrrrrsssk.....',
    '.....krrrrrrrrrrrrrrrrssssk.....',
    '.....kkrrrrrrrrrrrrrrsssskk.....',
    '......kkrrrrrrrrrrrrsssskk......',
    '.......kkrrrrrrrrrrsssskk.......',
    '........kkkrrrrrrsssskkk........',
    '........kkkkkkkkkkkkkkkk........',
    '................................',
    '................................',
  ],
}

/* Escudo de guerra com cruz. O contorno interno mais escuro que a chapa e o
 * que segura a silhueta em 20 px de tela: sem ele o escudo some no card. */
const ESCUDO = {
  paleta: {
    k: '#17161c', // contorno
    n: '#5a6673', // borda de metal
    m: '#b9c3cf', // chapa
    M: '#7c8a99', // chapa na sombra
    r: '#c0392b', // cruz
    b: '#ffffff', // brilho
  },
  grade: [
    '................................',
    '................................',
    '................................',
    '.....kkkkkkkkkkkkkkkkkkkkkk.....',
    '.....knnnnnnnnnnnnnnnnnnnnk.....',
    '.....knbbmmmmmmmmmmmmmmmmnk.....',
    '.....knbbmmmmmmmmmmmmmmmmnk.....',
    '.....knbmmmmmmmmmmmmmmmmmnk.....',
    '.....knbmmmmmmmmmmmmmmmmmnk.....',
    '.....knmmmmmmmrrrrmmmmmmmnk.....',
    '.....knmmmmmmmrrrrmmmmmmmnk.....',
    '.....knmmmrrrrrrrrrrrrmmmnk.....',
    '.....knmmmrrrrrrrrrrrrmmmnk.....',
    '.....knmmmmmmmrrrrmmmmmMMnk.....',
    '.....knmmmmmmmrrrrmmmmmMMnk.....',
    '.....knmmmmmmmrrrrmmmmmMMnk.....',
    '......knmmmmmmrrrrmmmmMMnk......',
    '......knmmmmmmrrrrmmmmMMnk......',
    '.......knmmmmmrrrrmmmMMnk.......',
    '.......knmmmmmrrrrmmmMMnk.......',
    '........knmmmmrrrrmmMMnk........',
    '........knmmmmrrrrmmMMnk........',
    '.........knmmmrrrrmMMnk.........',
    '.........knmmmrrrrmMMnk.........',
    '..........knmmrrrrMMnk..........',
    '...........knmrrrrMnk...........',
    '............knrrrrnk............',
    '.............knrrnk.............',
    '..............knnk..............',
    '...............kk...............',
    '................................',
    '................................',
  ],
}

const SAIDAS = [
  ['pocao-vida.png', POCAO],
  ['escudo.png', ESCUDO],
]

function bytes(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

/** Matriz de caractere para RGBA cru. Falha alto: linha do tamanho errado ou
 *  caractere fora da paleta sao erros de digitacao que so apareceriam como
 *  buraco no desenho, e buraco em sprite pequeno ninguem percebe revisando. */
function pixels(sprite, nome) {
  if (sprite.grade.length !== LADO) {
    throw new Error(`${nome}: ${sprite.grade.length} linhas, esperava ${LADO}`)
  }
  const px = new Uint8ClampedArray(LADO * LADO * 4)
  sprite.grade.forEach((linha, y) => {
    if (linha.length !== LADO) {
      throw new Error(`${nome}: linha ${y} tem ${linha.length} colunas, esperava ${LADO}`)
    }
    for (let x = 0; x < LADO; x++) {
      const caractere = linha[x]
      if (caractere === '.') continue
      const cor = sprite.paleta[caractere]
      if (!cor) throw new Error(`${nome}: linha ${y} coluna ${x} usa '${caractere}', fora da paleta`)
      const [r, g, b] = bytes(cor)
      const o = (y * LADO + x) * 4
      px[o] = r
      px[o + 1] = g
      px[o + 2] = b
      px[o + 3] = 255
    }
  })
  return px
}

mkdirSync(caminho('public/sprites/ui'), { recursive: true })

for (const [arquivo, sprite] of SAIDAS) {
  const png = await sharp(pixels(sprite, arquivo), {
    raw: { width: LADO, height: LADO, channels: 4 },
  })
    .png({ palette: true, colours: 16, effort: 10, compressionLevel: 9 })
    .toBuffer()
  writeFileSync(caminho('public/sprites/ui/' + arquivo), png)
  console.log(arquivo, LADO + 'x' + LADO, (png.length / 1024).toFixed(1) + 'kb')
}
