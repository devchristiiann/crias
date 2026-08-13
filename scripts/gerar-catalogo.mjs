import { readFileSync, writeFileSync } from 'node:fs'
const RAIZ='~/Desktop/Kortx/PROJETO - Crias'
const m=JSON.parse(readFileSync(RAIZ+'/public/sprites/manifesto.json','utf8'))

const FAMILIA={pes:'Pessoas',anf:'Animais fofos',anp:'Animais perigosos',mof:'Monstros fofos',mop:'Monstros perigosos',deu:'Deuses e mitologia',fol:'Folclore brasileiro',rob:'Robôs',atl:'Lendas do esporte',cen:'Cenários',fun:'Fundos de perfil',ace:'Acessórios'}
// Os oito que o Gustavo apontou como os melhores custam mais que o resto.
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
  'cen-1':100,'cen-2':150,'cen-3':400,'cen-4':250,'cen-5':250,'cen-6':250,'cen-7':400,'cen-10':700,
  'fun-1':1500,'fun-2':1500,'fun-3':1500,'fun-4':1500,
  'ace-1':400,'ace-2':250,'ace-3':250,'ace-10':220,'ace-11':220,'ace-12':350,'ace-14':300,'ace-15':400,'ace-16':700,
}
const SLOT=(id)=>id.startsWith('cen-')?'cenario':id.startsWith('fun-')?'fundo':id.startsWith('ace-')?'acessorio':'personagem'

const linhas=m.map(r=>{
  const fam=FAMILIA[r.id.split('-')[0]]
  const preco=PRECO[r.id]
  if(preco===undefined) throw new Error('sem preco: '+r.id)
  const slot=SLOT(r.id)
  const extra=r.ancoraCabeca?`, ancoraCabeca: [${r.ancoraCabeca}], ancoraMao: [${r.ancoraMao}]`:''
  return `  { id: '${r.id}', nome: ${JSON.stringify(r.nome)}, slot: '${slot}', familia: ${JSON.stringify(fam)}, custo: ${preco}, arquivo: '${r.arquivo}', largura: ${r.saida.split('x')[0]}, altura: ${r.saida.split('x')[1]}${extra} },`
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
  /** Onde encostar chapeu e item de mao, em pixels do proprio sprite. */
  ancoraCabeca?: readonly [number, number]
  ancoraMao?: readonly [number, number]
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
export const BASES_ANTIGAS = ['base-01', 'base-02', 'base-03', 'base-04', 'base-05', 'base-06']
`
writeFileSync(RAIZ+'/src/lib/catalogo.ts', ts)
console.log('catalogo.ts com', m.length, 'pecas')
const porSlot={}
for(const r of m){const s=SLOT(r.id); porSlot[s]=(porSlot[s]||0)+1}
console.log(porSlot)
