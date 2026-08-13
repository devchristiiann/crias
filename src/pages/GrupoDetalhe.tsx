import { ArrowLeft, Camera, Loader2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FeedGrupo } from '@/components/grupos/FeedGrupo'
import { FotoCapaGrupo } from '@/components/grupos/FotoCapaGrupo'
import { GerenciarGrupo } from '@/components/grupos/GerenciarGrupo'
import { PlacarHoje, Ranking } from '@/components/grupos/Ranking'
import { FormularioHabito } from '@/components/habito/FormularioHabito'
import { CardOcorrencia } from '@/components/hoje/CardOcorrencia'
import { FolhaDesafio } from '@/components/hoje/FolhaDesafio'
import { Botao } from '@/components/ui/Botao'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { Folha } from '@/components/ui/Folha'
import { useGrupo } from '@/hooks/useGrupos'
import { useGrupoRealtime } from '@/hooks/useGrupoRealtime'
import { useOcorrenciasHoje } from '@/hooks/useOcorrenciasHoje'
import { useSessao } from '@/hooks/useSessao'
import { iconeDoHabito } from '@/lib/icones'

export function GrupoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const { data: grupo, isPending, isError, refetch } = useGrupo(id)
  const { data: ocorrencias } = useOcorrenciasHoje()
  const { usuarioId } = useSessao()
  const [criando, setCriando] = useState(false)
  const [selecionada, setSelecionada] = useState<string | null>(null)

  useGrupoRealtime(id, (grupo?.desafios ?? []).map((d) => d.id))

  // Concluir dentro do grupo e o mesmo check-in da tela Hoje, e nao uma segunda
  // implementacao: a ocorrencia de hoje daquele desafio ja esta no cache.
  const minhaOcorrencia = useMemo(
    () => new Map((ocorrencias ?? []).map((o) => [o.habitId, o])),
    [ocorrencias],
  )
  const aberta = (ocorrencias ?? []).find((o) => o.id === selecionada) ?? null

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !grupo) {
    return <EstadoErro mensagem="Não deu para carregar este grupo." aoTentarDeNovo={refetch} />
  }

  return (
    <section className="space-y-5">
      {/* O `todos` desliga a abertura automatica do grupo unico: sem ele, voltar
          para a lista cairia direto de volta aqui dentro. */}
      <Link
        to="/grupos?todos=1"
        className="-my-2 inline-flex min-h-11 items-center gap-1 py-2 text-sm
                   text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Grupos
      </Link>

      <FotoCapaGrupo
        grupoId={grupo.id}
        nome={grupo.nome}
        fotoUrl={grupo.fotoUrl}
        ehDono={grupo.donoId === usuarioId}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Nome longo sem espaco tem que quebrar: o `overflow-x-hidden` do
              AppShell esconderia o estouro e a informacao sumiria calada. */}
          <h1 className="break-words text-2xl font-semibold tracking-tight">{grupo.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {grupo.membros.length} {grupo.membros.length === 1 ? 'membro' : 'membros'}
          </p>
        </div>
        <GerenciarGrupo grupo={grupo} ehDono={grupo.donoId === usuarioId} />
      </header>

      <PlacarHoje membros={grupo.membros} />

      <Ranking membros={grupo.membros} usuarioId={usuarioId} />

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Desafios
        </h2>
        {/* Quem barra o check-in sem foto e o servidor. O aviso so evita que a
            pessoa descubra isso na hora de marcar. */}
        {grupo.exigeFoto && (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
            <Camera className="size-4 shrink-0" />
            Os check-ins deste grupo exigem foto.
          </p>
        )}
        {grupo.desafios.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Nenhum desafio ainda. Crie um e ele entra na lista de todo mundo.
          </p>
        )}
        <ul className="space-y-2">
          {grupo.desafios.map((d) => {
            const ocorrencia = minhaOcorrencia.get(d.id)
            // Desafio com ocorrencia hoje vira o mesmo cartao da tela Hoje, e
            // marcar aqui usa exatamente o mesmo caminho. Sem ocorrencia hoje a
            // linha continua so informativa: nao existe o que marcar.
            if (ocorrencia) {
              return (
                <li key={d.id}>
                  <CardOcorrencia ocorrencia={ocorrencia} aoAbrir={() => setSelecionada(ocorrencia.id)} />
                </li>
              )
            }

            const Icone = iconeDoHabito(d.icone)
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icone className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.titulo}</span>
                  <span className="block text-xs text-muted-foreground">Sem check-in hoje</span>
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">{d.ouroBase} ouro</span>
                {/* Excluir desafio vive na folha de administrar, atras da
                    engrenagem. Aqui a lixeira convidava ao toque acidental. */}
              </li>
            )
          })}
        </ul>
        <Botao variante="secundario" className="w-full" onClick={() => setCriando(true)}>
          <Plus className="size-4" />
          Novo desafio do grupo
        </Botao>
      </div>

      <FeedGrupo grupo={grupo} />

      <FolhaDesafio ocorrencia={aberta} aoFechar={() => setSelecionada(null)} />

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
