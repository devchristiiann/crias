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

/**
 * Menu inferior.
 *
 * `shrink-0` e obrigatorio: sem ele o flex encolhe o menu quando o conteudo
 * cresce, e foi assim que ele apareceu cortado pela metade no iPhone.
 *
 * O respiro da area do indicador de home fica no proprio menu, por dentro, para
 * o fundo continuar encostando na borda de baixo da tela. Um respiro por fora
 * deixaria uma faixa vazia embaixo do menu, que foi outro sintoma relatado.
 */
export function BottomNav() {
  const { data: perfil } = usePerfil()

  return (
    <nav
      className="shrink-0 border-t border-border bg-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {ABAS.slice(0, 2).map((aba) => (
          <ItemNav key={aba.para} {...aba} />
        ))}

        {/* A trilha e a funcionalidade principal, entao nao e um item igual aos
            outros. Ela sobe, mas dentro da altura do proprio menu: elevar para
            fora recortaria o botao na borda da tela. */}
        <li className="flex justify-center">
          <NavLink
            to="/trilha"
            aria-label="Trilha"
            className={({ isActive }) =>
              cn(
                'mb-1 flex size-14 items-center justify-center rounded-full',
                'ring-4 ring-card transition-transform active:scale-95',
                isActive ? 'bg-primary' : 'bg-primary/85',
              )
            }
          >
            <Avatar
              base={perfil?.avatar_base}
              item={perfil?.item_equipado}
              cenario={perfil?.cenario_equipado}
              tamanho={40}
            />
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
