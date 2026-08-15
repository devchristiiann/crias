import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
/* A raiz sai do proprio arquivo. O caminho escrito a mao apontava para uma
 * pasta que nao existe mais desde que o projeto mudou de lugar, e o script
 * morria com ENOENT em vez de gerar o catalogo. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const m=JSON.parse(readFileSync(RAIZ+'/public/sprites/manifesto.json','utf8'))

/**
 * Carimbo de versao pelo CONTEUDO do PNG, nao pela data nem por contador.
 *
 * O nome do arquivo nunca pode mudar: o id vem junto dele e e o mesmo de
 * `avatar_items`, entao renomear apagaria a posse de quem ja comprou. Sem nome
 * novo, arte retrabalhada volta pela mesma URL e qualquer cache no caminho
 * continua entregando o desenho velho, que foi exatamente o que aconteceu no
 * iPhone do dono depois do recorte dos pedestais.
 *
 * A saida e a URL com `?v=<8 hex do sha256>`. O disco e o id ficam intactos, e
 * so a URL que o app pede muda, quando e somente quando os bytes mudam.
 */
const versao=(arquivo)=>createHash('sha256').update(readFileSync(RAIZ+'/public'+arquivo)).digest('hex').slice(0,8)
const versionar=(arquivo)=>`${arquivo}?v=${versao(arquivo)}`

const FAMILIA={pes:'Pessoas',anf:'Animais fofos',anp:'Animais perigosos',mof:'Monstros fofos',mop:'Monstros perigosos',deu:'Deuses e mitologia',fol:'Folclore brasileiro',rob:'Robôs',atl:'Lendas do esporte',cri:'Crias da casa',cen:'Cenários',fun:'Fundos de perfil',ace:'Acessórios'}
// Os oito que o Gustavo apontou como os melhores custam mais que o resto.
//
// A familia `cri` e a excecao: o preco nao foi escolhido aqui, ele veio escrito
// no nome do arquivo que o dono entregou, e por isso o `cri-5` passa dos 1500
// que eram o teto ate agora. A unica trava real de preco no banco e
// `avatar_items_custo_ouro_check`, que so exige `custo_ouro >= 0`.
const PRECO={
  'anf-1':150,'anf-2':800,'anf-3':150,'anf-4':800,'anf-5':150,'anf-7':180,
  'anp-1':400,'anp-2':800,'anp-4':800,'anp-6':400,
  'mof-3':150,'mof-5':180,
  'mop-3':300,'mop-4':300,'mop-6':800,
  'deu-1':500,'deu-2':500,'deu-4':500,'deu-5':800,'deu-6':800,
  'fol-2':800,'fol-4':500,
  'pes-1':300,'pes-2':300,'pes-3':150,'pes-4':300,'pes-5':150,'pes-6':150,
  'rob-1':200,'rob-3':250,'rob-4':300,
  'atl-1':1200,'atl-2':1200,'atl-3':1200,'atl-4':1200,'atl-5':1200,
  'cri-1':1500,'cri-2':1500,'cri-3':1500,'cri-4':1500,'cri-5':2500,'cri-6':2500,'cri-7':1200,
  'cen-1':100,'cen-2':150,'cen-3':400,'cen-4':250,'cen-5':250,'cen-6':250,'cen-7':400,'cen-10':700,
  'fun-1':1500,'fun-2':1500,'fun-3':1500,'fun-4':1500,
  'ace-1':400,'ace-2':250,'ace-3':250,'ace-10':220,'ace-11':220,'ace-12':350,'ace-14':300,'ace-15':400,'ace-16':700,
}
const SLOT=(id)=>id.startsWith('cen-')?'cenario':id.startsWith('fun-')?'fundo':id.startsWith('ace-')?'acessorio':'personagem'

// Cenario de pedestal e cenario de fundo pedem desenho diferente, e o unico
// jeito de saber qual e qual e a arte. Aura, chuva de estrelas e moldura sao
// quadrados e envolvem o corpo; estes tres sao plataforma e vao SOB os pes.
const CHAO=new Set(['cen-1','cen-2','cen-3'])

