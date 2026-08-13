import { CalendarCheck, Store, User, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const ABAS = [
  { para: '/hoje', rotulo: 'Hoje', Icone: CalendarCheck },
  { para: '/grupos', rotulo: 'Grupos', Icone: Users },
  { para: '/loja', rotulo: 'Loja', Icone: Store },
  { para: '/perfil', rotulo: 'Perfil', Icone: User },
] as const

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg">
        {ABAS.map(({ para, rotulo, Icone }) => (
          <li key={para} className="flex-1">
            <NavLink
              to={para}
              className={({ isActive }) =>
                cn(
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
        ))}
      </ul>
    </nav>
  )
}
