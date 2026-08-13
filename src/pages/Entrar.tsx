import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { useSessao } from '@/hooks/useSessao'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Modo = 'entrar' | 'criar' | 'recuperar'

const MENSAGENS: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Esse e-mail já tem conta. Entre em vez de criar.',
  'Password should be at least 8 characters.': 'A senha precisa de pelo menos 8 caracteres.',
  'Email rate limit exceeded': 'Muitos e-mails em pouco tempo. Espere alguns minutos.',
  'For security purposes, you can only request this after 60 seconds.':
    'Espere um minuto antes de pedir de novo.',
}

export function Entrar() {
  const { sessao, carregando } = useSessao()
  const [modo, setModo] = useState<Modo>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)

  function trocarModo(novo: Modo) {
    setModo(novo)
    setErro(null)
    setEnviadoPara(null)
  }

  const enviar = useMutation({
    mutationFn: async () => {
      setErro(null)

      if (modo === 'recuperar') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        })
        if (error) throw error
        setEnviadoPara(email.trim())
        return
      }

      if (modo === 'criar') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() } },
        })
        if (error) throw error
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      })
      if (error) throw error
    },
    onError: (e: Error) => setErro(MENSAGENS[e.message] ?? e.message),
  })

  // Quem ja tem sessao nao fica preso no formulario. Quem decide se o destino e
  // /hoje ou /onboarding e a RotaProtegida.
  if (!carregando && sessao) return <Navigate to="/hoje" replace />

  if (modo === 'recuperar') {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
        <button
          type="button"
          onClick={() => trocarModo('entrar')}
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground">
            Mandamos um link para você criar uma senha nova.
          </p>
        </header>

        {enviadoPara ? (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <MailCheck className="size-4 text-success" />
              Link enviado para {enviadoPara}
            </p>
            <p className="text-sm text-muted-foreground">
              Abra o e-mail e toque no link. Ele vale por uma hora. Confira também a caixa de spam.
            </p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!enviar.isPending) enviar.mutate()
            }}
          >
            <Campo
              rotulo="E-mail da conta"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              erro={erro ?? undefined}
            />
            <Botao type="submit" tamanho="lg" carregando={enviar.isPending} className="w-full">
              Enviar link
            </Botao>
          </form>
        )}
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-7 px-5 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <Avatar tamanho={96} />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Crias</h1>
          <p className="text-sm text-muted-foreground">Hábitos em grupo, com ofensiva e ouro.</p>
        </div>
      </header>

      {/* Alternador visivel no topo. Antes o caminho para criar conta era um
          botao de texto embaixo do formulario, e quem chegava na tela nao via. */}
      <div
        role="tablist"
        aria-label="Entrar ou criar conta"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        {(['entrar', 'criar'] as const).map((alvo) => (
          <button
            key={alvo}
            type="button"
            role="tab"
            aria-selected={modo === alvo}
            onClick={() => trocarModo(alvo)}
            className={cn(
              'h-10 rounded-md text-sm font-medium transition-colors',
              modo === alvo
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {alvo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        ))}
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!enviar.isPending) enviar.mutate()
        }}
      >
        {modo === 'criar' && (
          <Campo
            rotulo="Seu nome"
            autoComplete="given-name"
            value={nome}
            required
            maxLength={40}
            onChange={(e) => setNome(e.target.value)}
          />
        )}

        <Campo
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <Campo
          rotulo="Senha"
          type="password"
          autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
          value={senha}
          required
          minLength={8}
          onChange={(e) => setSenha(e.target.value)}
          erro={erro ?? undefined}
        />

        {modo === 'criar' && (
          <p className="text-sm text-muted-foreground">Mínimo de 8 caracteres.</p>
        )}

        <Botao type="submit" tamanho="lg" carregando={enviar.isPending} className="w-full">
          {modo === 'criar' ? 'Criar conta' : 'Entrar'}
        </Botao>
      </form>

      {modo === 'entrar' && (
        <button
          type="button"
          onClick={() => trocarModo('recuperar')}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Esqueci minha senha
        </button>
      )}
    </main>
  )
}
