import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Loader2, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { Folha } from '@/components/ui/Folha'
import { useGrupos } from '@/hooks/useGrupos'
import { supabase } from '@/lib/supabase'

export function Grupos() {
  const { data: grupos, isPending } = useGrupos()
  const [acao, setAcao] = useState<'criar' | 'entrar' | null>(null)

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

      {!isPending && (grupos ?? []).length === 0 && (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Você ainda não participa de nenhum grupo. Crie um e mande o código para quem você quer
          junto.
        </p>
      )}

      <ul className="space-y-2">
        {(grupos ?? []).map((g) => (
          <li key={g.id}>
            <Link
              to={`/grupos/${g.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3
                         shadow-sm transition-colors hover:bg-accent"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{g.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {g.membros} {g.membros === 1 ? 'membro' : 'membros'}, {g.desafios}{' '}
                  {g.desafios === 1 ? 'desafio' : 'desafios'}
                </span>
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

function FolhaCriar({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const cliente = useQueryClient()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const criar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('criar_grupo', { p_nome: nome })
      if (error) throw error
      if (data?.error) throw new Error('Não deu para criar o grupo agora.')
    },
    onSuccess: () => {
      setNome('')
      setErro(null)
      cliente.invalidateQueries({ queryKey: ['grupo'] })
      aoFechar()
    },
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Criar grupo">
      <div className="space-y-4">
        <Campo
          rotulo="Nome do grupo"
          placeholder="Corrida da manhã"
          value={nome}
          maxLength={40}
          onChange={(e) => setNome(e.target.value)}
        />
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
      cliente.invalidateQueries()
      aoFechar()
    },
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Entrar por código">
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
