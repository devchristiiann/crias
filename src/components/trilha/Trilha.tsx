import { Check, Gift } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '@/components/Avatar'
import { POR_ID } from '@/lib/catalogo'
import { diaEMes } from '@/lib/data'
import { cn } from '@/lib/utils'

const PASSOS_ADIANTE = 4
const PASSOS_ATRAS = 14
const NOS_POR_BAU = 7

/** Geometria da trilha, em pixels. A janela e absoluta, entao tudo sai daqui. */
const NO = 56
const NO_BAU = 64
const ESPACO = 74
const AVATAR = 44
/** Serpentina: o deslocamento horizontal se repete a cada quatro nos. */
const DESLOCAMENTO = [0, 36, 52, 36]
const COLUNA_DATA = 34
const LARGURA = 168
const ALTURA_JANELA = 340

type Estado = 'conquistado' | 'atual' | 'futuro'

interface No {
  indice: number
  estado: Estado
  data?: string
}

/**
 * No que paga bau.
 *
 * O servidor conta a partir de `profiles.bau_base`, que recebe a contagem atual
 * quando a vida zera. Sem o deslocamento a tela desenhava bau onde nao paga e no
 * comum onde paga, para todo mundo que ja zerou a vida uma vez.
 */
function ehBau(indice: number, bauBase: number): boolean {
  return indice > bauBase && (indice - bauBase) % NOS_POR_BAU === 0
}

/** Centro horizontal do no. O maior raio entra na conta para nada sair da faixa. */
function centroX(indice: number): number {
  return NO_BAU / 2 + DESLOCAMENTO[indice % DESLOCAMENTO.length]
}

function montarNos(diasProdutivos: string[]): No[] {
  const conquistados = diasProdutivos.length
  const nos: No[] = []

  const inicio = Math.max(1, conquistados - PASSOS_ATRAS + 1)
  for (let i = inicio; i <= conquistados; i += 1) {
    nos.push({ indice: i, estado: 'conquistado', data: diasProdutivos[i - 1] })
  }

  nos.push({ indice: conquistados + 1, estado: 'atual' })

  for (let i = 1; i <= PASSOS_ADIANTE; i += 1) {
    nos.push({ indice: conquistados + 1 + i, estado: 'futuro' })
  }

  // Futuro em cima, conquistado embaixo: a trilha sobe conforme o usuario avanca.
  return nos.reverse()
}

