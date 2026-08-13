import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeProvider'

export function Perfil() {
  const { tema, alternar } = useTheme()

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
        <p className="text-sm text-muted-foreground">Seu personagem e sua ofensiva.</p>
      </header>

      <button
        type="button"
        onClick={alternar}
        className="flex w-full items-center justify-between rounded-lg border border-border
                   bg-card px-4 py-3 text-sm font-medium shadow-sm"
      >
        Tema {tema === 'dark' ? 'escuro' : 'claro'}
        {tema === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </button>
    </section>
  )
}