const linhas=m.map(r=>{
  const fam=FAMILIA[r.id.split('-')[0]]
  const preco=PRECO[r.id]
  if(preco===undefined) throw new Error('sem preco: '+r.id)
  const slot=SLOT(r.id)
  const extra=r.cabecaX!==undefined
    ? `, cabecaX: ${r.cabecaX}, cabecaY: ${r.cabecaY}, cabecaLargura: ${r.cabecaLargura}, maoX: ${r.maoX}, maoY: ${r.maoY}, baseY: ${r.baseY}`
    : slot==='cenario'
      ? `, ancora: '${CHAO.has(r.id)?'chao':'cena'}'`
      : (r.encaixe ? `, encaixe: '${r.encaixe}'` : '')
  return `  { id: '${r.id}', nome: ${JSON.stringify(r.nome)}, slot: '${slot}', familia: ${JSON.stringify(fam)}, custo: ${preco}, arquivo: '${versionar(r.arquivo)}', largura: ${r.saida.split('x')[0]}, altura: ${r.saida.split('x')[1]}${extra} },`
}).sort()

const ts=`/**
 * Catalogo de arte. Gerado por scripts/gerar-catalogo.mjs a partir dos PNG que
 * estao em public/sprites e do manifesto do processamento. Nao editar a mao:
 * rode o script de novo depois de trocar qualquer sprite.
 *
 * Os ids sao os mesmos de avatar_items no banco. Se um id existir aqui e nao
 * la, a loja nao mostra; se existir la e nao aqui, o Avatar nao desenha. O
 * teste em testes/catalogo.test.ts existe para essa divergencia falhar alto.
 */

export type Slot = 'personagem' | 'acessorio' | 'cenario' | 'fundo'

export interface Peca {
  id: string
  nome: string
  slot: Slot
  familia: string
  custo: number
  arquivo: string
  largura: number
  altura: number
  /**
   * Medidas do personagem, em pixels da tela padrao de 128 por 128. Saem
   * medidas no pixel pelo pipeline, nao chutadas: e o que faz um chapeu
   * desenhado para cabeca humana sentar tambem num slime.
   */
  cabecaX?: number
  cabecaY?: number
  cabecaLargura?: number
  maoX?: number
  maoY?: number
  baseY?: number
  /** Onde o acessorio encosta. Sem isso, espada e cajado iam parar na testa. */
  encaixe?: 'cabeca' | 'mao' | 'costas'
  /**
   * Onde o cenario se apoia. \`chao\` e plataforma baixa sob os pes, e o
   * personagem fica em cima dela; \`cena\` e fundo do tamanho da caixa, atras
   * do corpo inteiro. Sem essa separacao os pedestais eram esticados ate virar
   * painel, que e a reclamacao original: ficava atras e nao embaixo.
   */
  ancora?: 'chao' | 'cena'
}

export const CATALOGO: readonly Peca[] = [
${linhas.join('\n')}
] as const

export const POR_ID = new Map(CATALOGO.map((p) => [p.id, p]))

export const PERSONAGEM_PADRAO = 'anf-1'

export function pecasDoSlot(slot: Slot) {
  return CATALOGO.filter((p) => p.slot === slot)
}

/** Bases 16x16 antigas. Continuam desenhando para nao apagar avatar de quem ja escolheu. */
export const LADO_SPRITE = 128

export const BASES_ANTIGAS = ['base-01', 'base-02', 'base-03', 'base-04', 'base-05', 'base-06']

/**
 * Sprites de tela de \`scripts/gerar-sprites-ui.mjs\`. Ficam FORA de \`CATALOGO\`
 * de proposito: nao tem id em \`avatar_items\`, nao tem preco e nao se compra.
 * Entrar na lista de cima os transformaria em peca de loja que nao existe.
 *
 * Estao aqui, e nao escritos na tela, so para receberem o mesmo carimbo de
 * versao das outras artes. Sem ele, escudo e pocao ficam presos no cache do
 * aparelho quando o desenho muda, igual aos pedestais ficaram.
 */
export const SPRITES_UI = {
  pocao: '${versionar('/sprites/ui/pocao-vida.png')}',
  pocaoOuro: '${versionar('/sprites/ui/pocao-ouro.png')}',
  escudo: '${versionar('/sprites/ui/escudo.png')}',
} as const
`
writeFileSync(RAIZ+'/src/lib/catalogo.ts', ts)
console.log('catalogo.ts com', m.length, 'pecas')
const porSlot={}
for(const r of m){const s=SLOT(r.id); porSlot[s]=(porSlot[s]||0)+1}
console.log(porSlot)
