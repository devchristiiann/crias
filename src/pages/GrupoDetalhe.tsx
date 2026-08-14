import { ArrowLeft, Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FeedGrupo } from '@/components/grupos/FeedGrupo'
import { FotoCapaGrupo } from '@/components/grupos/FotoCapaGrupo'
import { GerenciarGrupo } from '@/components/grupos/GerenciarGrupo'
import { PlacarEsqueleto, PlacarHoje, Ranking, RankingEsqueleto } from '@/components/grupos/Ranking'
import { FormularioHabito } from '@/components/habito/FormularioHabito'
import { CardOcorrencia } from '@/components/hoje/CardOcorrencia'
import { FolhaDesafio } from '@/components/hoje/FolhaDesafio'
import { Botao } from '@/components/ui/Botao'
import { Esqueleto } from '@/components/ui/Esqueleto'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { Folha } from '@/components/ui/Folha'
import { useGrupo, type ResumoGrupo } from '@/hooks/useGrupos'
import { useGrupoRealtime } from '@/hooks/useGrupoRealtime'
import { useOcorrenciasHoje } from '@/hooks/useOcorrenciasHoje'
import { useSessao } from '@/hooks/useSessao'
import { iconeDoHabito } from '@/lib/icones'

/**
 * Linhas cinzas no lugar da lista de desafios que ainda esta chegando.
 *
 * A quantidade nao e chutada: a lista de grupos ja trouxe quantos desafios este
 * grupo tem. Duas linhas fixas acertavam so quando o grupo tinha dois, e erravam
 * por 64px de cada linha a mais ou a menos.
 */
function DesafiosEsqueleto({ linhas }: { linhas: number }) {
  return (
    <ul aria-busy="true" className="space-y-2">
      {Array.from({ length: linhas }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
        >
          <Esqueleto className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Esqueleto className="h-4 w-32" />
            <Esqueleto className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function GrupoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const { data: grupo, isError, refetch } = useGrupo(id)
  const { data: ocorrencias } = useOcorrenciasHoje()
  const { usuarioId } = useSessao()
  const cliente = useQueryClient()
  const [criando, setCriando] = useState(false)
  const [selecionada, setSelecionada] = useState<string | null>(null)

  useGrupoRealtime(id, (grupo?.desafios ?? []).map((d) => d.id))

  // Nome e capa que a lista de grupos ja trouxe. Nao e adivinhacao: e a mesma
  // linha do banco, lida na tela anterior, e ela cobre o caminho normal, que e
  // entrar pela lista. Sem isso o topo da tela esperava a consulta do detalhe
  // inteiro, com ranking e desafios juntos, para escrever um nome que ja estava
  // na memoria do navegador.
  const daLista = cliente
    .getQueryData<ResumoGrupo[]>(['grupo', 'lista', usuarioId])
    ?.find((g) => g.id === id)

  const nome = grupo?.nome ?? daLista?.nome ?? null
  const membros = grupo?.membros.length ?? daLista?.membros ?? null
  // A capa da lista e a MESMA entrega do detalhe, entao a URL que veio de la ja
  // e a definitiva: a foto aparece na hora, do cache do navegador, e nao troca
  // de imagem quando o detalhe responde. Era exatamente a foto que demorava.
  const fotoUrl = grupo?.fotoUrl ?? daLista?.fotoUrl ?? null

  // Concluir dentro do grupo e o mesmo check-in da tela Hoje, e nao uma segunda
  // implementacao: a ocorrencia de hoje daquele desafio ja esta no cache.
  const minhaOcorrencia = useMemo(
    () => new Map((ocorrencias ?? []).map((o) => [o.habitId, o])),
    [ocorrencias],
  )
  const aberta = (ocorrencias ?? []).find((o) => o.id === selecionada) ?? null

  if (isError) {
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

      {/* Sem capa conhecida o bloco nao existe, e nao um retangulo cinza: metade
          dos grupos nao tem foto, e reservar espaco para ela faria a tela pular
          para cima justamente nesses.
          A capa da lista ja e a definitiva, entao no caminho normal ela nasce
          com a tela. Quem esperava o detalhe era o botao de ADICIONAR capa, que
          so aparecia quando `ehDono` resolvia e empurrava o cabecalho 64px para
          baixo: ele mudou de lugar e mora na folha de administrar, junto do
          resto da configuracao do grupo. O `Trocar foto` continua aqui, por cima
          da propria imagem, onde aparecer depois nao move nada. */}
      {id && fotoUrl && (
        <FotoCapaGrupo
          grupoId={id}
          nome={nome ?? ''}
          fotoUrl={fotoUrl}
          ehDono={Boolean(grupo) && grupo?.donoId === usuarioId}
        />
      )}

      {/* Sem margem negativa em lugar nenhum desta linha. O `-mr-2` que puxava
          a engrenagem para a borda estourava a caixa de quem a abrigava: o
          `header` media 336 contra 328 de largura util, e subir o recuo para o
          pai so mudava o estouro de elemento. Rolagem horizontal e bug
          bloqueante aqui, e 8px de alinhamento otico nao pagam por ela. */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Nome longo sem espaco tem que quebrar: o `overflow-x-hidden` do
              AppShell esconderia o estouro e a informacao sumiria calada. */}
          {nome === null ? (
            <Esqueleto className="h-8 w-48" />
          ) : (
            <h1 className="break-words text-2xl font-semibold tracking-tight">{nome}</h1>
          )}
          {membros === null ? (
            <Esqueleto className="mt-1 h-4 w-24" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {membros} {membros === 1 ? 'membro' : 'membros'}
            </p>
          )}
        </div>
        {/* A engrenagem guarda o proprio lugar. Aparecer depois empurraria a
            largura do titulo e reescreveria a quebra de um nome longo. */}
        {grupo ? (
          <GerenciarGrupo grupo={grupo} ehDono={grupo.donoId === usuarioId} />
        ) : (
          <span className="size-11 shrink-0" />
        )}
      </header>

      {grupo ? <PlacarHoje membros={grupo.membros} /> : <PlacarEsqueleto />}

      {grupo ? (
        <Ranking
          membros={grupo.membros}
          premios={grupo.premios}
          premiacaoAnterior={grupo.premiacaoAnterior}
          usuarioId={usuarioId}
        />
      ) : (
        <RankingEsqueleto />
      )}

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Desafios
        </h2>
        {!grupo && <DesafiosEsqueleto linhas={daLista?.desafios ?? 1} />}
        {/* A exigencia de foto vive na folha de administrar, junto do botao que
            liga e desliga ela. Repetida aqui, virava um bloco fixo ocupando a
            tela toda vez, e o proprio cartao do desafio ja mostra a camera. */}
        {grupo?.desafios.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Nenhum desafio ainda. Crie um e ele entra na lista de todo mundo.
          </p>
        )}
        <ul className="space-y-2">
          {(grupo?.desafios ?? []).map((d) => {
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

      {/* O feed so pode comecar depois do detalhe: e dele que saem os ids dos
          desafios e os membros que dao nome e avatar a cada linha. */}
      {grupo && <FeedGrupo grupo={grupo} />}

      <FolhaDesafio ocorrencia={aberta} aoFechar={() => setSelecionada(null)} />

      {id && (
        <Folha aberta={criando} aoFechar={() => setCriando(false)} titulo="Desafio do grupo">
          <FormularioHabito
            grupoId={id}
            aoCriar={() => setCriando(false)}
            rotuloBotao="Criar desafio"
          />
        </Folha>
      )}
    </section>
  )
}
