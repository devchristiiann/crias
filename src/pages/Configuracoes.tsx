import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, Check, KeyRound, Loader2, LogOut, Moon, Share, Sun } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { Confirmar } from '@/components/ui/Confirmar'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { useTheme } from '@/contexts/ThemeProvider'
import { usePerfil } from '@/hooks/usePerfil'
import { useSessao } from '@/hooks/useSessao'
import {
  assinarPush,
  ehIOS,
  estaInstalado,
  permissaoAtual,
  type ResultadoPush,
} from '@/lib/push'
import { supabase } from '@/lib/supabase'

const ERROS_SENHA: Record<string, string> = {
  senha_atual_errada: 'A senha atual está errada.',
  sem_email: 'Sua conta não tem e-mail para conferir a senha.',
}

const TEXTO_PUSH: Record<ResultadoPush, string> = {
  ok: 'Notificações ligadas neste aparelho.',
  negado: 'Permissão recusada. Libere nas configurações do navegador.',
  sem_suporte: 'Este navegador não aceita notificação.',
  instalar_primeiro: 'Instale o Crias na tela de início primeiro.',
}

export function Configuracoes() {
  const { sessao } = useSessao()
  const { data: perfil, isPending, isError, refetch } = usePerfil()
  const { tema, alternar } = useTheme()
  const cliente = useQueryClient()

  const [nome, setNome] = useState('')
  const [editandoNome, setEditandoNome] = useState(false)
  const [resultadoPush, setResultadoPush] = useState<ResultadoPush | null>(null)
  const [erroPush, setErroPush] = useState<string | null>(null)
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senha, setSenha] = useState('')
  const [senhaTrocada, setSenhaTrocada] = useState(false)

  const salvarNome = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ nome: nome.trim() })
        .eq('id', perfil!.id)
      if (error) throw error
    },
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      setEditandoNome(false)
    },
  })

  const ligarPush = useMutation({
    mutationFn: assinarPush,
    onSuccess: (r) => {
      setErroPush(null)
      setResultadoPush(r)
    },
    onError: () => setErroPush('Não deu para ativar as notificações neste aparelho.'),
  })

  // Pede a senha atual antes de trocar. Sem isso, quem pega o aparelho
  // destravado com o app aberto muda a senha e toma a conta em definitivo, e o
  // dono nao tem como recuperar sozinho enquanto o e-mail de recuperacao esta
  // desligado. O Supabase so exige sessao valida no `updateUser`.
  const trocarSenha = useMutation({
    mutationFn: async () => {
      const email = sessao?.user.email
      if (!email) throw new Error('sem_email')

      const { error: erroAtual } = await supabase.auth.signInWithPassword({
        email,
        password: senhaAtual,
      })
      if (erroAtual) throw new Error('senha_atual_errada')

      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
    },
    onSuccess: () => {
      setSenha('')
      setSenhaAtual('')
      setTrocandoSenha(false)
      setSenhaTrocada(true)
    },
  })

  const sair = useMutation({ mutationFn: () => supabase.auth.signOut() })

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !perfil) {
    return <EstadoErro mensagem="Não deu para carregar seus dados." aoTentarDeNovo={refetch} />
  }

  const permissao = permissaoAtual()
  const precisaInstalar = ehIOS() && !estaInstalado()

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
      </header>

      <Bloco titulo="Conta">
        <Linha rotulo="E-mail" valor={sessao?.user.email ?? ''} />

        {editandoNome ? (
          <div className="space-y-3 py-1">
            <Campo
              rotulo="Seu nome"
              value={nome}
              maxLength={40}
              onChange={(e) => setNome(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Botao
                disabled={nome.trim().length < 2}
                carregando={salvarNome.isPending}
                onClick={() => salvarNome.mutate()}
              >
                Salvar
              </Botao>
              <Botao variante="secundario" onClick={() => setEditandoNome(false)}>
                Cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNome(perfil.nome)
              setEditandoNome(true)
            }}
            className="flex min-h-11 w-full items-center justify-between gap-4 text-left text-sm"
          >
            <span className="text-muted-foreground">Nome</span>
            <span className="truncate font-medium">{perfil.nome}</span>
          </button>
        )}

        {/* Trocar a senha estando dentro do app. Enquanto a recuperacao por
            e-mail nao estiver ligada, este e o unico caminho que o proprio
            usuario tem para mudar a senha sem depender de ninguem. */}
        {trocandoSenha ? (
          <div className="space-y-3 py-1">
            <Campo
              rotulo="Senha atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
            />
            <Campo
              rotulo="Senha nova"
              type="password"
              autoComplete="new-password"
              value={senha}
              minLength={8}
              onChange={(e) => setSenha(e.target.value)}
              erro={
                trocarSenha.isError
                  ? (ERROS_SENHA[trocarSenha.error.message] ?? 'Não deu para trocar a senha agora.')
                  : undefined
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Botao
                disabled={senha.length < 8 || senhaAtual.length < 1}
                carregando={trocarSenha.isPending}
                onClick={() => trocarSenha.mutate()}
              >
                Salvar
              </Botao>
              <Botao
                variante="secundario"
                onClick={() => {
                  setTrocandoSenha(false)
                  setSenha('')
                  setSenhaAtual('')
                }}
              >
                Cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSenha('')
              trocarSenha.reset()
              setSenhaTrocada(false)
              setTrocandoSenha(true)
            }}
            className="flex min-h-11 w-full items-center justify-between gap-4 text-left text-sm"
          >
            <span className="text-muted-foreground">Senha</span>
            <span className="flex items-center gap-1 font-medium">
              {senhaTrocada ? 'Senha trocada' : 'Trocar'}
              <KeyRound className="size-4" />
            </span>
          </button>
        )}
      </Bloco>

      <Bloco titulo="Notificações">
        {permissao === 'granted' ? (
          <p className="flex min-h-11 items-center gap-2 text-sm text-success">
            <Check className="size-4" />
            Ligadas neste aparelho.
          </p>
        ) : precisaInstalar ? (
          <div className="space-y-2 py-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Share className="size-4" />
              Instale o Crias na tela de início
            </p>
            <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
              <li>Toque no botão de compartilhar do Safari.</li>
              <li>Escolha Adicionar à Tela de Início.</li>
              <li>Abra pelo ícone e volte aqui.</li>
            </ol>
            <p className="text-muted-foreground">
              O iPhone só entrega notificação para app instalado. É regra da Apple.
            </p>
          </div>
        ) : (
          <Botao
            variante="secundario"
            className="w-full justify-between"
            carregando={ligarPush.isPending}
            onClick={() => ligarPush.mutate()}
          >
            Ativar notificações
            <BellRing className="size-4" />
          </Botao>
        )}

        {/* Botao secundario em forma de link: o historico de toque fica a um
            passo do lugar onde a notificacao e ligada. */}
        <Link
          to="/notificacoes"
          className="inline-flex h-11 w-full select-none items-center justify-between gap-2
                     rounded-lg border border-border bg-card px-4 text-sm font-medium
                     text-foreground shadow-sm transition-colors hover:bg-accent
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver notificações
          <Bell className="size-4" />
        </Link>

        {resultadoPush && (
          <p className="text-sm text-muted-foreground">{TEXTO_PUSH[resultadoPush]}</p>
        )}
        {erroPush && <p className="text-sm text-destructive">{erroPush}</p>}
      </Bloco>

      <Bloco titulo="Aparência">
        <Botao
          variante="secundario"
          className="w-full justify-between"
          role="switch"
          aria-checked={tema === 'dark'}
          onClick={alternar}
        >
          Modo escuro
          {tema === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Botao>
      </Bloco>

      <Botao
        variante="perigo"
        className="w-full justify-between"
        carregando={sair.isPending}
        onClick={() => setConfirmandoSaida(true)}
      >
        Sair da conta
        <LogOut className="size-4" />
      </Botao>

      <Confirmar
        aberta={confirmandoSaida}
        aoFechar={() => setConfirmandoSaida(false)}
        titulo="Sair da conta?"
        detalhe="Vale só neste aparelho."
        rotuloConfirmar="Sair"
        perigo
        carregando={sair.isPending}
        aoConfirmar={() => sair.mutate()}
      />
    </section>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h2>
      <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        {children}
      </div>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="truncate font-medium">{valor}</span>
    </div>
  )
}
