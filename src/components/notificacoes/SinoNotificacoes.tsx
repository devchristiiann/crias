import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNaoLidas } from '@/hooks/useNotificacoes'

/**
 * Sino da central de notificações.
 *
 * Leva para uma página, não abre folha: o toque na notificação precisa navegar
 * direto para o desafio, e uma folha no caminho obrigaria a fechar antes de ir.
 */
export function SinoNotificacoes() {
  const navegar = useNavigate()
  const { data: naoLidas = 0 } = useNaoLidas()
  const rotulo = naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'

  return (
    <button
      type="button"
      onClick={() => navegar('/notificacoes')}
      aria-label={rotulo}
      title={rotulo}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-lg
                 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="size-5" />
      {naoLidas > 0 && (
        <span
          className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-primary px-1
                     text-[10px] font-semibold leading-4 text-primary-foreground"
        >
          {naoLidas > 9 ? '9+' : naoLidas}
        </span>
      )}
    </button>
  )
}
