import { CalendarCheck, Settings, Store, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { usePerfil } from '@/hooks/usePerfil'
import { cn } from '@/lib/utils'

const ABAS = [
  { para: '/hoje', rotulo: 'Hoje', Icone: CalendarCheck },
  { para: '/grupos', rotulo: 'Grupos', Icone: Users },
  { para: '/loja', rotulo: 'Loja', Icone: Store },
  { para: '/configuracoes', rotulo: 'Ajustes', Icone: Settings },
] as const

export function BottomNav() {
  const { data: perfil } = usePerfil()

  return (
    <nav className="relative shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ABAS.slice(0, 2).map((aba) => (
          <ItemNav key={aba.para} {...aba} />
        ))}

        {/* A trilha e a funcionalidade principal, entao ela nao e um item igual
            aos outros: e um botao redondo elevado, no centro do menu. */}
        <li className="flex justify-center">
          <NavLink
            to="/trilha"
            aria-label="Trilha"
            className={({ isActive }) =>
              cn(
                'relative -top-5 flex size-16 items-center justify-center rounded-full',
                'ring-4 ring-card transition-transform active:scale-95',
                isActive ? 'bg-primary' : 'bg-primary/90',
              )
            }
          >
            <Avatar base={perfil?.avatar_base} item={perfil?.item_equipado} tamanho={48} />
          </NavLink>
        </li>

        {ABAS.slice(2).map((aba) => (
          <ItemNav key={aba.para} {...aba} />
        ))}
      </ul>
    </nav>
  )
}

function ItemNav({
  para,
  rotulo,
  Icone,
}: {
  para: string
  rotulo: string
  Icone: typeof CalendarCheck
}) {
  return (
    <li>
      <NavLink
        to={para}
        className={({ isActive }) =>
          cn(
            // h-14 mantem o alvo de toque acima dos 44px exigidos.
            'flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium',
            'transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icone className="size-5" strokeWidth={isActive ? 2.4 : 1.8} />
            {rotulo}
          </>
        )}
      </NavLink>
    </li>
  )
}
