/**
 * Sprites em pixel art, 16x16, escritos como matriz de caracteres.
 *
 * Cada caractere aponta para uma cor da paleta daquele sprite, e `.` e transparente.
 * Isso e o asset de verdade, nao um placeholder: renderiza nitido em qualquer
 * densidade de tela, nao depende de rede nem de CDN, pesa quase nada e da para
 * editar um pixel sem abrir editor de imagem. Trocar por PNG depois so exige
 * mudar o componente Avatar, nada mais.
 *
 * A geometria do corpo e uma so. As seis bases mudam apenas a paleta, que e
 * como sprite sheet de jogo costuma variar personagem sem redesenhar tudo.
 */

export const LADO = 16

const CORPO = [
  '................',
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...khpppppphk...',
  '...khpeppephk...',
  '...khpppppphk...',
  '...khppmmpphk...',
  '...khPppppPhk...',
  '......kppk......',
  '...kcccccccck...',
  '..kcccccccccck..',
  '..kpkcccccckpk..',
  '...kkcccccckk...',
  '....kllllllk....',
  '....kbbkkbbk....',
] as const

interface Paleta {
  [caractere: string]: string
}

const CONTORNO = '#17161c'
const OLHO = '#17161c'
const BOCA = '#8c4a3f'

function paletaBase(cabelo: string, pele: string, peleSombra: string, camisa: string, calca: string, sapato: string): Paleta {
  return { k: CONTORNO, h: cabelo, p: pele, P: peleSombra, e: OLHO, m: BOCA, c: camisa, l: calca, b: sapato }
}

export interface Sprite {
  grade: readonly string[]
  paleta: Paleta
}

export const BASES: Record<string, Sprite> = {
  'base-01': { grade: CORPO, paleta: paletaBase('#3a2b21', '#f0c9a4', '#d8a97f', '#c0392b', '#33384a', '#2b2b33') },
  'base-02': { grade: CORPO, paleta: paletaBase('#1d1c22', '#8d5a3b', '#70452c', '#2e7d5b', '#33384a', '#2b2b33') },
  'base-03': { grade: CORPO, paleta: paletaBase('#c9a227', '#f7dcc0', '#dcbb9a', '#2b6cb0', '#3f4454', '#2b2b33') },
  'base-04': { grade: CORPO, paleta: paletaBase('#5b3a8e', '#e8b98f', '#c9976d', '#d98324', '#33384a', '#2b2b33') },
  'base-05': { grade: CORPO, paleta: paletaBase('#7a1f1f', '#5d3a25', '#482c1c', '#e0e0e6', '#3f4454', '#2b2b33') },
  'base-06': { grade: CORPO, paleta: paletaBase('#2f6f4f', '#f0c9a4', '#d8a97f', '#7b4fa8', '#2b2b33', '#1d1c22') },
}

export const BASE_PADRAO = 'base-01'

const VAZIA = '................'
const nada = (n: number) => Array.from({ length: n }, () => VAZIA)

/** Overlay: desenhado por cima da base, no mesmo canvas de 16x16. */
function item(linhas: string[], paleta: Paleta): Sprite {
  return { grade: [...linhas, ...nada(LADO - linhas.length)], paleta }
}

export const ITENS: Record<string, Sprite> = {
  'item-01': item(
    ['................', '..aaaaaaaaaaaa..', '..aAAAAAAAAAAa..', '....aaaaaaaa....'],
    { a: '#8a6a2f', A: '#d9b45c' },
  ),
  'item-02': item(
    ['....a.a..a.a....', '....aaaaaaaa....', '...aAAAAAAAAa...', '................'],
    { a: '#8a6a2f', A: '#f2cf5b' },
  ),
  'item-03': item(
    ['................', '................', '...aaaaaaaaaa...', '...aAaAaAaAaAa..'],
    { a: '#7a1f2b', A: '#d94f5c' },
  ),
  'item-04': item(
    ['....aaaaaaaa....', '...aAAAAAAAAa...', '...aAAAAAAAAa...', '..aaaaaaaaaaaa..'],
    { a: '#1f3a6e', A: '#2f5fb0' },
  ),
  'item-05': item(
    ['................', '................', '................', '................', '................', '..aaaaaaaaaaaa..', '..a.aa.aa.aa.a..'],
    { a: '#17161c' },
  ),
  'item-06': item(
    ['................', '................', '................', '................', '................', '................', '................', '................', '................', '....aAaAaAaA....', '.....aAaAaA.....'],
    { a: '#6e2f5b', A: '#c25ba0' },
  ),
  'item-07': item(
    ['................', '................', '................', '................', '................', '................', '................', '................', '................', '................', '.aa..........aa.', 'aAa..........aAa', 'aAa..........aAa', '.aa..........aa.'],
    { a: '#5b1f1f', A: '#a83232' },
  ),
  'item-08': item(
    ['..aAAAAAAAAAAa..', '................'],
    { a: '#c9a227', A: '#f5d76e' },
  ),
  'item-09': item(
    ['..aa........aa..', '..aAa......aAa..', '...aAa....aAa...', '................'],
    { a: '#4a2c1c', A: '#8c5a3c' },
  ),
  'item-10': item(
    ['................', '................', '..aa........aa..', '..aAa......aAa..', '..aAa......aAa..', '..aa........aa..'],
    { a: '#22252e', A: '#4f5666' },
  ),
  'item-11': item(
    ['................', '................', '................', '................', '................', '...aaaaaaaaaa...', '...aAAAAAAAAa...'],
    { a: '#1f4a3a', A: '#3f8f6a' },
  ),
  'item-12': item(
    ['....aaaaaaaa....', '...aAAAAAAAAa...', '...aAAaaaaAAa...', '...aaa....aaa...'],
    { a: '#3a3f4a', A: '#8f96a8' },
  ),
}

/** Catalogo da loja. Precisa bater com o seed de avatar_items no banco. */
export const CATALOGO_ITENS = [
  { id: 'item-01', nome: 'Chapéu de palha', custo: 40 },
  { id: 'item-02', nome: 'Coroa', custo: 300 },
  { id: 'item-03', nome: 'Bandana', custo: 60 },
  { id: 'item-04', nome: 'Boné', custo: 60 },
  { id: 'item-05', nome: 'Óculos escuros', custo: 80 },
  { id: 'item-06', nome: 'Cachecol', custo: 90 },
  { id: 'item-07', nome: 'Ombreiras', custo: 150 },
  { id: 'item-08', nome: 'Auréola', custo: 250 },
  { id: 'item-09', nome: 'Chifres', custo: 180 },
  { id: 'item-10', nome: 'Fone de ouvido', custo: 120 },
  { id: 'item-11', nome: 'Faixa da cabeça', custo: 50 },
  { id: 'item-12', nome: 'Elmo', custo: 220 },
] as const
