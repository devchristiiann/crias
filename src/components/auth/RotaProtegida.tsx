import { Loader2 } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Botao } from '@/components/ui/Botao'
import { usePerfil } from '@/hooks/usePerfil'
import { useSessao } from '@/hooks/useSessao'

function Carregando() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export function RotaProtegida() {
  const { sessao, carregando } = useSessao()
  const local = useLocation()

  // O sinal de "esta conta ja fez o onboarding" e `personagem_definido`, nao
  // ter habito. Antes o guarda contava habitos, e desde que `excluir_habito`
  // existe apagar a ultima rotina jogava um usuario antigo de volta no
  // onboarding, com direito a refazer a escolha do personagem.
  const { data: perfil, isPending, isError, refetch } = usePerfil()

  if (carregando) return <Carregando />
  if (!sessao) return <Navigate to="/entrar" replace />

  // Falha de rede nao pode virar redirecionamento. Sem este ramo, quem ja fez
  // o onboarding era jogado de volta nele toda vez que a consulta falhava.
  if (isError) {
    return (
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 px-5">
        <p className="text-sm">Não deu para carregar seus dados.</p>
        <Botao onClick={() => refetch()}>Tentar de novo</Botao>
      </div>
    )
  }

  if (isPending || !perfil) return <Carregando />

  // So empurra PARA o onboarding. Nao empurra de volta: o personagem e definido
  // logo no primeiro passo, e um redirect aqui expulsaria o usuario do meio do
  // fluxo. Criar o primeiro habito e passo de dentro do onboarding, nao trava
  // de rota: apagar rotina depois nao pode reabrir o cadastro.
  const noOnboarding = local.pathname === '/onboarding'
  if (!perfil.personagem_definido && !noOnboarding) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
