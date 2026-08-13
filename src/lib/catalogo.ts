/**
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
  { id: 'ace-1', nome: "Coroa", slot: 'acessorio', familia: "Acessórios", custo: 400, arquivo: '/sprites/itens/ace-1-coroa.png', largura: 96, altura: 66 },
  { id: 'ace-10', nome: "Cajado", slot: 'acessorio', familia: "Acessórios", custo: 220, arquivo: '/sprites/itens/ace-10-cajado.png', largura: 23, altura: 96 },
  { id: 'ace-11', nome: "Martelo", slot: 'acessorio', familia: "Acessórios", custo: 220, arquivo: '/sprites/itens/ace-11-martelo.png', largura: 62, altura: 96 },
  { id: 'ace-12', nome: "Espada de Raio", slot: 'acessorio', familia: "Acessórios", custo: 350, arquivo: '/sprites/itens/ace-12-espada-de-raio.png', largura: 79, altura: 96 },
  { id: 'ace-14', nome: "Raio", slot: 'acessorio', familia: "Acessórios", custo: 300, arquivo: '/sprites/itens/ace-14-raio.png', largura: 40, altura: 96 },
  { id: 'ace-15', nome: "Capa", slot: 'acessorio', familia: "Acessórios", custo: 400, arquivo: '/sprites/itens/ace-15-capa.png', largura: 94, altura: 72 },
  { id: 'ace-16', nome: "Asas", slot: 'acessorio', familia: "Acessórios", custo: 700, arquivo: '/sprites/itens/ace-16-asas.png', largura: 96, altura: 78 },
  { id: 'ace-2', nome: "Chapéu de Mago", slot: 'acessorio', familia: "Acessórios", custo: 250, arquivo: '/sprites/itens/ace-2-chapeu-de-mago.png', largura: 96, altura: 81 },
  { id: 'ace-3', nome: "Capacete Viking", slot: 'acessorio', familia: "Acessórios", custo: 250, arquivo: '/sprites/itens/ace-3-capacete-viking.png', largura: 96, altura: 83 },
  { id: 'anf-1', nome: "Panda", slot: 'personagem', familia: "Animais fofos", custo: 150, arquivo: '/sprites/personagens/anf-1-panda.png', largura: 92, altura: 128, ancoraCabeca: [46,0], ancoraMao: [79,74] },
  { id: 'anf-2', nome: "Raposa", slot: 'personagem', familia: "Animais fofos", custo: 800, arquivo: '/sprites/personagens/anf-2-raposa.png', largura: 96, altura: 96, ancoraCabeca: [48,0], ancoraMao: [83,56] },
  { id: 'anf-3', nome: "Coelho", slot: 'personagem', familia: "Animais fofos", custo: 150, arquivo: '/sprites/personagens/anf-3-coelho.png', largura: 67, altura: 128, ancoraCabeca: [34,0], ancoraMao: [58,74] },
  { id: 'anf-4', nome: "Capivara", slot: 'personagem', familia: "Animais fofos", custo: 800, arquivo: '/sprites/personagens/anf-4-capivara.png', largura: 87, altura: 128, ancoraCabeca: [44,0], ancoraMao: [75,74] },
  { id: 'anf-5', nome: "Pinguim", slot: 'personagem', familia: "Animais fofos", custo: 150, arquivo: '/sprites/personagens/anf-5-pinguim.png', largura: 110, altura: 128, ancoraCabeca: [55,0], ancoraMao: [95,74] },
  { id: 'anf-7', nome: "Filhote de Foca", slot: 'personagem', familia: "Animais fofos", custo: 180, arquivo: '/sprites/personagens/anf-7-filhote-de-foca.png', largura: 128, altura: 128, ancoraCabeca: [64,0], ancoraMao: [110,74] },
  { id: 'anp-1', nome: "T-Rex", slot: 'personagem', familia: "Animais perigosos", custo: 400, arquivo: '/sprites/personagens/anp-1-t-rex.png', largura: 94, altura: 128, ancoraCabeca: [47,0], ancoraMao: [81,74] },
  { id: 'anp-2', nome: "Urso Ranzinza", slot: 'personagem', familia: "Animais perigosos", custo: 800, arquivo: '/sprites/personagens/anp-2-urso-ranzinza.png', largura: 102, altura: 128, ancoraCabeca: [51,0], ancoraMao: [88,74] },
  { id: 'anp-4', nome: "Lobo", slot: 'personagem', familia: "Animais perigosos", custo: 800, arquivo: '/sprites/personagens/anp-4-lobo.png', largura: 89, altura: 128, ancoraCabeca: [45,0], ancoraMao: [77,74] },
  { id: 'anp-6', nome: "Águia", slot: 'personagem', familia: "Animais perigosos", custo: 400, arquivo: '/sprites/personagens/anp-6-aguia.png', largura: 82, altura: 128, ancoraCabeca: [41,0], ancoraMao: [71,74] },
  { id: 'atl-1', nome: "Camisa 10", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-1-camisa-10.png', largura: 112, altura: 128, ancoraCabeca: [56,0], ancoraMao: [96,74] },
  { id: 'atl-2', nome: "Lenda do Garrafão", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-2-lenda-do-garrafao.png', largura: 109, altura: 128, ancoraCabeca: [55,0], ancoraMao: [94,74] },
  { id: 'atl-3', nome: "Rei da Quadra", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-3-rei-da-quadra.png', largura: 114, altura: 128, ancoraCabeca: [57,0], ancoraMao: [98,74] },
  { id: 'atl-4', nome: "Cabeceador", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-4-cabeceador.png', largura: 114, altura: 128, ancoraCabeca: [57,0], ancoraMao: [98,74] },
  { id: 'atl-5', nome: "Sorriso Craque", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-5-sorriso-craque.png', largura: 109, altura: 128, ancoraCabeca: [55,0], ancoraMao: [94,74] },
  { id: 'cen-1', nome: "Pedestal de Madeira", slot: 'cenario', familia: "Cenários", custo: 100, arquivo: '/sprites/cenarios/cen-1-pedestal-de-madeira.png', largura: 95, altura: 57 },
  { id: 'cen-10', nome: "Moldura Lendária", slot: 'cenario', familia: "Cenários", custo: 700, arquivo: '/sprites/cenarios/cen-10-moldura-lendaria.png', largura: 96, altura: 96 },
  { id: 'cen-2', nome: "Pedestal de Pedra", slot: 'cenario', familia: "Cenários", custo: 150, arquivo: '/sprites/cenarios/cen-2-pedestal-de-pedra.png', largura: 100, altura: 128 },
  { id: 'cen-3', nome: "Pedestal de Ouro", slot: 'cenario', familia: "Cenários", custo: 400, arquivo: '/sprites/cenarios/cen-3-pedestal-de-ouro.png', largura: 128, altura: 119 },
  { id: 'cen-4', nome: "Aura de Fogo", slot: 'cenario', familia: "Cenários", custo: 250, arquivo: '/sprites/cenarios/cen-4-aura-de-fogo.png', largura: 95, altura: 94 },
  { id: 'cen-5', nome: "Aura de Gelo", slot: 'cenario', familia: "Cenários", custo: 250, arquivo: '/sprites/cenarios/cen-5-aura-de-gelo.png', largura: 97, altura: 91 },
  { id: 'cen-6', nome: "Aura Elétrica", slot: 'cenario', familia: "Cenários", custo: 250, arquivo: '/sprites/cenarios/cen-6-aura-eletrica.png', largura: 95, altura: 97 },
  { id: 'cen-7', nome: "Chuva de Estrelas", slot: 'cenario', familia: "Cenários", custo: 400, arquivo: '/sprites/cenarios/cen-7-chuva-de-estrelas.png', largura: 94, altura: 78 },
  { id: 'deu-1', nome: "Mini Zeus", slot: 'personagem', familia: "Deuses e mitologia", custo: 500, arquivo: '/sprites/personagens/deu-1-mini-zeus.png', largura: 78, altura: 128, ancoraCabeca: [39,0], ancoraMao: [67,74] },
  { id: 'deu-2', nome: "Mini Thor", slot: 'personagem', familia: "Deuses e mitologia", custo: 500, arquivo: '/sprites/personagens/deu-2-mini-thor.png', largura: 104, altura: 128, ancoraCabeca: [52,0], ancoraMao: [89,74] },
  { id: 'deu-4', nome: "Poseidon", slot: 'personagem', familia: "Deuses e mitologia", custo: 500, arquivo: '/sprites/personagens/deu-4-poseidon.png', largura: 107, altura: 128, ancoraCabeca: [54,0], ancoraMao: [92,74] },
  { id: 'deu-5', nome: "Medusa", slot: 'personagem', familia: "Deuses e mitologia", custo: 800, arquivo: '/sprites/personagens/deu-5-medusa.png', largura: 97, altura: 128, ancoraCabeca: [49,0], ancoraMao: [83,74] },
  { id: 'deu-6', nome: "Kitsune", slot: 'personagem', familia: "Deuses e mitologia", custo: 800, arquivo: '/sprites/personagens/deu-6-kitsune.png', largura: 96, altura: 89, ancoraCabeca: [48,0], ancoraMao: [83,52] },
  { id: 'fol-2', nome: "Curupira", slot: 'personagem', familia: "Folclore brasileiro", custo: 800, arquivo: '/sprites/personagens/fol-2-curupira.png', largura: 62, altura: 128, ancoraCabeca: [31,0], ancoraMao: [53,74] },
  { id: 'fol-4', nome: "Boitatá", slot: 'personagem', familia: "Folclore brasileiro", custo: 500, arquivo: '/sprites/personagens/fol-4-boitata.png', largura: 128, altura: 126, ancoraCabeca: [64,0], ancoraMao: [110,73] },
  { id: 'fun-1', nome: "Portal Celeste", slot: 'fundo', familia: "Fundos de perfil", custo: 1500, arquivo: '/sprites/fundos/fun-1-portal-celeste.png', largura: 98, altura: 98 },
  { id: 'fun-2', nome: "Caverna de Lava", slot: 'fundo', familia: "Fundos de perfil", custo: 1500, arquivo: '/sprites/fundos/fun-2-caverna-de-lava.png', largura: 98, altura: 98 },
  { id: 'fun-3', nome: "Ruínas Douradas", slot: 'fundo', familia: "Fundos de perfil", custo: 1500, arquivo: '/sprites/fundos/fun-3-ruinas-douradas.png', largura: 98, altura: 98 },
  { id: 'fun-4', nome: "Bosque Encantado", slot: 'fundo', familia: "Fundos de perfil", custo: 1500, arquivo: '/sprites/fundos/fun-4-bosque-encantado.png', largura: 98, altura: 98 },
  { id: 'mof-3', nome: "Fantasminha", slot: 'personagem', familia: "Monstros fofos", custo: 150, arquivo: '/sprites/personagens/mof-3-fantasminha.png', largura: 119, altura: 128, ancoraCabeca: [60,0], ancoraMao: [102,74] },
  { id: 'mof-5', nome: "Morceguinho", slot: 'personagem', familia: "Monstros fofos", custo: 180, arquivo: '/sprites/personagens/mof-5-morceguinho.png', largura: 96, altura: 128, ancoraCabeca: [48,0], ancoraMao: [83,74] },
  { id: 'mop-3', nome: "Slime Mutante", slot: 'personagem', familia: "Monstros perigosos", custo: 300, arquivo: '/sprites/personagens/mop-3-slime-mutante.png', largura: 95, altura: 86, ancoraCabeca: [48,0], ancoraMao: [82,50] },
  { id: 'mop-4', nome: "Esqueleto", slot: 'personagem', familia: "Monstros perigosos", custo: 300, arquivo: '/sprites/personagens/mop-4-esqueleto.png', largura: 67, altura: 128, ancoraCabeca: [34,0], ancoraMao: [58,74] },
  { id: 'mop-6', nome: "Golem de Pedra", slot: 'personagem', familia: "Monstros perigosos", custo: 800, arquivo: '/sprites/personagens/mop-6-golem-de-pedra.png', largura: 94, altura: 81, ancoraCabeca: [47,0], ancoraMao: [81,47] },
  { id: 'pes-1', nome: "Guerreira Robusta", slot: 'personagem', familia: "Pessoas", custo: 300, arquivo: '/sprites/personagens/pes-1-guerreira-robusta.png', largura: 99, altura: 128, ancoraCabeca: [50,0], ancoraMao: [85,74] },
  { id: 'pes-2', nome: "Mago Barrigudo", slot: 'personagem', familia: "Pessoas", custo: 300, arquivo: '/sprites/personagens/pes-2-mago-barrigudo.png', largura: 110, altura: 128, ancoraCabeca: [55,0], ancoraMao: [95,74] },
  { id: 'pes-3', nome: "Anã Ferreira", slot: 'personagem', familia: "Pessoas", custo: 150, arquivo: '/sprites/personagens/pes-3-ana-ferreira.png', largura: 102, altura: 128, ancoraCabeca: [51,0], ancoraMao: [88,74] },
  { id: 'pes-4', nome: "Vovó Guerreira", slot: 'personagem', familia: "Pessoas", custo: 300, arquivo: '/sprites/personagens/pes-4-vovo-guerreira.png', largura: 85, altura: 128, ancoraCabeca: [43,0], ancoraMao: [73,74] },
  { id: 'pes-5', nome: "Criança Aventureira", slot: 'personagem', familia: "Pessoas", custo: 150, arquivo: '/sprites/personagens/pes-5-crianca-aventureira.png', largura: 67, altura: 128, ancoraCabeca: [34,0], ancoraMao: [58,74] },
  { id: 'pes-6', nome: "Corredora", slot: 'personagem', familia: "Pessoas", custo: 150, arquivo: '/sprites/personagens/pes-6-corredora.png', largura: 81, altura: 128, ancoraCabeca: [41,0], ancoraMao: [70,74] },
  { id: 'rob-1', nome: "Robô Sucata", slot: 'personagem', familia: "Robôs", custo: 200, arquivo: '/sprites/personagens/rob-1-robo-sucata.png', largura: 79, altura: 128, ancoraCabeca: [40,0], ancoraMao: [68,74] },
  { id: 'rob-3', nome: "Drone Mensageiro", slot: 'personagem', familia: "Robôs", custo: 250, arquivo: '/sprites/personagens/rob-3-drone-mensageiro.png', largura: 96, altura: 61, ancoraCabeca: [48,0], ancoraMao: [83,35] },
  { id: 'rob-4', nome: "Andróide Polido", slot: 'personagem', familia: "Robôs", custo: 300, arquivo: '/sprites/personagens/rob-4-androide-polido.png', largura: 50, altura: 128, ancoraCabeca: [25,0], ancoraMao: [43,74] },
] as const

export const POR_ID = new Map(CATALOGO.map((p) => [p.id, p]))

export const PERSONAGEM_PADRAO = 'anf-1'

export function pecasDoSlot(slot: Slot) {
  return CATALOGO.filter((p) => p.slot === slot)
}

/** Bases 16x16 antigas. Continuam desenhando para nao apagar avatar de quem ja escolheu. */
export const BASES_ANTIGAS = ['base-01', 'base-02', 'base-03', 'base-04', 'base-05', 'base-06']
