import { useMutation } from '@tanstack/react-query'
import { BellRing, Coins, Loader2, LogOut, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { BarraVida } from '@/components/perfil/BarraVida'
import { CalendarioOfensiva } from '@/components/perfil/CalendarioOfensiva'
import { Trilha } from '@/components/trilha/Trilha'
import { Botao } from '@/components/ui/Botao'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { useTheme } from '@/contexts/ThemeProvider'
import { usePerfil } from '@/hooks/usePerfil'
import { useTrilha } from '@/hooks/useTrilha'
import { assinarPush, permissaoAtual, type ResultadoPush } from '@/lib/push'
import { supabase } from '@/lib/supabase'

const TEXTO_PUSH: Record<ResultadoPush, string> = {
  ok: 'Notificações ligadas neste aparelho.',
  negado: 'Permissão recusada. Libere nas configurações do navegador.',
  sem_suporte: 'Este navegador não aceita notificação.',
  instalar_primeiro: 'No iPhone, instale o Crias na tela de início primeiro.',
}

export function Perfil() {
  const { tema, alternar } = useTheme()
  const { data: perfil, isPending, isError, refetch } = usePerfil()
  const { data: trilha } = useTrilha()
  const [resultadoPush, setResultadoPush] = useState<ResultadoPush | null>(null)
  const [erroPush, setErroPush] = useState<string | null>(null)

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

  // Sem este ramo a tela ficava em spinner para sempre quando a consulta falhava.
  if (isError || !perfil) {
    return <EstadoErro mensagem="Não deu para carregar seu perfil." aoTentarDeNovo={refetch} />
  }

  const dias = trilha?.diasProdutivos ?? []

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {dias.length} {dias.length === 1 ? 'dia produtivo' : 'dias produtivos'}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-warning/15 px-3 py-2 font-semibold text-warning">
          <Coins className="size-4" />
          {perfil.ouro}
        </span>
      </header>

      <Trilha
        diasProdutivos={dias}
        avatarBase={perfil.avatar_base}
        itemEquipado={perfil.item_equipado}
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <BarraVida vida={perfil.vida} />
      </div>

      <CalendarioOfensiva diasProdutivos={dias} />

      <div className="space-y-2">
        {permissaoAtual() !== 'granted' && (
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

        <Botao variante="secundario" className="w-full justify-between" onClick={alternar}>
          Tema {tema === 'dark' ? 'escuro' : 'claro'}
          {tema === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Botao>

        <Botao
          variante="fantasma"
          className="w-full justify-between"
          carregando={sair.isPending}
          onClick={() => {
            if (window.confirm('Sair da sua conta neste aparelho?')) sair.mutate()
          }}
        >
          Sair
          <LogOut className="size-4" />
        </Botao>
      </div>
    </section>
  )
}
