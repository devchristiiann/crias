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
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/* A raiz sai do proprio arquivo, e nao de um caminho escrito a mao. O caminho
 * fixo apontava para uma pasta que nao existe mais desde que o projeto mudou de
 * lugar, e a falha era silenciosa: sem a pasta, todo `cria` caia em "sem arte
 * de origem" e o script terminava dizendo que estava tudo certo. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRADA = '~/Downloads'
const SAIDA = join(RAIZ, 'public/sprites')
const MANIFESTO = join(SAIDA, 'manifesto.json')

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
  /* Arte que o dono desenhou, e nao o Gemini. Mora dentro do repositorio, em
   * arte-origem/personagens, porque so o que esta versionado e reprocessavel:
   * a pasta de Downloads que gerou os 36 primeiros ja nao existe mais, e por
   * isso nenhum deles pode ser refeito hoje. O nome do arquivo carrega o nome
   * visivel e o preco em ouro, e e dali que os dois saem. */
  cria: {
    'Lulu': ['cri-1', 'Lulu do dia a dia'],
    'Nata': ['cri-2', 'Nata gameplay'],
    'Goiabeira': ['cri-3', 'Goiabeira'],
    'Gustavo Pai': ['cri-4', 'Gustavo Pai'],
    'TH Dictador': ['cri-5', 'TH Dictador'],
    'Thiago Uminha': ['cri-6', 'Thiago Uminha'],
    'Melo Goat': ['cri-7', 'Melo Goat'],
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
const ALVO = { personagem: 128, atleta: 128, cria: 128, cenario: 128, item: 96, fundo: 384 }
/**
 * Tolerancia da inundacao.
 *
 * Casada com o agrupamento de `coresDaBorda`, que junta numa mesma cor de fundo
 * tudo que estiver a 70 de distancia. Enquanto valeu 46, os dois numeros se
 * contradiziam: o cinza intermediario das quinas do xadrez de transparencia do
 * Gustavo Pai era agrupado no representante 217 na hora de colher a borda, e
 * depois recusado na hora de inundar, porque dele ate o representante ha 57. O
 * resultado eram lascas brancas soltas no meio do sprite, uma na virilha e uma
 * ao lado do chinelo. Cor que conta como fundo ao colher tem que contar como
 * fundo ao apagar.
 */
const TOL_FUNDO = 70

/**
 * Tipos que passam por `assentar()`: tela de 128 por 128, pe na mesma linha,
 * cabeca e mao medidas no pixel.
 */
const ASSENTADOS = new Set(['personagem', 'atleta', 'cria'])

/**
 * Piso de area por ILHA, em fracao da maior ilha, e nao por grupo.
 *
 * Fica em zero por padrao de proposito: a chuva de estrelas do cen-7 e dezenas
 * de ilhas minusculas legitimas, e qualquer piso a apagaria. Ligado so em quem
 * tem sujeira de origem, que na arte do dono e de tres tipos diferentes: o
 * risco de linha de chao do Goiabeira, o brilho solto do Nata e os quadradinhos
 * do xadrez de transparencia do Gustavo Pai, que ficam num cinza intermediario
 * que nao bate com nenhuma das duas cores colhidas na borda.
 */
const PISO_ILHA = { cria: 0.005 }

/**
 * Toda arte de personagem sai numa tela unica de 128 por 128, com o pe na
 * mesma linha e o corpo centralizado. Sem isso um coelho recortado no proprio
 * quadro fica do tamanho de um golem, e o chapeu nao tem onde sentar porque
 * cada sprite tem a cabeca numa altura diferente.
 *
 * O fator abaixo e o unico lugar onde tamanho relativo existe. Fica perto de 1
 * de proposito: diferenca grande demais foi exatamente a reclamacao.
 */
const LADO_PADRAO = 128
const CHAO = 124
const TOPO = 6
const FATOR_FAMILIA = { pes: 0.97, anf: 0.88, anp: 1.0, mof: 0.84, mop: 1.0, deu: 0.97, fol: 0.95, rob: 0.92, atl: 0.97, cri: 0.97 }
/* Bicho que flutua nao encosta o pe no chao. */
const FLUTUA = new Set(['rob-3', 'mof-3', 'mof-5', 'fol-4', 'cen-7'])

/**
 * Correcao de ancora medida a olho no sprite pronto, ampliado.
 *
 * A medicao automatica supoe o que o prompt do Gemini garantia: personagem de
 * pe, sem chapeu, com o braco solto ao lado do corpo. A arte do dono nao segue
 * nada disso, e cada desvio quebra uma medida diferente:
 *
 *  - Busto nao tem cintura em 58% da altura: ali fica o peito. A mao medida
 *    automaticamente cai no cotovelo ou no ombro, e o item da loja nasce
 *    flutuando ao lado da cabeca.
 *  - Mao ja ocupada (bengala, cartas, trofeu) empurra a coluna mais externa
 *    para o objeto, e nao para a mao.
 *
 * `cabecaY` NAO e corrigido em quem ja usa chapeu, e isso foi conferido nas
 * montagens, nao suposto: no topo do chapeu proprio o chapeu da loja cobre o
 * de baixo, e descer a ancora para a testa so faria a peca da loja afundar no
 * rosto. O panama do cri-1 e a boina do cri-5 continuam aparecendo por baixo.
 *
 * Os numeros sao pixels da tela de 128 por 128 ja assentada. Deixar em branco
 * devolve a medicao automatica.
 */
const ANCORA_MANUAL = {
  // Busto. A 58% da altura fica o peito, e a coluna mais externa dali e o
  // cotovelo apoiado na mesa: o item nascia flutuando na altura do ombro.
  // Vai para a mao que segura as cartas, unica mao visivel do desenho.
  'cri-2': { cabecaLargura: 36, maoX: 66, maoY: 90 },
  // De pe, mas de braco colado: a 58% a coluna mais externa e o cotovelo.
  // A mao esta 22 px mais abaixo.
  'cri-3': { cabecaX: 65, maoY: 92 },
  'cri-4': { maoX: 82, maoY: 70 },
  // Busto. A mao esquerda, a que segura a placa, e a que fica na silhueta;
  // a direita e um punho em perspectiva no meio do peito e levaria o item
  // para cima do rosto.
  'cri-5': { maoX: 88, maoY: 82 },
}

/**
 * Onde cada acessorio encosta. Sem isso o Avatar so conhecia a ancora de
 * cabeca e punha espada, cajado e raio na testa da pessoa.
 */
const ENCAIXE = {
  'ace-1': 'cabeca', 'ace-2': 'cabeca', 'ace-3': 'cabeca',
  'ace-10': 'mao', 'ace-11': 'mao', 'ace-12': 'mao', 'ace-14': 'mao',
  'ace-15': 'costas', 'ace-16': 'costas',
}

/**
 * Quem tem fundo PRESO dentro da silhueta, e por isso pede a segunda varredura.
 *
 * A inundacao entra pela borda, entao ela nunca alcanca o vao entre as pernas,
 * nem o buraco entre o braco e o tronco: o contorno do desenho fecha a passagem.
 * Foi assim que o Goiabeira ficou com um bloco branco de 55 mil pixels entre as
 * coxas e o Uminha com dois vaos brancos.
 *
 * A lista e por id de proposito, e nao uma regra ligada para todos, porque
 * branco preso nem sempre e fundo. No cri-5 o troféu é de acrílico e o vidro
 * está desenhado no mesmo branco chapado do fundo: apagar por cor abriria dois
 * rasgos no prêmio. No cri-1 o terno é branco. Cada id aqui foi conferido no
 * sprite ampliado, um a um, depois de rodar.
 */
const FUNDO_PRESO = new Set(['cri-3', 'cri-4', 'cri-6'])

/**
 * Tolerancia da segunda varredura, bem mais apertada que a da inundacao.
 *
 * A inundacao pode ser generosa porque cresce a partir de pixel que ja e fundo
 * comprovado. Aqui nao ha vizinhanca para confiar, so a cor, entao o cerco e
 * fechado: quase o valor exato colhido na borda.
 */
const TOL_PRESO = 14

/**
 * Piso do vao preso, em fracao do MAIOR vao preso da propria imagem.
 *
 * Fracao do maior, e nao numero absoluto, porque o que separa fundo de detalhe
 * do desenho aqui e ordem de grandeza: no Goiabeira o vao entre as pernas tem
 * 55 mil pixels e o branco da manga tem mil. Um piso absoluto teria que ser
 * reajustado a cada arte nova; este se ajusta sozinho.
 */
const PISO_PRESO = 0.1

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
  const ver = (x, y, lado) => {
    const o = (y * w + x) * 4
    for (const r of reps) {
      if (Math.abs(r[0] - px[o]) + Math.abs(r[1] - px[o + 1]) + Math.abs(r[2] - px[o + 2]) <= 70) {
        r[3]++
        r[4] |= lado
        return
      }
    }
    if (reps.length < 8) reps.push([px[o], px[o + 1], px[o + 2], 1, lado])
  }
  for (let x = 0; x < w; x += 2) { ver(x, 0, 1); ver(x, h - 1, 2) }
  for (let y = 0; y < h; y += 2) { ver(0, y, 4); ver(w - 1, y, 8) }
  // Cor que aparece em menos de 2% da borda e detalhe vazado, nao e fundo.
  const minimo = ((w + h) / 2) * 0.02
  // Cor que encosta em uma borda so e desenho cortado pela moldura, nao fundo.
  //
  // Nao e teoria: a calca preta do TH desce ate o fim do quadro e ocupa 8% da
  // borda de baixo, mais que o minimo acima. Tratada como fundo, a inundacao
  // subia por dentro dela e o personagem perdia a calca inteira. Fundo chapado
  // de verdade cerca a arte, e por isso aparece em pelo menos dois lados.
  const lados = (r) => (r[4] & 1) + ((r[4] >> 1) & 1) + ((r[4] >> 2) & 1) + ((r[4] >> 3) & 1)
  return reps.filter((r) => r[3] >= minimo && lados(r) >= 2)
}

