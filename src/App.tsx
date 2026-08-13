import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import { AppShell } from '@/components/layout/AppShell'
import { ThemeProvider } from '@/contexts/ThemeProvider'
import { Grupos } from '@/pages/Grupos'
import { Hoje } from '@/pages/Hoje'
import { Loja } from '@/pages/Loja'
import { Perfil } from '@/pages/Perfil'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Navigate to="/hoje" replace />} />
            <Route element={<AppShell />}>
              <Route path="/hoje" element={<Hoje />} />
              <Route path="/grupos" element={<Grupos />} />
              <Route path="/loja" element={<Loja />} />
              <Route path="/perfil" element={<Perfil />} />
            </Route>
            <Route path="*" element={<Navigate to="/hoje" replace />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
