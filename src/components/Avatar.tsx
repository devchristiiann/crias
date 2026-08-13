import { BASES, BASE_PADRAO, ITENS, LADO, type Sprite } from '@/lib/sprites'
import { cn } from '@/lib/utils'

function retangulos(sprite: Sprite, chave: string) {
  const saida = []
  for (let y = 0; y < sprite.grade.length; y += 1) {
    const linha = sprite.grade[y]
    for (let x = 0; x < linha.length; x += 1) {
      const cor = sprite.paleta[linha[x]]
      if (!cor) continue
      saida.push(<rect key={`${chave}-${x}-${y}`} x={x} y={y} width={1} height={1} fill={cor} />)
    }
  }
  return saida
}

interface Props {
  base?: string | null
  item?: string | null
  /** Lado em pixels de tela. Multiplo de 16 mantem cada pixel do sprite quadrado. */
  tamanho?: number
  className?: string
}

export function Avatar({ base, item, tamanho = 64, className }: Props) {
  const spriteBase = BASES[base ?? BASE_PADRAO] ?? BASES[BASE_PADRAO]
  const spriteItem = item ? ITENS[item] : undefined

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${LADO} ${LADO}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Personagem"
      className={cn('shrink-0', className)}
    >
      {retangulos(spriteBase, 'b')}
      {spriteItem && retangulos(spriteItem, 'i')}
    </svg>
  )
}
