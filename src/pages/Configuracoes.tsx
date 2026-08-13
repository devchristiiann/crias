import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellRing, Check, Loader2, LogOut, Moon, Share, Sun } from 'lucide-react'
import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
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
        onClick={() => {
          if (window.confirm('Sair da sua conta neste aparelho?')) sair.mutate()
        }}
      >
        Sair da conta
        <LogOut className="size-4" />
      </Botao>
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
