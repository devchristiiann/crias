import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, useEffect } from 'react'
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
import { Carregando } from '@/components/ui/Carregando'
import { ThemeProvider } from '@/contexts/ThemeProvider'
import { pagina } from '@/lib/pedacos'
import { assinarPush, permissaoAtual, registrarServiceWorker, trocarAssinatura } from '@/lib/push'
import { Entrar } from '@/pages/Entrar'
import { RedefinirSenha } from '@/pages/RedefinirSenha'

// Uma pagina por pedaco, buscado quando a rota abre. Quem entra em Hoje nao
// precisa baixar a loja, a trilha, os ajustes e o onboarding antes de ver o
// primeiro habito. Quem espera pelas de dentro do app e o `Suspense` da casca,
// em `AppShell`, que ja esta desenhada com o menu quando o pedaco chega.
//
// `pagina` no lugar de `lazy` porque dividir o codigo traz junto o pedaco que
// some no deploy seguinte. O tratamento esta em `@/lib/pedacos`.
//
// `Entrar` e `RedefinirSenha` continuam estaticas: a primeira e a tela de quem
// ainda nao tem sessao, e dividir ela poria uma ida de rede antes do login; a
// segunda e pequena e nao arrasta nada consigo.
const Configuracoes = pagina(() =>
  import('@/pages/Configuracoes').then((m) => ({ default: m.Configuracoes })),
)
const GrupoDetalhe = pagina(() =>
  import('@/pages/GrupoDetalhe').then((m) => ({ default: m.GrupoDetalhe })),
)
const Grupos = pagina(() => import('@/pages/Grupos').then((m) => ({ default: m.Grupos })))
const Hoje = pagina(() => import('@/pages/Hoje').then((m) => ({ default: m.Hoje })))
const Loja = pagina(() => import('@/pages/Loja').then((m) => ({ default: m.Loja })))
const MinhaTrilha = pagina(() =>
  import('@/pages/MinhaTrilha').then((m) => ({ default: m.MinhaTrilha })),
)
const Notificacoes = pagina(() =>
  import('@/pages/Notificacoes').then((m) => ({ default: m.Notificacoes })),
)
// O onboarding roda fora da casca, entao ele traz a propria fronteira. Vale a
// linha extra: e a pagina que carrega o catalogo de personagens e o motor de
// frequencia inteiro, e uma conta passa por ela uma vez na vida.
const Onboarding = pagina(() =>
  import('@/pages/Onboarding').then((m) => ({ default: m.Onboarding })),
)

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
              <Route
                path="/onboarding"
                element={
                  // Fora da casca nao ha menu nem esqueleto de pagina para
                  // segurar a tela, entao fallback vazio aqui e tela 100%
                  // branca: e a primeira coisa que uma conta nova ve. O giro
                  // nao e o carregamento de tela cheia que saiu do guarda de
                  // rota: aquele esperava uma consulta que nem esta tela usa,
                  // este espera o pedaco de codigo desta tela.
                  <Suspense fallback={<Carregando />}>
                    <Onboarding />
                  </Suspense>
                }
              />
              <Route element={<AppShell />}>
                <Route path="/hoje" element={<Hoje />} />
                <Route path="/grupos" element={<Grupos />} />
                <Route path="/grupos/:id" element={<GrupoDetalhe />} />
                <Route path="/trilha" element={<MinhaTrilha />} />
                <Route path="/loja" element={<Loja />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="/notificacoes" element={<Notificacoes />} />
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
