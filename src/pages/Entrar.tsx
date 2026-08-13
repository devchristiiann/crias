import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { supabase } from '@/lib/supabase'

type Modo = 'entrar' | 'criar'

const MENSAGENS: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Esse e-mail já tem conta. Entre em vez de criar.',
  'Password should be at least 8 characters.': 'A senha precisa de pelo menos 8 caracteres.',
  'Email rate limit exceeded': 'Muitas tentativas. Espere um minuto.',
}

export function Entrar() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const enviar = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (modo === 'criar') {
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome: nome.trim() } },
        })
        if (error) throw error
        return
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) throw error
    },
    onError: (e: Error) => setErro(MENSAGENS[e.message] ?? e.message),
  })

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-8 px-5 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <Avatar tamanho={96} />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Crias</h1>
          <p className="text-sm text-muted-foreground">Hábitos em grupo, com ofensiva e ouro.</p>
        </div>
      </header>

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

        <Botao type="submit" tamanho="lg" carregando={enviar.isPending} className="w-full">
          {modo === 'criar' ? 'Criar conta' : 'Entrar'}
        </Botao>
      </form>

      <Botao
        variante="fantasma"
        onClick={() => {
          setModo(modo === 'entrar' ? 'criar' : 'entrar')
          setErro(null)
        }}
      >
        {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
      </Botao>
    </main>
  )
}
