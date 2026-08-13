import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Tema = 'light' | 'dark'

interface TemaContexto {
  tema: Tema
  alternar: () => void
}

const Contexto = createContext<TemaContexto | null>(null)

function temaSalvo(): Tema {
  try {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaSalvo)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark')
    try {
      localStorage.setItem('theme', tema)
    } catch {
      /* localStorage bloqueado, tema vale so nesta sessao */
    }
  }, [tema])

  const alternar = useCallback(() => {
    setTema((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return <Contexto.Provider value={{ tema, alternar }}>{children}</Contexto.Provider>
}

export function useTheme() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useTheme precisa estar dentro de ThemeProvider')
  return ctx
}
