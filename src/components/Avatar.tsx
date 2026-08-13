import { Thermometer } from 'lucide-react'
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

/* Cenario de ancora `chao`. Sao fracoes da caixa do avatar.
 *
 * Pedestal desenhado como o personagem, esticado pela caixa toda, vira painel
 * atras do corpo: era esse o "so fica atras e nem embaixo". Plataforma e outra
 * geometria, e por isso tem numero proprio. A proporcao da caixa
 * (CHAO_LARGURA sobre CHAO_ALTURA) e a mesma que scripts/recortar-pedestais.mjs
 * da a arte, entao o sprite preenche a caixa sem sobra nas laterais.
 *
 * CORPO_LADO encolhe a caixa do personagem para ela terminar dentro da face de
 * cima da plataforma. O personagem fica um quinto menor quando tem pedestal, e
 * e justamente isso que faz a cena ler como alguem de pe em cima de alguma
 * coisa em vez de alguem na frente de um movel. */
const CHAO_LARGURA = 0.84
const CHAO_ALTURA = 0.3
const CHAO_PISO = 0.12 // onde o pe encosta, subindo do fundo da caixa
const CORPO_LADO = 0.8

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
  /** Personagem doente: sprite sem cor e selo de febre no canto. */
  doente?: boolean
  /**
   * Sprite que pode chegar depois. Ligar em lista longa: o ranking desenha
   * dezenas de avatares de uma vez, tres `<img>` cada, e todos disputavam a
   * rede com as fotos do feed. Fica desligado por padrao porque o avatar de
   * destaque (podio, menu, trilha, entrada) tem que aparecer na hora.
   */
  adiavel?: boolean
  className?: string
}

export function Avatar({
  base,
  item,
  cenario,
  tamanho = 64,
  doente = false,
  adiavel = false,
  className,
}: Props) {
  const legado = base?.startsWith('base-') ? base : null
  const itemLegado = item?.startsWith('item-') ? item : null
  // Id de personagem que nao existe mais cai no padrao: melhor o boneco errado
  // que caixa vazia no lugar do avatar.
  const personagem = legado
    ? undefined
    : (peca(base, 'personagem') ?? peca(PERSONAGEM_PADRAO, 'personagem'))
  const cena = peca(cenario, 'cenario')
  // Pedestal e chao sob os pes, aura e moldura sao fundo do tamanho da caixa.
  // Dois desenhos diferentes, e quem separa e a ancora do catalogo.
  const chao = cena?.ancora === 'chao' ? cena : undefined
  const acessorio = itemLegado ? undefined : peca(item, 'acessorio')
  const atras = acessorio?.encaixe === 'costas'
  const carga = adiavel ? 'lazy' : 'eager'

  // A pilha do personagem vive numa caixa propria, quadrada, que termina na
  // face de cima da plataforma. As ancoras de `pouso()` sao porcentagem dessa
  // caixa, entao encolher a caixa leva chapeu e item junto e o encaixe
  // continua certo. Sem pedestal a caixa e a caixa inteira, como sempre foi.
  const caixaCorpo: React.CSSProperties = chao
    ? {
        left: '50%',
        bottom: `${CHAO_PISO * 100}%`,
        width: `${CORPO_LADO * 100}%`,
        height: `${CORPO_LADO * 100}%`,
        transform: 'translateX(-50%)',
      }
    : { inset: 0 }

  const camadaAcessorio = acessorio && (
    <img
      src={acessorio.arquivo}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-pixel
      loading={carga}
      decoding="async"
      className="pointer-events-none absolute h-auto select-none"
      style={pouso(acessorio, personagem)}
    />
  )

  // O selo fica FORA da camada que leva o filtro: filtro de CSS vale para a
  // subarvore inteira e um filho nao desfaz o do pai, entao um selo por dentro
  // sairia sem cor junto com o boneco.
  const selo = Math.max(13, Math.round(tamanho * 0.32))

  const camadas = (
    <>
      {chao ? (
        <img
          src={chao.arquivo}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-pixel
          loading={carga}
          decoding="async"
          className="pointer-events-none absolute bottom-0 select-none object-contain object-bottom"
          style={{
            left: '50%',
            width: `${CHAO_LARGURA * 100}%`,
            height: `${CHAO_ALTURA * 100}%`,
            transform: 'translateX(-50%)',
          }}
        />
      ) : (
        cena && (
          <img
            src={cena.arquivo}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-pixel
            loading={carga}
            decoding="async"
            className={cn(CAMADA, 'object-bottom')}
          />
        )
      )}

      <span className="absolute" style={caixaCorpo}>
        {atras && camadaAcessorio}

        {legado ? (
          <img
            src={fonteLegado(legado, itemLegado)}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-pixel
            loading={carga}
            decoding="async"
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
              loading={carga}
              decoding="async"
              className={cn(CAMADA, 'object-bottom')}
            />
          )
        )}

        {!atras && camadaAcessorio}
      </span>
    </>
  )

  return (
    <span
      className={cn('relative block shrink-0 select-none', className)}
      style={{ width: tamanho, height: tamanho }}
    >
      {doente ? (
        <span className="absolute inset-0 grayscale-[0.85] contrast-75 brightness-95">
          {camadas}
        </span>
      ) : (
        camadas
      )}

      {doente && (
        <>
          {/* Cor sozinha nao pode ser o sinal: quem nao distingue o cinza do
              boneco ainda ve o termometro. */}
          <span
            aria-hidden="true"
            className="absolute bottom-0 right-0 flex items-center justify-center rounded-full
                       bg-destructive text-destructive-foreground ring-2 ring-card"
            style={{ width: selo, height: selo }}
          >
            <Thermometer style={{ width: selo * 0.6, height: selo * 0.6 }} />
          </span>
          <span className="sr-only">Doente</span>
        </>
      )}
    </span>
  )
}
