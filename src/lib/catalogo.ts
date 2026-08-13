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
}

export const CATALOGO: readonly Peca[] = [
  { id: 'ace-1', nome: "Coroa", slot: 'acessorio', familia: "Acessórios", custo: 400, arquivo: '/sprites/itens/ace-1-coroa.png', largura: 96, altura: 66, encaixe: 'cabeca' },
  { id: 'ace-10', nome: "Cajado", slot: 'acessorio', familia: "Acessórios", custo: 220, arquivo: '/sprites/itens/ace-10-cajado.png', largura: 23, altura: 96, encaixe: 'mao' },
  { id: 'ace-11', nome: "Martelo", slot: 'acessorio', familia: "Acessórios", custo: 220, arquivo: '/sprites/itens/ace-11-martelo.png', largura: 62, altura: 96, encaixe: 'mao' },
  { id: 'ace-12', nome: "Espada de Raio", slot: 'acessorio', familia: "Acessórios", custo: 350, arquivo: '/sprites/itens/ace-12-espada-de-raio.png', largura: 79, altura: 96, encaixe: 'mao' },
  { id: 'ace-14', nome: "Raio", slot: 'acessorio', familia: "Acessórios", custo: 300, arquivo: '/sprites/itens/ace-14-raio.png', largura: 40, altura: 96, encaixe: 'mao' },
  { id: 'ace-15', nome: "Capa", slot: 'acessorio', familia: "Acessórios", custo: 400, arquivo: '/sprites/itens/ace-15-capa.png', largura: 94, altura: 72, encaixe: 'costas' },
  { id: 'ace-16', nome: "Asas", slot: 'acessorio', familia: "Acessórios", custo: 700, arquivo: '/sprites/itens/ace-16-asas.png', largura: 96, altura: 78, encaixe: 'costas' },
  { id: 'ace-2', nome: "Chapéu de Mago", slot: 'acessorio', familia: "Acessórios", custo: 250, arquivo: '/sprites/itens/ace-2-chapeu-de-mago.png', largura: 96, altura: 81, encaixe: 'cabeca' },
  { id: 'ace-3', nome: "Capacete Viking", slot: 'acessorio', familia: "Acessórios", custo: 250, arquivo: '/sprites/itens/ace-3-capacete-viking.png', largura: 96, altura: 83, encaixe: 'cabeca' },
  { id: 'anf-1', nome: "Panda", slot: 'personagem', familia: "Animais fofos", custo: 150, arquivo: '/sprites/personagens/anf-1-panda.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 20, cabecaLargura: 50, maoX: 101, maoY: 79, baseY: 123 },
  { id: 'anf-2', nome: "Raposa", slot: 'personagem', familia: "Animais fofos", custo: 800, arquivo: '/sprites/personagens/anf-2-raposa.png', largura: 128, altura: 128, cabecaX: 66, cabecaY: 22, cabecaLargura: 56, maoX: 115, maoY: 81, baseY: 123 },
  { id: 'anf-3', nome: "Coelho", slot: 'personagem', familia: "Animais fofos", custo: 150, arquivo: '/sprites/personagens/anf-3-coelho.png', largura: 128, altura: 128, cabecaX: 67, cabecaY: 20, cabecaLargura: 44, maoX: 88, maoY: 80, baseY: 123 },
  { id: 'anf-4', nome: "Capivara", slot: 'personagem', familia: "Animais fofos", custo: 800, arquivo: '/sprites/personagens/anf-4-capivara.png', largura: 128, altura: 128, cabecaX: 64, cabecaY: 20, cabecaLargura: 44, maoX: 99, maoY: 83, baseY: 123 },
  { id: 'anf-5', nome: "Pinguim", slot: 'personagem', familia: "Animais fofos", custo: 150, arquivo: '/sprites/personagens/anf-5-pinguim.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 20, cabecaLargura: 39, maoX: 108, maoY: 82, baseY: 123 },
  { id: 'anf-7', nome: "Filhote de Foca", slot: 'personagem', familia: "Animais fofos", custo: 180, arquivo: '/sprites/personagens/anf-7-filhote-de-foca.png', largura: 128, altura: 128, cabecaX: 75, cabecaY: 21, cabecaLargura: 48, maoX: 114, maoY: 85, baseY: 123 },
  { id: 'anp-1', nome: "T-Rex", slot: 'personagem', familia: "Animais perigosos", custo: 400, arquivo: '/sprites/personagens/anp-1-t-rex.png', largura: 128, altura: 128, cabecaX: 59, cabecaY: 6, cabecaLargura: 38, maoX: 91, maoY: 79, baseY: 123 },
  { id: 'anp-2', nome: "Urso Ranzinza", slot: 'personagem', familia: "Animais perigosos", custo: 800, arquivo: '/sprites/personagens/anp-2-urso-ranzinza.png', largura: 128, altura: 128, cabecaX: 74, cabecaY: 6, cabecaLargura: 43, maoX: 110, maoY: 72, baseY: 123 },
  { id: 'anp-4', nome: "Lobo", slot: 'personagem', familia: "Animais perigosos", custo: 800, arquivo: '/sprites/personagens/anp-4-lobo.png', largura: 128, altura: 128, cabecaX: 64, cabecaY: 6, cabecaLargura: 31, maoX: 104, maoY: 68, baseY: 123 },
  { id: 'anp-6', nome: "Águia", slot: 'personagem', familia: "Animais perigosos", custo: 400, arquivo: '/sprites/personagens/anp-6-aguia.png', largura: 128, altura: 128, cabecaX: 53, cabecaY: 6, cabecaLargura: 35, maoX: 93, maoY: 68, baseY: 123 },
  { id: 'atl-1', nome: "Camisa 10", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-1-camisa-10.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 10, cabecaLargura: 52, maoX: 95, maoY: 70, baseY: 123 },
  { id: 'atl-2', nome: "Lenda do Garrafão", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-2-lenda-do-garrafao.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 10, cabecaLargura: 45, maoX: 97, maoY: 70, baseY: 123 },
  { id: 'atl-3', nome: "Rei da Quadra", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-3-rei-da-quadra.png', largura: 128, altura: 128, cabecaX: 64, cabecaY: 10, cabecaLargura: 47, maoX: 94, maoY: 70, baseY: 123 },
  { id: 'atl-4', nome: "Cabeceador", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-4-cabeceador.png', largura: 128, altura: 128, cabecaX: 63, cabecaY: 10, cabecaLargura: 49, maoX: 94, maoY: 70, baseY: 123 },
  { id: 'atl-5', nome: "Sorriso Craque", slot: 'personagem', familia: "Lendas do esporte", custo: 1200, arquivo: '/sprites/personagens/atl-5-sorriso-craque.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 10, cabecaLargura: 49, maoX: 105, maoY: 77, baseY: 123 },
  { id: 'cen-1', nome: "Pedestal de Madeira", slot: 'cenario', familia: "Cenários", custo: 100, arquivo: '/sprites/cenarios/cen-1-pedestal-de-madeira.png', largura: 95, altura: 57 },
  { id: 'cen-10', nome: "Moldura Lendária", slot: 'cenario', familia: "Cenários", custo: 700, arquivo: '/sprites/cenarios/cen-10-moldura-lendaria.png', largura: 96, altura: 96 },
  { id: 'cen-2', nome: "Pedestal de Pedra", slot: 'cenario', familia: "Cenários", custo: 150, arquivo: '/sprites/cenarios/cen-2-pedestal-de-pedra.png', largura: 100, altura: 128 },
  { id: 'cen-3', nome: "Pedestal de Ouro", slot: 'cenario', familia: "Cenários", custo: 400, arquivo: '/sprites/cenarios/cen-3-pedestal-de-ouro.png', largura: 128, altura: 119 },
  { id: 'cen-4', nome: "Aura de Fogo", slot: 'cenario', familia: "Cenários", custo: 250, arquivo: '/sprites/cenarios/cen-4-aura-de-fogo.png', largura: 95, altura: 94 },
  { id: 'cen-5', nome: "Aura de Gelo", slot: 'cenario', familia: "Cenários", custo: 250, arquivo: '/sprites/cenarios/cen-5-aura-de-gelo.png', largura: 97, altura: 91 },
  { id: 'cen-6', nome: "Aura Elétrica", slot: 'cenario', familia: "Cenários", custo: 250, arquivo: '/sprites/cenarios/cen-6-aura-eletrica.png', largura: 95, altura: 97 },
  { id: 'cen-7', nome: "Chuva de Estrelas", slot: 'cenario', familia: "Cenários", custo: 400, arquivo: '/sprites/cenarios/cen-7-chuva-de-estrelas.png', largura: 94, altura: 78 },
  { id: 'deu-1', nome: "Mini Zeus", slot: 'personagem', familia: "Deuses e mitologia", custo: 500, arquivo: '/sprites/personagens/deu-1-mini-zeus.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 10, cabecaLargura: 44, maoX: 98, maoY: 75, baseY: 123 },
  { id: 'deu-2', nome: "Mini Thor", slot: 'personagem', familia: "Deuses e mitologia", custo: 500, arquivo: '/sprites/personagens/deu-2-mini-thor.png', largura: 128, altura: 128, cabecaX: 66, cabecaY: 10, cabecaLargura: 40, maoX: 110, maoY: 80, baseY: 123 },
  { id: 'deu-4', nome: "Poseidon", slot: 'personagem', familia: "Deuses e mitologia", custo: 500, arquivo: '/sprites/personagens/deu-4-poseidon.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 10, cabecaLargura: 37, maoX: 111, maoY: 73, baseY: 123 },
  { id: 'deu-5', nome: "Medusa", slot: 'personagem', familia: "Deuses e mitologia", custo: 800, arquivo: '/sprites/personagens/deu-5-medusa.png', largura: 128, altura: 128, cabecaX: 64, cabecaY: 11, cabecaLargura: 53, maoX: 90, maoY: 76, baseY: 123 },
  { id: 'deu-6', nome: "Kitsune", slot: 'personagem', familia: "Deuses e mitologia", custo: 800, arquivo: '/sprites/personagens/deu-6-kitsune.png', largura: 128, altura: 128, cabecaX: 66, cabecaY: 12, cabecaLargura: 32, maoX: 114, maoY: 70, baseY: 123 },
  { id: 'fol-2', nome: "Curupira", slot: 'personagem', familia: "Folclore brasileiro", custo: 800, arquivo: '/sprites/personagens/fol-2-curupira.png', largura: 128, altura: 128, cabecaX: 63, cabecaY: 12, cabecaLargura: 29, maoX: 88, maoY: 79, baseY: 123 },
  { id: 'fol-4', nome: "Boitatá", slot: 'personagem', familia: "Folclore brasileiro", custo: 500, arquivo: '/sprites/personagens/fol-4-boitata.png', largura: 128, altura: 128, cabecaX: 63, cabecaY: 9, cabecaLargura: 32, maoX: 103, maoY: 72, baseY: 120 },
  { id: 'fun-1', nome: "Portal Celeste", slot: 'fundo', familia: "Fundos de perfil", custo: 1500, arquivo: '/sprites/fundos/fun-1-portal-celeste.png', largura: 98, altura: 98 },
  { id: 'fun-2', nome: "Caverna de Lava", slot: 'fundo', familia: "Fundos de perfil", custo: 1500, arquivo: '/sprites/fundos/fun-2-caverna-de-lava.png', largura: 98, altura: 98 },
  { id: 'fun-3', nome: "Ruínas Douradas", slot: 'fundo', familia: "Fundos de perfil", custo: 1500, arquivo: '/sprites/fundos/fun-3-ruinas-douradas.png', largura: 98, altura: 98 },
  { id: 'fun-4', nome: "Bosque Encantado", slot: 'fundo', familia: "Fundos de perfil", custo: 1500, arquivo: '/sprites/fundos/fun-4-bosque-encantado.png', largura: 98, altura: 98 },
  { id: 'mof-3', nome: "Fantasminha", slot: 'personagem', familia: "Monstros fofos", custo: 150, arquivo: '/sprites/personagens/mof-3-fantasminha.png', largura: 128, altura: 128, cabecaX: 64, cabecaY: 18, cabecaLargura: 45, maoX: 109, maoY: 77, baseY: 116 },
  { id: 'mof-5', nome: "Morceguinho", slot: 'personagem', familia: "Monstros fofos", custo: 180, arquivo: '/sprites/personagens/mof-5-morceguinho.png', largura: 128, altura: 128, cabecaX: 64, cabecaY: 18, cabecaLargura: 56, maoX: 99, maoY: 75, baseY: 116 },
  { id: 'mop-3', nome: "Slime Mutante", slot: 'personagem', familia: "Monstros perigosos", custo: 300, arquivo: '/sprites/personagens/mop-3-slime-mutante.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 6, cabecaLargura: 47, maoX: 127, maoY: 72, baseY: 122 },
  { id: 'mop-4', nome: "Esqueleto", slot: 'personagem', familia: "Monstros perigosos", custo: 300, arquivo: '/sprites/personagens/mop-4-esqueleto.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 6, cabecaLargura: 26, maoX: 92, maoY: 71, baseY: 123 },
  { id: 'mop-6', nome: "Golem de Pedra", slot: 'personagem', familia: "Monstros perigosos", custo: 800, arquivo: '/sprites/personagens/mop-6-golem-de-pedra.png', largura: 128, altura: 128, cabecaX: 66, cabecaY: 6, cabecaLargura: 56, maoX: 127, maoY: 68, baseY: 123 },
  { id: 'pes-1', nome: "Guerreira Robusta", slot: 'personagem', familia: "Pessoas", custo: 300, arquivo: '/sprites/personagens/pes-1-guerreira-robusta.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 11, cabecaLargura: 28, maoX: 107, maoY: 70, baseY: 123 },
  { id: 'pes-2', nome: "Mago Barrigudo", slot: 'personagem', familia: "Pessoas", custo: 300, arquivo: '/sprites/personagens/pes-2-mago-barrigudo.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 10, cabecaLargura: 38, maoX: 112, maoY: 76, baseY: 123 },
  { id: 'pes-3', nome: "Anã Ferreira", slot: 'personagem', familia: "Pessoas", custo: 150, arquivo: '/sprites/personagens/pes-3-ana-ferreira.png', largura: 128, altura: 128, cabecaX: 67, cabecaY: 11, cabecaLargura: 34, maoX: 109, maoY: 76, baseY: 123 },
  { id: 'pes-4', nome: "Vovó Guerreira", slot: 'personagem', familia: "Pessoas", custo: 300, arquivo: '/sprites/personagens/pes-4-vovo-guerreira.png', largura: 128, altura: 128, cabecaX: 67, cabecaY: 10, cabecaLargura: 26, maoX: 99, maoY: 81, baseY: 123 },
  { id: 'pes-5', nome: "Criança Aventureira", slot: 'personagem', familia: "Pessoas", custo: 150, arquivo: '/sprites/personagens/pes-5-crianca-aventureira.png', largura: 128, altura: 128, cabecaX: 66, cabecaY: 11, cabecaLargura: 49, maoX: 90, maoY: 76, baseY: 123 },
  { id: 'pes-6', nome: "Corredora", slot: 'personagem', familia: "Pessoas", custo: 150, arquivo: '/sprites/personagens/pes-6-corredora.png', largura: 128, altura: 128, cabecaX: 64, cabecaY: 10, cabecaLargura: 28, maoX: 92, maoY: 81, baseY: 123 },
  { id: 'rob-1', nome: "Robô Sucata", slot: 'personagem', familia: "Robôs", custo: 200, arquivo: '/sprites/personagens/rob-1-robo-sucata.png', largura: 128, altura: 128, cabecaX: 81, cabecaY: 15, cabecaLargura: 26, maoX: 88, maoY: 71, baseY: 122 },
  { id: 'rob-3', nome: "Drone Mensageiro", slot: 'personagem', familia: "Robôs", custo: 250, arquivo: '/sprites/personagens/rob-3-drone-mensageiro.png', largura: 128, altura: 128, cabecaX: 64, cabecaY: 13, cabecaLargura: 56, maoX: 127, maoY: 74, baseY: 119 },
  { id: 'rob-4', nome: "Andróide Polido", slot: 'personagem', familia: "Robôs", custo: 300, arquivo: '/sprites/personagens/rob-4-androide-polido.png', largura: 128, altura: 128, cabecaX: 65, cabecaY: 15, cabecaLargura: 26, maoX: 85, maoY: 72, baseY: 123 },
] as const

export const POR_ID = new Map(CATALOGO.map((p) => [p.id, p]))

export const PERSONAGEM_PADRAO = 'anf-1'

export function pecasDoSlot(slot: Slot) {
  return CATALOGO.filter((p) => p.slot === slot)
}

/** Bases 16x16 antigas. Continuam desenhando para nao apagar avatar de quem ja escolheu. */
export const LADO_SPRITE = 128

export const BASES_ANTIGAS = ['base-01', 'base-02', 'base-03', 'base-04', 'base-05', 'base-06']
