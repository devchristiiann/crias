import { fonteLegado } from '@/components/AvatarLegado'
import { LADO_SPRITE, PERSONAGEM_PADRAO, POR_ID, type Peca, type Slot } from '@/lib/catalogo'
import { cn } from '@/lib/utils'

/**
 * Boneco montado em camadas de PNG: cenario e item de costas atras, personagem
 * no meio, chapeu e item de mao na frente.
 *
 * Todo personagem sai do pipeline numa tela de 128 por 128, com o pe na mesma
 * linha e o corpo centralizado. Por isso a caixa e quadrada e a conta de
 * posicao e uma divisao por 128: pixel do sprite vira porcentagem da caixa e
 * continua certo em qualquer `tamanho`.
 *
 * O acessorio NAO cai sempre no mesmo lugar. Cada um declara onde encosta, e
 * cada personagem carrega a cabeca e a mao medidas no pixel. Sem isso espada,
 * cajado e raio iam parar na testa da pessoa, que foi exatamente o que
 * aconteceu na primeira versao.
 *
 * Base que comeca com `base-` e do tempo das matrizes 16x16 e desenha pelo
 * `AvatarLegado`, senao o avatar de quem escolheu antes da troca de arte
 * sumiria da tela.
 */

/* Calibragem. Sao os numeros que eu ajustei olhando as combinacoes montadas,
 * nao valores teoricos. Mexer aqui muda todos os personagens de uma vez. */
const CHAPEU_FOLGA = 1.18 // quanto o chapeu passa da largura da cabeca
const CHAPEU_ACIMA = 0.62 // fracao do chapeu que fica acima do topo da cabeca
const MAO_ALTURA = 0.62 // altura do item de mao, em fracao do corpo
const MAO_RECUO = 0.35 // quanto do item fica para dentro da mao
const COSTAS_LARGURA = 0.95 // largura do item de costas, em fracao do corpo
const COSTAS_TOPO = 0.22 // onde comeca, descendo do topo da cabeca

const CAMADA = 'pointer-events-none absolute inset-0 h-full w-full select-none object-contain'
const pct = (v: number) => `${(v / LADO_SPRITE) * 100}%`

/** Peca do catalogo, ou nada. Id desconhecido nao pode virar imagem quebrada,
 *  e id do slot errado nao pode virar personagem no lugar de chapeu. */
function peca(id: string | null | undefined, slot: Slot): Peca | undefined {
  if (!id) return undefined
  const achada = POR_ID.get(id)
  return achada?.slot === slot ? achada : undefined
}

/** Estilo do acessorio a partir da medida do personagem que o veste. */
function pouso(acessorio: Peca, p: Peca | undefined): React.CSSProperties {
  const medido = p?.cabecaY !== undefined && p.baseY !== undefined
  // Personagem antigo de 16x16 nao tem medida. Ali o chapeu vai para o terco
  // de cima e o resto vai para o meio, que e o menos errado sem dado.
  if (!medido) {
    return acessorio.encaixe === 'mao'
      ? { left: '78%', top: '58%', width: '34%', transform: 'translate(-50%, -50%)' }
      : { left: '50%', top: '30%', width: '52%', transform: 'translate(-50%, -60%)' }
  }

  const corpo = p.baseY! - p.cabecaY!

  if (acessorio.encaixe === 'mao') {
    const altura = corpo * MAO_ALTURA
    const largura = altura * (acessorio.largura / acessorio.altura)
    return {
      left: pct(p.maoX!),
      top: pct(p.maoY!),
      width: pct(largura),
      transform: `translate(${-MAO_RECUO * 100}%, -45%)`,
    }
  }

  if (acessorio.encaixe === 'costas') {
    return {
      left: '50%',
      top: pct(p.cabecaY! + corpo * COSTAS_TOPO),
      width: pct(corpo * COSTAS_LARGURA),
      transform: 'translate(-50%, 0)',
    }
  }

  return {
    left: pct(p.cabecaX!),
    top: pct(p.cabecaY!),
    width: pct(p.cabecaLargura! * CHAPEU_FOLGA),
    transform: `translate(-50%, ${-CHAPEU_ACIMA * 100}%)`,
  }
}

interface Props {
  /** Id de personagem do catalogo, ou `base-0X` do formato antigo. */
  base?: string | null
  /** Id de acessorio do catalogo, ou `item-0X` do formato antigo. */
  item?: string | null
  /** Id de cenario do catalogo. Desenhado atras do personagem. */
  cenario?: string | null
  /** Lado da caixa em pixels de tela. */
  tamanho?: number
  className?: string
}

export function Avatar({ base, item, cenario, tamanho = 64, className }: Props) {
  const legado = base?.startsWith('base-') ? base : null
  const itemLegado = item?.startsWith('item-') ? item : null
  // Id de personagem que nao existe mais cai no padrao: melhor o boneco errado
  // que caixa vazia no lugar do avatar.
  const personagem = legado
    ? undefined
    : (peca(base, 'personagem') ?? peca(PERSONAGEM_PADRAO, 'personagem'))
  const cena = peca(cenario, 'cenario')
  const acessorio = itemLegado ? undefined : peca(item, 'acessorio')
  const atras = acessorio?.encaixe === 'costas'

  const camadaAcessorio = acessorio && (
    <img
      src={acessorio.arquivo}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-pixel
      className="pointer-events-none absolute h-auto select-none"
      style={pouso(acessorio, personagem)}
    />
  )

  return (
    <span
      className={cn('relative block shrink-0 select-none', className)}
      style={{ width: tamanho, height: tamanho }}
    >
      {cena && (
        <img
          src={cena.arquivo}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-pixel
          className={cn(CAMADA, 'object-bottom')}
        />
      )}

      {atras && camadaAcessorio}

      {legado ? (
        <img
          src={fonteLegado(legado, itemLegado)}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-pixel
          className={cn(CAMADA, 'object-bottom')}
        />
      ) : (
        personagem && (
          <img
            src={personagem.arquivo}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-pixel
            className={cn(CAMADA, 'object-bottom')}
          />
        )
      )}

      {!atras && camadaAcessorio}
    </span>
  )
}