function ehFundo(px, o, reps, tol) {
  for (const r of reps) {
    if (Math.abs(r[0] - px[o]) + Math.abs(r[1] - px[o + 1]) + Math.abs(r[2] - px[o + 2]) <= tol) return true
  }
  return false
}

/**
 * Vaos de fundo cercados pelo desenho, que a inundacao da borda nunca alcanca.
 *
 * Marca em `fundo` os componentes de cor de fundo que sobraram, do maior para
 * baixo, ate o piso. O componente e achado por vizinhanca, e nao por cor solta,
 * senao cada letra branca de estampa entraria na conta.
 */
function removerFundoPreso(px, w, h, fundo, reps) {
  const eh = (i) => !fundo[i] && ehFundo(px, i * 4, reps, TOL_PRESO)
  const visto = new Uint8Array(w * h)
  const vaos = []
  for (let s = 0; s < w * h; s++) {
    if (visto[s] || !eh(s)) continue
    const pixels = [s]
    visto[s] = 1
    for (let k = 0; k < pixels.length; k++) {
      const i = pixels[k]
      const x = i % w, y = (i / w) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (visto[j] || !eh(j)) continue
        visto[j] = 1
        pixels.push(j)
      }
    }
    vaos.push(pixels)
  }
  if (!vaos.length) return 0
  const maior = vaos.reduce((a, v) => Math.max(a, v.length), 0)
  let apagados = 0
  for (const vao of vaos) {
    if (vao.length < maior * PISO_PRESO) continue
    for (const i of vao) fundo[i] = 1
    apagados += vao.length
  }
  return apagados
}

