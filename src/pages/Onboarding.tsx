import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellRing, Check, Loader2, Share } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { FormularioHabito } from '@/components/habito/FormularioHabito'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { usePerfil, type Perfil } from '@/hooks/usePerfil'
import { assinarPush, permissaoAtual, precisaInstalarAntes, type ResultadoPush } from '@/lib/push'
import { BASES } from '@/lib/sprites'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const TOTAL_PASSOS = 4

export function Onboarding() {
  const [passo, setPasso] = useState(0)
  const navegar = useNavigate()

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 py-8">
      <div className="flex gap-2" aria-label={`Passo ${passo + 1} de ${TOTAL_PASSOS}`}>
        {Array.from({ length: TOTAL_PASSOS }, (_, i) => (
          <span
            key={i}
            className={cn('h-1.5 flex-1 rounded-full', i <= passo ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </div>

      {passo === 0 && <PassoPersonagem aoAvancar={() => setPasso(1)} />}
      {passo === 1 && <PassoHabito aoAvancar={() => setPasso(2)} />}
      {passo === 2 && <PassoPush aoAvancar={() => setPasso(3)} />}
      {passo === 3 && <PassoGrupo aoConcluir={() => navegar('/hoje', { replace: true })} />}
    </main>
  )
}

function PassoPersonagem({ aoAvancar }: { aoAvancar: () => void }) {
  const { data: perfil } = usePerfil()

  if (!perfil) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // O formulario so nasce depois do perfil existir. Iniciar o estado com o
  // perfil ainda em voo deixava o campo do nome vazio, e o usuario digitava
  // o proprio nome duas vezes, uma no cadastro e outra aqui.
  return <FormularioPersonagem key={perfil.id} perfil={perfil} aoAvancar={aoAvancar} />
}

function FormularioPersonagem({
  perfil,
  aoAvancar,
}: {
  perfil: Perfil
  aoAvancar: () => void
}) {
  const cliente = useQueryClient()
  const [nome, setNome] = useState(perfil.nome)
  const [base, setBase] = useState(perfil.avatar_base)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ nome: nome.trim(), avatar_base: base })
        .eq('id', perfil.id)
      if (error) throw error
    },
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      aoAvancar()
    },
    onError: () => setErro('Não deu para salvar agora. Tente de novo.'),
  })

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Seu personagem</h1>
        <p className="text-sm text-muted-foreground">Ele acompanha sua ofensiva na trilha.</p>
      </header>

      <div className="flex justify-center">
        <Avatar base={base} tamanho={128} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Object.keys(BASES).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setBase(id)}
            aria-pressed={base === id}
            className={cn(
              'flex items-center justify-center rounded-lg border-2 bg-card py-3',
              base === id ? 'border-primary' : 'border-border',
            )}
          >
            <Avatar base={id} tamanho={48} />
          </button>
        ))}
      </div>

      <Campo
        rotulo="Como te chamamos"
        value={nome}
        maxLength={40}
        onChange={(e) => setNome(e.target.value)}
      />

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Botao
        tamanho="lg"
        className="w-full"
        disabled={nome.trim().length < 2}
        carregando={salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        Continuar
      </Botao>
    </section>
  )
}

function PassoHabito({ aoAvancar }: { aoAvancar: () => void }) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Seu primeiro hábito</h1>
        <p className="text-sm text-muted-foreground">Comece com um. Dá para adicionar mais depois.</p>
      </header>
      <FormularioHabito aoCriar={aoAvancar} rotuloBotao="Criar e continuar" />
    </section>
  )
}

const TEXTO_PUSH: Record<ResultadoPush, string> = {
  ok: 'Notificações ligadas.',
  negado: 'Você recusou. Dá para ligar depois nas configurações do navegador.',
  sem_suporte: 'Este navegador não aceita notificação. Tente pelo Chrome ou Safari.',
  instalar_primeiro: 'No iPhone é preciso instalar o app antes.',
}

