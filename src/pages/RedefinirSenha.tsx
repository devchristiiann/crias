import { useMutation } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { supabase } from '@/lib/supabase'

type Estado = 'verificando' | 'pronto' | 'link_invalido' | 'salvo'

const MENSAGENS: Record<string, string> = {
  'New password should be different from the old password.':
    'A senha nova precisa ser diferente da anterior.',
  'Password should be at least 8 characters.': 'A senha precisa de pelo menos 8 caracteres.',
  'Auth session missing!': 'O link expirou. Peça um novo na tela de entrada.',
}

/**
 * Fim do fluxo de recuperacao recomendado pelo Supabase.
 *
 * O link do e-mail traz um codigo na URL, o SDK troca por sessao sozinho
 * (detectSessionInUrl com PKCE) e dispara PASSWORD_RECOVERY. So entao a troca
 * de senha e permitida. Esta rota fica FORA da RotaProtegida de proposito: a
 * sessao de recuperacao mandaria o usuario direto para dentro do app, e ele
 * nunca chegaria a trocar a senha.
 */
export function RedefinirSenha() {
  const [estado, setEstado] = useState<Estado>('verificando')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const navegar = useNavigate()

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') setEstado('pronto')
    })

    // O evento pode ter disparado antes deste componente montar.
    supabase.auth.getSession().then(({ data }) => {
      setEstado((atual) => {
        if (atual !== 'verificando') return atual
        return data.session ? 'pronto' : 'link_invalido'
      })
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const salvar = useMutation({
    mutationFn: async () => {
      setErro(null)
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
    },
    onSuccess: () => {
      setEstado('salvo')
      setTimeout(() => navegar('/hoje', { replace: true }), 1200)
    },
    onError: (e: Error) => setErro(MENSAGENS[e.message] ?? e.message),
  })

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nova senha</h1>
        <p className="text-sm text-muted-foreground">Escolha uma senha de pelo menos 8 caracteres.</p>
      </header>

      {estado === 'verificando' && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {estado === 'link_invalido' && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm">Este link não vale mais.</p>
          <p className="text-sm text-muted-foreground">
            Links de recuperação expiram em uma hora e servem uma vez só.
          </p>
          <Link
            to="/entrar"
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            Pedir um link novo
          </Link>
        </div>
      )}

      {estado === 'pronto' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!salvar.isPending) salvar.mutate()
          }}
        >
          <Campo
            rotulo="Senha nova"
            type="password"
            autoComplete="new-password"
            value={senha}
            required
            minLength={8}
            onChange={(e) => setSenha(e.target.value)}
            erro={erro ?? undefined}
          />
          <Botao
            type="submit"
            tamanho="lg"
            className="w-full"
            disabled={senha.length < 8}
            carregando={salvar.isPending}
          >
            Salvar senha
          </Botao>
        </form>
      )}

      {estado === 'salvo' && (
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <Check className="size-4" />
          Senha trocada. Levando você para o app.
        </p>
      )}
    </main>
  )
}