function removerFundo(img, presos) {
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

  const preso = presos ? removerFundoPreso(px, w, h, fundo, reps) : 0

  for (let i = 0; i < w * h; i++) if (fundo[i]) px[i * 4 + 3] = 0
  return preso
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
function figuras({ px, w, h }, escolha, pisoIlha = 0) {
  const marca = new Int32Array(w * h).fill(-1)
  const ilhas = []
  for (let s = 0; s < w * h; s++) {
    if (px[s * 4 + 3] === 0 || marca[s] >= 0) continue
    const id = ilhas.length
    const ilha = { id, area: 0, x0: w, x1: 0, y0: h, y1: 0 }
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

  // Sujeira de origem: ilha pequena demais para ser parte do desenho.
  //
  // Precisa sair ANTES do agrupamento, e nao depois. O piso por grupo nao
  // alcanca essas: o risco de chao do Goiabeira cruza o corpo no eixo x, entao
  // ele e absorvido pelo grupo do personagem e passa a viajar junto com ele.
  const maiorIlha = ilhas.reduce((a, b) => (b.area > a.area ? b : a))
  const vivas = pisoIlha > 0 ? ilhas.filter((i) => i.area >= maiorIlha.area * pisoIlha) : ilhas
  if (vivas.length < ilhas.length) {
    const marcaViva = new Set(vivas.map((i) => i.id))
    for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] && !marcaViva.has(marca[i])) px[i * 4 + 3] = 0
  }

  // Agrupa ilhas que se sobrepoem no eixo x, com folga: rabo, chifre e cauda
  // frequentemente sao ilhas separadas do corpo, e nao podem ser perdidos.
  const folga = Math.round(w * 0.02)
  const grupos = []
  for (const ilha of vivas.slice().sort((a, b) => a.x0 - b.x0)) {
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
  return {
    caixa,
    ilhas: ilhas.length,
    sujeira: ilhas.length - vivas.length,
    grupos: grupos.length,
    mantidos: mantidos.length,
  }
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

/**
 * Coloca o personagem ja reduzido numa tela de 128 por 128, com o pe no chao
 * comum, e mede no pixel onde ficam a cabeca e a mao.
 *
 * A medida da mao nao e chute: varre a faixa da cintura e pega a coluna mais
 * externa que ainda tem pixel aceso. E ali que a mao esta em praticamente todo
 * personagem desta colecao, porque o prompt exigiu braco solto ao lado do corpo.
 */
function assentar(px, w, h, id) {
  const fator = FATOR_FAMILIA[id.split('-')[0]] ?? 0.95
  const alturaUtil = Math.round((CHAO - TOPO) * fator)
  const escala = alturaUtil / h
  const larg = Math.max(1, Math.round(w * escala))
  const alt = alturaUtil
  const ox = Math.round((LADO_PADRAO - larg) / 2)
  const oy = FLUTUA.has(id) ? Math.round((CHAO - alt) * 0.72) : CHAO - alt

  const tela = Buffer.alloc(LADO_PADRAO * LADO_PADRAO * 4)
  for (let y = 0; y < alt; y++) {
    const sy = Math.min(h - 1, Math.floor(y / escala))
    for (let x = 0; x < larg; x++) {
      const sx = Math.min(w - 1, Math.floor(x / escala))
      const de = (sy * w + sx) * 4
      if (px[de + 3] === 0) continue
      const ty = oy + y, tx = ox + x
      if (ty < 0 || ty >= LADO_PADRAO || tx < 0 || tx >= LADO_PADRAO) continue
      const para = (ty * LADO_PADRAO + tx) * 4
      tela[para] = px[de]; tela[para + 1] = px[de + 1]
      tela[para + 2] = px[de + 2]; tela[para + 3] = 255
    }
  }

  const aceso = (x, y) => tela[(y * LADO_PADRAO + x) * 4 + 3] > 0
  let topoY = LADO_PADRAO, baseY = 0
  for (let y = 0; y < LADO_PADRAO; y++) {
    for (let x = 0; x < LADO_PADRAO; x++) {
      if (!aceso(x, y)) continue
      if (y < topoY) topoY = y
      if (y > baseY) baseY = y
      break
    }
  }

  // Cabeca: largura da silhueta na faixa de cima, que e onde chapeu encosta.
  //
  // A largura sai da MEDIANA das linhas da faixa, nao da uniao delas. A uniao
  // parecia obvia e estava errada: o rabo da raposa e as cobras da Medusa
  // entram na faixa de cima e esticavam a "cabeca" para o quadro inteiro, e a
  // coroa saia do tamanho do bicho. A mediana ignora a linha excepcional.
  const faixa = Math.max(topoY + 1, Math.round(topoY + (baseY - topoY) * 0.16))
  const linhas = []
  for (let y = topoY; y <= faixa; y++) {
    let e = -1, d = -1
    for (let x = 0; x < LADO_PADRAO; x++) if (aceso(x, y)) { if (e < 0) e = x; d = x }
    if (e >= 0) linhas.push([e, d])
  }
  let ce, cd
  if (linhas.length) {
    const meio = linhas.slice().sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]))[Math.floor(linhas.length / 2)]
    ce = meio[0]; cd = meio[1]
  } else { ce = ox; cd = ox + larg - 1 }

  // Teto e piso: chapeu menor que isso vira alfinete, maior vira guarda-sol.
  const LARG_MIN = 26, LARG_MAX = 56
  let cabecaLargura = Math.min(LARG_MAX, Math.max(LARG_MIN, cd - ce + 1))
  const cabecaX = Math.round((ce + cd) / 2)

  // Mao: coluna mais externa acesa na faixa da cintura, do lado direito de quem
  // olha. E o lado que o prompt deixou livre em quase todos.
  const cintura = Math.round(topoY + (baseY - topoY) * 0.58)
  let maoX = cd, maoY = cintura
  for (let y = Math.max(0, cintura - 6); y <= Math.min(LADO_PADRAO - 1, cintura + 6); y++) {
    for (let x = LADO_PADRAO - 1; x >= 0; x--) if (aceso(x, y)) { if (x > maoX) { maoX = x; maoY = y } break }
  }

  return {
    px: tela,
    medidas: { cabecaX, cabecaY: topoY, cabecaLargura, maoX, maoY, baseY, ...(ANCORA_MANUAL[id] ?? {}) },
  }
}

