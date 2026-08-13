import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, CameraOff, ChevronRight, Loader2, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { CodigoConvite } from '@/components/grupos/CodigoConvite'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { Folha } from '@/components/ui/Folha'
import { useGrupos } from '@/hooks/useGrupos'
import { supabase } from '@/lib/supabase'

export function Grupos() {
  const { data: grupos, isPending, isError, refetch } = useGrupos()
  const [acao, setAcao] = useState<'criar' | 'entrar' | null>(null)
  const [parametros] = useSearchParams()

  const lista = grupos ?? []
  // Quem so tem um grupo cai direto nele: a lista de um item era um toque a
  // mais em todo acesso. O `?todos=1` do botao Voltar desliga o atalho, senao
  // nao haveria como chegar em Criar. Nenhuma folha aberta na hora: a folha de
  // criar mostra o codigo do grupo novo e o salto apagaria ele da tela.
  if (!isPending && !isError && lista.length === 1 && acao === null && !parametros.has('todos')) {
    return <Navigate to={`/grupos/${lista[0].id}`} replace />
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Grupos</h1>
        <p className="text-sm text-muted-foreground">Desafios que todo mundo faz junto.</p>
      </header>

      {isPending && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <EstadoErro mensagem="Não deu para carregar seus grupos." aoTentarDeNovo={refetch} />
      )}

      {!isPending && !isError && lista.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Você ainda não participa de nenhum grupo. Crie um e mande o código para quem você quer
          junto.
        </p>
      )}

      <ul className="space-y-2">
        {lista.map((g) => (
          <li key={g.id}>
            <Link
              to={`/grupos/${g.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3
                         shadow-sm transition-colors hover:bg-accent"
            >
              {/* Sem capa o card mantem o mesmo quadrado do icone, entao a lista
                  nao muda de altura de uma linha para a outra. */}
              {g.fotoUrl ? (
                <img
                  src={g.fotoUrl}
                  alt=""
                  className="size-11 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{g.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {g.membros} {g.membros === 1 ? 'membro' : 'membros'}, {g.desafios}{' '}
                  {g.desafios === 1 ? 'desafio' : 'desafios'}
                </span>
                {/* A posicao sai do que a propria consulta ja traz, sem ida extra. */}
                {g.posicao !== null && (
                  <span className="block text-xs font-semibold text-primary">
                    Você está em {g.posicao}º
                  </span>
                )}
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3">
        <Botao onClick={() => setAcao('criar')}>
          <Plus className="size-4" />
          Criar
        </Botao>
        <Botao variante="secundario" onClick={() => setAcao('entrar')}>
          Entrar por código
        </Botao>
      </div>

      <FolhaCriar aberta={acao === 'criar'} aoFechar={() => setAcao(null)} />
      <FolhaEntrar aberta={acao === 'entrar'} aoFechar={() => setAcao(null)} />
    </section>
  )
}

/** O que `criar_grupo` devolve quando dá certo. O código nasce no servidor. */
interface GrupoCriado {
  id: string
  codigo: string
}

function FolhaCriar({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const [nome, setNome] = useState('')
  const [exigeFoto, setExigeFoto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [criado, setCriado] = useState<GrupoCriado | null>(null)

  const criar = useMutation({
    mutationFn: async (): Promise<GrupoCriado> => {
      const { data, error } = await supabase.rpc('criar_grupo', {
        p_nome: nome,
        p_exige_foto: exigeFoto,
      })
      if (error) throw error
      if (data?.error || !data?.id || !data?.codigo) {
        throw new Error('Não deu para criar o grupo agora.')
      }
      return { id: data.id, codigo: data.codigo }
    },
    // A folha continua aberta mostrando o codigo: e o unico momento em que a
    // pessoa vai mandar o convite, e fechar sozinho esconderia ele antes disso.
    onSuccess: (grupo) => {
      setNome('')
      setExigeFoto(false)
      setErro(null)
      setCriado(grupo)
      cliente.invalidateQueries({ queryKey: ['grupo'] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  // Fechar depois de um erro e reabrir mostrava a mensagem velha em cima de um
  // formulario limpo. A folha some do DOM logico, mas o estado fica aqui.
  function fechar() {
    setNome('')
    setExigeFoto(false)
    setErro(null)
    setCriado(null)
    aoFechar()
  }

  if (criado) {
    return (
      <Folha aberta={aberta} aoFechar={fechar} titulo="Grupo criado">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Mande este código para quem você quer junto.
          </p>
          <CodigoConvite codigo={criado.codigo} />
          <Botao
            tamanho="lg"
            className="w-full"
            onClick={() => {
              const destino = `/grupos/${criado.id}`
              fechar()
              navegar(destino)
            }}
          >
            Abrir grupo
          </Botao>
        </div>
      </Folha>
    )
  }

  return (
    <Folha aberta={aberta} aoFechar={fechar} titulo="Criar grupo">
      <div className="space-y-4">
        <Campo
          rotulo="Nome do grupo"
          placeholder="Corrida da manhã"
          value={nome}
          maxLength={40}
          onChange={(e) => setNome(e.target.value)}
        />

        <div className="space-y-1.5">
          <Botao
            variante="secundario"
            className="w-full justify-between"
            role="switch"
            aria-checked={exigeFoto}
            onClick={() => setExigeFoto((v) => !v)}
          >
            Exigir foto no check-in
            {exigeFoto ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
          </Botao>
          <p className="text-xs text-muted-foreground">Vale para todo desafio do grupo.</p>
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <Botao
          tamanho="lg"
          className="w-full"
          disabled={nome.trim().length < 2}
          carregando={criar.isPending}
          onClick={() => criar.mutate()}
        >
          Criar
        </Botao>
      </div>
    </Folha>
  )
}

function FolhaEntrar({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const cliente = useQueryClient()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const entrar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('entrar_grupo', { p_codigo: codigo })
      if (error) throw error
      if (data?.error === 'codigo_invalido') throw new Error('Código não encontrado.')
      if (data?.error) throw new Error('Não deu para entrar agora.')
    },
    onSuccess: () => {
      setCodigo('')
      setErro(null)
      cliente.invalidateQueries({ queryKey: ['grupo'] })
      cliente.invalidateQueries({ queryKey: ['ocorrencias'] })
      aoFechar()
    },
    onError: (e: Error) => setErro(e.message),
  })

  // Mesmo motivo da folha de criar: o erro de codigo invalido sobrevivia ao
  // fechamento e reaparecia sobre o campo vazio.
  function fechar() {
    setCodigo('')
    setErro(null)
    aoFechar()
  }

  return (
    <Folha aberta={aberta} aoFechar={fechar} titulo="Entrar por código">
      <div className="space-y-4">
        <Campo
          rotulo="Código do grupo"
          placeholder="AB3D9K"
          value={codigo}
          maxLength={6}
          autoCapitalize="characters"
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        />
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <Botao
          tamanho="lg"
          className="w-full"
          disabled={codigo.trim().length !== 6}
          carregando={entrar.isPending}
          onClick={() => entrar.mutate()}
        >
          Entrar
        </Botao>
      </div>
    </Folha>
  )
}
