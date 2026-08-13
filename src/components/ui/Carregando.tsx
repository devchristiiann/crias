import { Loader2 } from 'lucide-react'

/**
 * Giro centralizado para o que esta em voo e ainda nao tem forma conhecida.
 *
 * Onde a forma e conhecida o certo e o `Esqueleto`, que desenha o bloco que vai
 * entrar no lugar. Aqui nao da: quem espera e um pedaco de codigo, e cada
 * pagina tem um desenho diferente.
 *
 * O respiro proprio nao e enfeite: `min-h-full` some quando o pai tem altura
 * automatica, e sem ele o giro nasceria colado no topo da area.
 */
export function Carregando() {
  return (
    <div
      role="status"
      aria-label="Carregando"
      className="flex min-h-full items-center justify-center py-16"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}