async function processar(tipo, arquivo, id, nome) {
  const img = await carregar(arquivo)
  const relatorio = { id, nome, tipo }

  let x0 = 0, y0 = 0, x1 = img.w - 1, y1 = img.h - 1
  if (tipo !== 'fundo') {
    const preso = removerFundo(img, FUNDO_PRESO.has(id))
    if (preso) relatorio.preso = preso

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

    const r = figuras(img, RESPINGO.has(id) ? 'respingo' : 'tudo', PISO_ILHA[tipo] ?? 0)
    relatorio.ilhas = r.ilhas
    if (r.sujeira) relatorio.sujeira = r.sujeira
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

  let bruto = data
  let larguraFinal = info.width
  let alturaFinal = info.height

  if (ASSENTADOS.has(tipo)) {
    const posto = assentar(data, info.width, info.height, id)
    bruto = posto.px
    larguraFinal = LADO_PADRAO
    alturaFinal = LADO_PADRAO
    Object.assign(relatorio, posto.medidas)
  }

  const png = await sharp(bruto, { raw: { width: larguraFinal, height: alturaFinal, channels: 4 } })
    .png({ palette: true, colours: tipo === 'fundo' ? 128 : 48, effort: 10, compressionLevel: 9 })
    .toBuffer()
  relatorio.saida = larguraFinal + 'x' + alturaFinal

  const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const destino = join(SAIDA, tipo === 'fundo' ? 'fundos' : tipo === 'item' ? 'itens' : tipo === 'cenario' ? 'cenarios' : 'personagens', `${id}-${slug}.png`)
  writeFileSync(destino, png)
  relatorio.arquivo = destino.slice(destino.indexOf('/sprites/'))
  relatorio.kb = +(png.length / 1024).toFixed(1)

  if (ENCAIXE[id]) relatorio.encaixe = ENCAIXE[id]
  return relatorio
}

mkdirSync(SAIDA, { recursive: true })
for (const sub of ['personagens', 'itens', 'cenarios', 'fundos']) mkdirSync(join(SAIDA, sub), { recursive: true })

const PASTAS = {
  personagem: join(ENTRADA, 'Personagens'),
  atleta: join(ENTRADA, 'Personagens/atletaas'),
  cenario: join(ENTRADA, 'Fundos'),
  fundo: join(ENTRADA, 'Fundos'),
  item: join(ENTRADA, 'Itens'),
  cria: join(RAIZ, 'arte-origem/personagens'),
}

/**
 * O manifesto e atualizado, nao reescrito.
 *
 * As pastas do Gemini em Downloads foram esvaziadas depois do processamento
 * original, entao os 36 personagens, os 9 acessorios, os 8 cenarios e os 4
 * fundos nao tem mais arte de origem: reescrever o manifesto do zero apagaria
 * todos eles do catalogo. Quem nao tem origem no disco nao e reprocessado, nao
 * tem o PNG tocado e mantem a linha que ja estava aqui.
 */
const anterior = existsSync(MANIFESTO) ? JSON.parse(readFileSync(MANIFESTO, 'utf8')) : []
const manifesto = new Map(anterior.map((r) => [r.id, r]))
const feitos = []
const erros = []
const semOrigem = []

for (const [tipo, mapa] of Object.entries(MAPA)) {
  const dir = PASTAS[tipo]
  // JPEG entra junto: a arte do dono chega no formato que o aplicativo dele
  // exporta, e exigir PNG fazia o personagem sumir do processamento calado.
  const arquivos = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)) : []
  for (const [chave, [id, nome]] of Object.entries(mapa)) {
    const achado = arquivos.find((f) => f.includes(chave))
    if (!achado) { (manifesto.has(id) ? semOrigem : erros).push(`${id} ${nome}: sem arquivo com "${chave}" em ${dir}`); continue }
    try {
      const r = await processar(tipo, join(dir, achado), id, nome)
      manifesto.set(id, r)
      feitos.push(r)
      console.log(`${r.id.padEnd(7)} ${r.nome.padEnd(22)} bloco ${String(r.bloco).padStart(2)}  ${r.saida.padEnd(9)} ${String(r.kb).padStart(5)} KB  ${r.sujeira ? 'sujeira ' + r.sujeira : ''}`)
    } catch (e) {
      erros.push(`${id} ${nome}: ${e.message}`)
    }
  }
}

const todos = [...manifesto.values()]
writeFileSync(MANIFESTO, JSON.stringify(todos, null, 2))
const total = todos.reduce((s, r) => s + r.kb, 0)
console.log(`\n${feitos.length} sprites processados agora, ${todos.length} no manifesto, ${total.toFixed(0)} KB no total`)
if (semOrigem.length) console.log(`\n${semOrigem.length} sem arte de origem, mantidos intactos do manifesto`)
if (erros.length) { console.log('\nFALHAS:'); erros.forEach((e) => console.log('  ' + e)) }
