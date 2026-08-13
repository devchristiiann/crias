import { cn } from '@/lib/utils'

/**
 * Bloco cinza no lugar de um dado que ainda esta em voo.
 *
 * Forma, nunca conteudo: esqueleto que desenha um numero ou um nome de mentira
 * e uma tela que informa errado por meio segundo. Quem usa e responsavel por
 * dar a ele a MESMA altura do que vai entrar no lugar, senao o bloco de baixo
 * pula quando o dado chega.
 *
 * `aria-hidden` porque nao ha o que ler aqui: quem anuncia o carregamento e o
 * bloco que envolve, com `aria-busy`.
 */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-muted', className)} />
}
