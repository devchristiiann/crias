import { ArrowLeft, Check, Copy, Flame, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { FormularioHabito } from '@/components/habito/FormularioHabito'
import { Botao } from '@/components/ui/Botao'
import { Folha } from '@/components/ui/Folha'
import { useGrupo } from '@/hooks/useGrupos'
import { useGrupoRealtime } from '@/hooks/useGrupoRealtime'
import { iconeDoHabito } from '@/lib/icones'

export function GrupoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const { data: grupo, isPending, isError } = useGrupo(id)
  const [criando, setCriando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  useGrupoRealtime(id, (grupo?.desafios ?? []).map((d) => d.id))

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !grupo) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive">
        Não deu para carregar este grupo.
      </p>
    )
  }

  async function copiarCodigo() {
    if (!grupo) return
    try {
      await navigator.clipboard.writeText(grupo.codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissao de area de transferencia: o codigo ja esta visivel na tela.
      setCopiado(false)
    }
  }

  return (
    <section className="space-y-5">
      <Link
        to="/grupos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Grupos
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{grupo.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {grupo.membros.length} {grupo.membros.length === 1 ? 'membro' : 'membros'}
        </p>
      </header>

      <button
        type="button"
        onClick={copiarCodigo}
        className="flex w-full items-center justify-between rounded-xl border border-border
                   bg-card p-4 text-left shadow-sm"
      >
        <span>
          <span className="block text-xs text-muted-foreground">Código de convite</span>
          <span className="block font-mono text-xl font-semibold tracking-widest">
            {grupo.codigo}
          </span>
        </span>
        {copiado ? <Check className="size-5 text-success" /> : <Copy className="size-5" />}
      </button>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ranking por ofensiva
        </h2>
        <ul className="space-y-2">
          {grupo.membros.map((m, indice) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-foreground">
                {indice + 1}
              </span>
              <Avatar base={m.avatarBase} item={m.itemEquipado} tamanho={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {m.concluidosHoje} {m.concluidosHoje === 1 ? 'feito' : 'feitos'} hoje
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-warning">
                <Flame className="size-4" />
                {m.streakTotal}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Desafios
        </h2>
        {grupo.desafios.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Nenhum desafio ainda. Crie um e ele entra na lista de todo mundo.
          </p>
        )}
        <ul className="space-y-2">
          {grupo.desafios.map((d) => {
            const Icone = iconeDoHabito(d.icone)
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icone className="size-5" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{d.titulo}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{d.ouroBase} ouro</span>
              </li>
            )
          })}
        </ul>
        <Botao variante="secundario" className="w-full" onClick={() => setCriando(true)}>
          <Plus className="size-4" />
          Novo desafio do grupo
        </Botao>
      </div>

      {grupo.feed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Atividade
          </h2>
          <ul className="space-y-1.5">
            {grupo.feed.map((f) => {
              const membro = grupo.membros.find((m) => m.id === f.usuarioId)
              return (
                <li key={f.id} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-success" />
                  <span className="truncate">
                    {membro?.nome ?? 'Alguém'} concluiu {f.titulo}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <Folha aberta={criando} aoFechar={() => setCriando(false)} titulo="Desafio do grupo">
        <FormularioHabito
          grupoId={grupo.id}
          aoCriar={() => setCriando(false)}
          rotuloBotao="Criar desafio"
        />
      </Folha>
    </section>
  )
}
