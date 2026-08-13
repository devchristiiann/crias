import { fonteLegado } from '@/components/AvatarLegado'
import { PERSONAGEM_PADRAO, POR_ID, type Peca, type Slot } from '@/lib/catalogo'
import { cn } from '@/lib/utils'

/**
 * Boneco montado em camadas de PNG: cenario atras, personagem no meio,
 * acessorio na frente.
 *
 * O sprite do personagem nao e quadrado (92x128, por exemplo) e a caixa e.
 * Com `object-contain` mais `object-bottom` o boneco entra inteiro e continua
 * com o pe na mesma linha de chao, seja qual for a familia.
 *
 * Base que comeca com `base-` e do tempo das matrizes 16x16 e desenha pelo
 * `AvatarLegado`, senao o avatar de quem escolheu antes da troca de arte
 * sumiria da tela.
 */

/** Quanto da largura do avatar o acessorio ocupa. Numero de calibragem: a arte
 *  varia de tamanho entre as familias, entao e para ajustar no olho. */
const LARGURA_ACESSORIO = 0.55
/** Quanto o acessorio desce a partir da ancora, em fracao do lado da caixa.
 *  A ancora da cabeca fica no topo do sprite, entao sem descida o chapeu
 *  flutuaria acima do boneco. */
const DESCIDA_ACESSORIO = 0.18
/** Base antiga nao tem ancora. Ali o acessorio cai no terco de cima. */
const TERCO_DE_CIMA = 1 / 3

const CAMADA = 'pointer-events-none absolute inset-0 h-full w-full select-none object-contain'

/** Peca do catalogo, ou nada. Id desconhecido nao pode virar imagem quebrada,
 *  e id do slot errado nao pode virar personagem no lugar de chapeu. */
function peca(id: string | null | undefined, slot: Slot): Peca | undefined {
  if (!id) return undefined
  const achada = POR_ID.get(id)
  return achada?.slot === slot ? achada : undefined
}

/**
 * Onde encostar o acessorio, em porcentagem da caixa.
 *
 * O personagem entra com escala unica `k`, centralizado na horizontal e
 * encostado embaixo. A ancora vem em pixels do proprio sprite, entao passa
 * pela mesma conta para virar porcentagem e continuar certa em qualquer
 * `tamanho`.
 */
function pousoDoAcessorio(personagem: Peca | undefined) {
  const ancora = personagem?.ancoraCabeca
  if (!personagem || !ancora) return { x: 50, y: TERCO_DE_CIMA * 100 }

  const k = Math.min(1 / personagem.largura, 1 / personagem.altura)
  const x = (1 - personagem.largura * k) / 2 + ancora[0] * k
  const y = 1 - personagem.altura * k + ancora[1] * k
  return { x: x * 100, y: (y + DESCIDA_ACESSORIO) * 100 }
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
  const acessorio = peca(item, 'acessorio')
  const pouso = pousoDoAcessorio(personagem)

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

      {acessorio && (
        <img
          src={acessorio.arquivo}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-pixel
          className="pointer-events-none absolute select-none object-contain object-bottom"
          style={{
            left: `${pouso.x}%`,
            top: `${pouso.y}%`,
            width: `${LARGURA_ACESSORIO * 100}%`,
            height: `${LARGURA_ACESSORIO * 100}%`,
            transform: 'translate(-50%, -100%)',
          }}
        />
      )}
    </span>
  )
}
