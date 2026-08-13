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
import { assinarPush, permissaoAtual, registrarServiceWorker, trocarAssinatura } from '@/lib/push'
import { Configuracoes } from '@/pages/Configuracoes'
import { Entrar } from '@/pages/Entrar'
import { GrupoDetalhe } from '@/pages/GrupoDetalhe'
import { Grupos } from '@/pages/Grupos'
import { Hoje } from '@/pages/Hoje'
import { Loja } from '@/pages/Loja'
import { MinhaTrilha } from '@/pages/MinhaTrilha'
import { Onboarding } from '@/pages/Onboarding'
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
      const dados = evento.data

      if (dados?.tipo === 'abrir' && typeof dados.url === 'string') {
        navegar(dados.url)
        return
      }

      // O navegador girou o endereco da assinatura. Sem gravar o novo e apagar
      // o antigo, o push para de chegar e ninguem percebe.
      if (dados?.tipo === 'push-reassinado' && dados.nova) {
        void trocarAssinatura(dados.antiga ?? null, dados.nova)
        return
      }

      if (dados?.tipo === 'push-precisa-reassinar' && permissaoAtual() === 'granted') {
        void assinarPush()
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
                <Route path="/trilha" element={<MinhaTrilha />} />
                <Route path="/loja" element={<Loja />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                {/* A trilha virou o centro do menu e a pagina de perfil se
                    dividiu entre ela e Ajustes. O redirect mantem de pe
                    qualquer link antigo que ja esteja por ai. */}
                <Route path="/perfil" element={<Navigate to="/trilha" replace />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/hoje" replace />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
