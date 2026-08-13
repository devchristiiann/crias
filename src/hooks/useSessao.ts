import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useSessao() {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [semArmazenamento, setSemArmazenamento] = useState(false)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSessao(data.session)
        setCarregando(false)
      })
      // Safari privado, WebView do Instagram e cookie bloqueado fazem a leitura
      // do armazenamento rejeitar. Sem este ramo `carregando` nunca virava
      // false e o app ficava num spinner eterno, que o usuario le como sistema
      // travado. Melhor cair na tela de entrada e dizer o que houve.
      .catch(() => {
        setSessao(null)
        setSemArmazenamento(true)
        setCarregando(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      setCarregando(false)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  return { sessao, carregando, semArmazenamento, usuarioId: sessao?.user.id ?? null }
}
