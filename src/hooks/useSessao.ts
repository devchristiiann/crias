import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useSessao() {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      setCarregando(false)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  return { sessao, carregando, usuarioId: sessao?.user.id ?? null }
}
