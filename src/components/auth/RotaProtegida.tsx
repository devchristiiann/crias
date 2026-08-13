import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSessao } from '@/hooks/useSessao'
import { supabase } from '@/lib/supabase'

function Carregando() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export function RotaProtegida() {
  const { sessao, carregando, usuarioId } = useSessao()
  const local = useLocation()

  const { data: temHabito, isPending } = useQuery({
    queryKey: ['tem-habito', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('habits')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', usuarioId!)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })

  if (carregando) return <Carregando />
  if (!sessao) return <Navigate to="/entrar" replace />
  if (isPending) return <Carregando />

  // So empurra PARA o onboarding. Nao empurra de volta: os passos 3 e 4 acontecem
  // depois do habito existir, e um redirect aqui expulsaria o usuario no meio.
  const noOnboarding = local.pathname === '/onboarding'
  if (!temHabito && !noOnboarding) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