export function Trilha({
  diasProdutivos,
  avatarBase,
  itemEquipado,
  cenarioEquipado,
  fundoEquipado,
  doente = false,
  bauBase = 0,
}: {
  diasProdutivos: string[]
  avatarBase: string
  itemEquipado: string | null
  cenarioEquipado: string | null
  fundoEquipado: string | null
  doente?: boolean
  bauBase?: number
}) {
  // Id fora do catalogo, ou de outro slot, nao desenha nada: e melhor o bloco de
  // sempre do que imagem quebrada, ou um personagem esticado, atras da trilha.
  const peca = fundoEquipado ? POR_ID.get(fundoEquipado) : undefined
  const fundo = peca?.slot === 'fundo' ? peca : undefined
  const conquistados = diasProdutivos.length
  const nos = montarNos(diasProdutivos)
  const altura = nos.length * ESPACO
  const centroY = (posicao: number) => posicao * ESPACO + ESPACO / 2
  // O no atual fica logo abaixo do bloco de futuros, sempre na mesma posicao.
  const yAtual = centroY(PASSOS_ADIANTE)

  const janela = useRef<HTMLDivElement>(null)
  const anterior = useRef(conquistados)
  const [pulo, setPulo] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    // So um passo de cada vez vira pulo. Isso descarta o salto de 0 ate o valor
    // real na primeira carga da consulta, que nao e uma conquista do usuario.
    if (conquistados === anterior.current + 1) {
      setPulo({
        x: centroX(conquistados) - centroX(conquistados + 1),
        y: ESPACO,
      })
    }
    anterior.current = conquistados
  }, [conquistados])

  useEffect(() => {
    const alvo = janela.current
    if (!alvo) return
    alvo.scrollTop = yAtual - alvo.clientHeight / 2
  }, [yAtual, conquistados])

  const pontos = nos.map((no, posicao) => `${centroX(no.indice)},${centroY(posicao)}`)

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      {fundo && (
        <>
          <img
            src={fundo.arquivo}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-pixel
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
          />
          {/* Veu por cima da cena. Sem ele o numero do no e a data se perdem no
              desenho, e o contraste do texto e requisito, nao enfeite. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-card/65" />
        </>
      )}

      <div
        ref={janela}
        className="relative overflow-y-auto overflow-x-hidden overscroll-contain motion-safe:scroll-smooth"
        style={{ maxHeight: ALTURA_JANELA }}
      >
        <ol className="relative mx-auto" style={{ width: LARGURA, height: altura }}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            width={LARGURA}
            height={altura}
          >
            <polyline
              points={pontos.join(' ')}
              fill="none"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-muted"
            />
            {/* Trecho ja percorrido, do no mais antigo ate o atual. */}
            <polyline
              points={pontos.slice(PASSOS_ADIANTE).join(' ')}
              fill="none"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-primary/45"
            />
          </svg>

          {nos.map((no, posicao) => {
            const bau = ehBau(no.indice, bauBase)
            const lado = bau ? NO_BAU : NO
            const x = centroX(no.indice)
            const y = centroY(posicao)

            return (
              <li key={no.indice}>
                <span
                  aria-label={
                    no.data ? `Dia ${no.indice}, ${diaEMes(no.data)}` : `Dia ${no.indice}`
                  }
                  className={cn(
                    'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-semibold',
                    bau && 'motion-safe:animate-balanco',
                    no.estado === 'conquistado' &&
                      (bau
                        ? 'border-warning bg-warning text-warning-foreground shadow-[0_0_16px_hsl(var(--warning)/0.55)]'
                        : 'border-primary bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.45)]'),
                    no.estado === 'atual' &&
                      (bau
                        ? 'border-warning bg-warning/25 text-warning shadow-[0_0_16px_hsl(var(--warning)/0.5)]'
                        : 'border-primary bg-primary/20 text-primary shadow-[0_0_14px_hsl(var(--primary)/0.4)]'),
                    no.estado === 'futuro' &&
                      (bau
                        ? 'border-warning/60 bg-warning/15 text-warning'
                        : 'border-dashed border-muted-foreground/40 bg-background text-muted-foreground'),
                  )}
                  style={{ left: x, top: y, width: lado, height: lado }}
                >
                  {bau ? (
                    <Gift className="size-7" />
                  ) : no.estado === 'conquistado' ? (
                    <Check className="size-5" />
                  ) : (
                    no.indice
                  )}
                </span>

                {no.estado === 'atual' && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-0 motion-safe:animate-pulso',
                      bau ? 'border-warning' : 'border-primary',
                    )}
                    style={{ left: x, top: y, width: lado, height: lado }}
                  />
                )}

                {no.data && (
                  <span
                    aria-hidden="true"
                    className="absolute -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
                    style={{ left: x + COLUNA_DATA, top: y }}
                  >
                    {diaEMes(no.data)}
                  </span>
                )}
              </li>
            )
          })}

          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
            style={{ left: centroX(conquistados + 1), top: yAtual - NO / 2 + 4 }}
          >
            <div
              className={cn(
                'origin-bottom',
                pulo ? 'motion-safe:animate-pulo' : 'motion-safe:animate-bob',
              )}
              style={
                pulo ? ({ '--pulo-x': `${pulo.x}px`, '--pulo-y': `${pulo.y}px` } as CSSProperties) : undefined
              }
              onAnimationEnd={() => setPulo(null)}
            >
              <Avatar
                base={avatarBase}
                item={itemEquipado}
                cenario={cenarioEquipado}
                tamanho={AVATAR}
                doente={doente}
              />
            </div>
          </div>
        </ol>
      </div>
    </div>
  )
}