function PassoPush({ aoAvancar }: { aoAvancar: () => void }) {
  const [resultado, setResultado] = useState<ResultadoPush | null>(null)
  const precisaInstalar = precisaInstalarAntes()

  const pedir = useMutation({
    mutationFn: assinarPush,
    onSuccess: (r) => {
      setResultado(r)
      if (r === 'ok') setTimeout(aoAvancar, 600)
    },
  })

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
        <p className="text-sm text-muted-foreground">
          É o que faz você lembrar. Sem elas, o app vira uma lista esquecida.
        </p>
      </header>

      <div className="flex justify-center py-4">
        <BellRing className="size-20 text-primary" strokeWidth={1.2} />
      </div>

      {precisaInstalar ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Share className="size-4" />
            Instale o Crias na tela de início
          </p>
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>Toque no botão de compartilhar do Safari.</li>
            <li>Escolha Adicionar à Tela de Início.</li>
            <li>Abra o Crias pelo ícone e volte aqui.</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            O iPhone só entrega notificação para app instalado. É regra da Apple, não do Crias.
          </p>
        </div>
      ) : (
        <Botao
          tamanho="lg"
          className="w-full"
          carregando={pedir.isPending}
          onClick={() => pedir.mutate()}
        >
          {permissaoAtual() === 'granted' ? 'Reativar notificações' : 'Ativar notificações'}
        </Botao>
      )}

      {resultado && (
        <p
          className={cn(
            'flex items-center gap-2 text-sm',
            resultado === 'ok' ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {resultado === 'ok' && <Check className="size-4" />}
          {TEXTO_PUSH[resultado]}
        </p>
      )}

      <Botao variante="fantasma" className="w-full" onClick={aoAvancar}>
        {resultado === 'ok' ? 'Continuar' : 'Deixar para depois'}
      </Botao>
    </section>
  )
}

function PassoGrupo({ aoConcluir }: { aoConcluir: () => void }) {
  const cliente = useQueryClient()
  const [nomeGrupo, setNomeGrupo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  // A RotaProtegida decide o redirect lendo `tem-habito` do cache, e esse cache
  // foi preenchido com `false` antes do onboarding criar o habito. Navegar sem
  // esperar o refetch devolve o usuario para o passo 1 do proprio onboarding.
  async function finalizar() {
    await cliente.invalidateQueries()
    aoConcluir()
  }

  const criar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('criar_grupo', { p_nome: nomeGrupo })
      if (error) throw error
      if (data?.error) throw new Error('Não deu para criar o grupo agora.')
    },
    onSuccess: finalizar,
    onError: (e: Error) => setErro(e.message),
  })

  const entrar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('entrar_grupo', { p_codigo: codigo })
      if (error) throw error
      if (data?.error === 'codigo_invalido') throw new Error('Código não encontrado.')
      if (data?.error) throw new Error('Não deu para entrar agora.')
    },
    onSuccess: finalizar,
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Chame alguém</h1>
        <p className="text-sm text-muted-foreground">Hábito em grupo dura mais que hábito sozinho.</p>
      </header>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <Campo
          rotulo="Criar um grupo"
          placeholder="Corrida da manhã"
          value={nomeGrupo}
          maxLength={40}
          onChange={(e) => setNomeGrupo(e.target.value)}
        />
        <Botao
          className="w-full"
          disabled={nomeGrupo.trim().length < 2}
          carregando={criar.isPending}
          onClick={() => criar.mutate()}
        >
          Criar grupo
        </Botao>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <Campo
          rotulo="Entrar com código"
          placeholder="AB3D9K"
          value={codigo}
          maxLength={6}
          autoCapitalize="characters"
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        />
        <Botao
          variante="secundario"
          className="w-full"
          disabled={codigo.trim().length !== 6}
          carregando={entrar.isPending}
          onClick={() => entrar.mutate()}
        >
          Entrar no grupo
        </Botao>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Botao variante="fantasma" className="w-full" onClick={finalizar}>
        Pular por enquanto
      </Botao>
    </section>
  )
}
