import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, MoreVertical, Share, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { FormularioHabito } from '@/components/habito/FormularioHabito'
import { TourGuiado } from '@/components/tour/TourGuiado'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { usePerfil, type Perfil } from '@/hooks/usePerfil'
import { pecasDoSlot } from '@/lib/catalogo'
import { estaInstalado } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** Primeira escolha e de graca, entao a grade mostra so o degrau inicial do
 *  catalogo. O resto do elenco fica na loja, comprado com ouro. */
const INICIAIS = pecasDoSlot('personagem').filter((p) => p.custo <= 200)

export function Onboarding() {
  const [passo, setPasso] = useState(0)
  const navegar = useNavigate()

  // Quem ja abriu pela tela de inicio nao precisa de instrucao de instalacao.
  // Lido uma vez so: o total de passos nao pode mudar no meio do fluxo.
  const [ensinarInstalacao] = useState(() => !estaInstalado())
  const total = ensinarInstalacao ? 5 : 4

  function irParaOApp() {
    navegar('/hoje', { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 py-8">
      <div className="flex gap-2" aria-label={`Passo ${passo + 1} de ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn('h-1.5 flex-1 rounded-full', i <= passo ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </div>

      {passo === 0 && <PassoPersonagem aoAvancar={() => setPasso(1)} />}
      {passo === 1 && <PassoHabito aoAvancar={() => setPasso(2)} />}
      {passo === 2 && <PassoGrupo aoAvancar={() => setPasso(3)} />}
      {passo === 3 && (
        <TourGuiado aoConcluir={() => (ensinarInstalacao ? setPasso(4) : irParaOApp())} />
      )}
      {passo === 4 && <PassoInstalar aoConcluir={irParaOApp} />}
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
      // avatar_base nao e mais escrita direta do cliente: a coluna perdeu o
      // privilegio de update para que a troca sempre passe pela RPC, que cobra
      // ouro. Esta aqui e a primeira escolha, e a RPC nao cobra por ela.
      const { data, error } = await supabase.rpc('trocar_personagem', { p_base: base })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const { error: erroNome } = await supabase
        .from('profiles')
        .update({ nome: nome.trim() })
        .eq('id', perfil.id)
      if (erroNome) throw erroNome
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
        {INICIAIS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setBase(p.id)}
            aria-label={p.nome}
            aria-pressed={base === p.id}
            className={cn(
              'flex items-center justify-center rounded-lg border-2 bg-card py-3',
              base === p.id ? 'border-primary' : 'border-border',
            )}
          >
            <Avatar base={p.id} tamanho={48} />
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

/**
 * Ultimo passo: ensinar a instalar. A permissao de notificacao nao e pedida
 * aqui de proposito. Ela vive na pagina de Configuracoes, e no iPhone so
 * funciona depois do app instalado na tela de inicio.
 */
function PassoInstalar({ aoConcluir }: { aoConcluir: () => void }) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Instale o Crias</h1>
        <p className="text-sm text-muted-foreground">
          Na tela de início ele abre como app, em janela própria, e consegue avisar você na hora
          do hábito.
        </p>
      </header>

      <div className="flex justify-center py-2">
        <Smartphone className="size-20 text-primary" strokeWidth={1.2} />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Share className="size-4" />
          No iPhone
        </p>
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Toque no botão de compartilhar do Safari.</li>
          <li>Escolha Adicionar à Tela de Início.</li>
        </ol>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MoreVertical className="size-4" />
          No Android
        </p>
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Abra o menu do navegador.</li>
          <li>Escolha Instalar aplicativo.</li>
        </ol>
      </div>

      <p className="text-sm text-muted-foreground">
        As notificações você liga depois, na aba Ajustes, dentro de Configurações.
      </p>

      <Botao tamanho="lg" className="w-full" onClick={aoConcluir}>
        Entrar no app
      </Botao>
    </section>
  )
}

function PassoGrupo({ aoAvancar }: { aoAvancar: () => void }) {
  const cliente = useQueryClient()
  const [nomeGrupo, setNomeGrupo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  // O onboarding inteiro criou perfil, habito e agora grupo. O cache foi
  // preenchido antes de tudo isso existir, entao o app abriria com listas
  // vazias. Invalidar tudo aqui e mais barato que rastrear chave por chave.
  async function finalizar() {
    await cliente.invalidateQueries()
    aoAvancar()
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
