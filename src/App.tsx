import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import { RotaProtegida } from '@/components/auth/RotaProtegida'
import { AppShell } from '@/components/layout/AppShell'
import { ThemeProvider } from '@/contexts/ThemeProvider'
import { registrarServiceWorker } from '@/lib/push'
import { Entrar } from '@/pages/Entrar'
import { GrupoDetalhe } from '@/pages/GrupoDetalhe'
import { Grupos } from '@/pages/Grupos'
import { Hoje } from '@/pages/Hoje'
import { Loja } from '@/pages/Loja'
import { Onboarding } from '@/pages/Onboarding'
import { Perfil } from '@/pages/Perfil'
import { RedefinirSenha } from '@/pages/RedefinirSenha'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

/** O Service Worker manda a rota do desafio quando o usuario toca na notificacao. */
function OuvinteDoServiceWorker() {
  const navegar = useNavigate()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    function aoReceber(evento: MessageEvent) {
      if (evento.data?.tipo === 'abrir' && typeof evento.data.url === 'string') {
        navegar(evento.data.url)
      }
    }

    navigator.serviceWorker.addEventListener('message', aoReceber)
    return () => navigator.serviceWorker.removeEventListener('message', aoReceber)
  }, [navegar])

  return null
}

export function App() {
  useEffect(() => {
    void registrarServiceWorker()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router>
          <ScrollToTop />
          <OuvinteDoServiceWorker />
          <Routes>
            <Route path="/entrar" element={<Entrar />} />
            {/* Fora da RotaProtegida: a sessao de recuperacao ja e uma sessao
                valida, e o guarda mandaria o usuario para dentro do app antes
                de ele conseguir trocar a senha. */}
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            <Route element={<RotaProtegida />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<AppShell />}>
                <Route path="/hoje" element={<Hoje />} />
                <Route path="/grupos" element={<Grupos />} />
                <Route path="/grupos/:id" element={<GrupoDetalhe />} />
                <Route path="/loja" element={<Loja />} />
                <Route path="/perfil" element={<Perfil />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/hoje" replace />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
