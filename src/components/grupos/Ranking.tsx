import { Coins, Flame } from 'lucide-react'
import { useMemo } from 'react'
import { Avatar } from '@/components/Avatar'
import { Esqueleto } from '@/components/ui/Esqueleto'
import type { MembroGrupo, PremioSemana } from '@/hooks/useGrupos'
import { cn } from '@/lib/utils'

/**
 * Quantos membros ja fecharam algum desafio hoje.
 *
 * E o numero que gera pressao social, entao vem antes do ranking na tela: o
 * ranking e o placar da temporada, este e o placar da partida de hoje.
 */
export function PlacarHoje({ membros }: { membros: MembroGrupo[] }) {
  const concluiram = membros.filter((m) => m.concluidosHoje > 0).length
  const total = membros.length
  // Grupo sem membro nao acontece na pratica, mas divisao por zero na barra sim.
  const porcento = total === 0 ? 0 : Math.round((concluiram / total) * 100)

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Placar de hoje
        </h2>
        <p className="shrink-0 text-sm font-semibold">
          <span className="text-success">{concluiram}</span>
          <span className="text-muted-foreground"> de {total}</span>
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuenow={concluiram}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Membros que concluíram hoje"
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500"
          style={{ width: `${porcento}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Membros que já concluíram algum desafio hoje.
      </p>
    </div>
  )
}

// Segundo lugar a esquerda, primeiro ao centro, terceiro a direita.
const ORDEM_PODIO = [1, 0, 2]

/**
 * O placar enquanto os numeros nao chegaram.
 *
 * Mora ao lado do componente de verdade porque a unica exigencia dele e ter a
 * mesma altura: separados em arquivos diferentes, o primeiro ajuste de espaco
 * no placar deixaria a tela pulando de novo sem ninguem perceber.
 */
export function PlacarEsqueleto() {
  return (
    <div aria-busy="true" className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <Esqueleto className="h-5 w-28" />
        <Esqueleto className="h-5 w-16" />
      </div>
      {/* Barra cinza parada e identica a barra real em 0%, e "0 de N" e uma
          afirmacao que pode estar errada. Esqueleto pulsa e nao afirma nada. */}
      <Esqueleto className="mt-3 h-2 w-full rounded-full" />
      <Esqueleto className="mt-2 h-4 w-52" />
    </div>
  )
}

/**
 * O ranking enquanto os membros nao chegaram.
 *
 * O texto do cabecalho e o de verdade: ele nao depende de dado nenhum, e
 * esconder copy fixa atras de um bloco cinza so faria a tela mudar duas vezes.
 * O que e cinza aqui e so o que ainda nao se sabe. As posicoes de quarto lugar
 * para baixo ficam de fora: quantas linhas existem tambem e dado.
 */
export function RankingEsqueleto() {
  return (
    <section aria-busy="true" className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ranking da semana
        </h2>
        <p className="text-xs text-muted-foreground">
          Ouro ganho nos desafios do grupo nesta semana. Empate vai para a ofensiva.
        </p>
      </div>

      <ul className="flex items-end justify-center gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        {ORDEM_PODIO.map((i) => {
          const primeiro = i === 0
          return (
            <li key={i} className="flex min-w-0 shrink basis-0 grow flex-col items-center gap-1">
              <Esqueleto className={cn('rounded-full', primeiro ? 'size-[72px]' : 'size-[52px]')} />
              <Esqueleto className="h-5 w-16" />
              <Esqueleto className={primeiro ? 'h-5 w-10' : 'h-4 w-10'} />
              <Esqueleto className="h-4 w-8" />
              <span
                className={cn(
                  'mt-1 w-full rounded-t-lg bg-muted',
                  primeiro ? 'h-14' : 'h-9',
                )}
              />
            </li>
          )
        })}
      </ul>

      {/* A propria linha existe sempre: quem abre o grupo e membro dele. */}
      <div className="flex min-h-[3.25rem] items-center gap-3 rounded-xl border-2 border-primary bg-card p-3 shadow-sm">
        <Esqueleto className="h-5 w-7 shrink-0" />
        <Esqueleto className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1">
          <Esqueleto className="h-5 w-32" />
          <Esqueleto className="h-4 w-24" />
        </div>
        <Esqueleto className="h-5 w-12 shrink-0" />
      </div>
    </section>
  )
}

export function Ranking({
  membros,
  premios,
  premiacaoAnterior,
  usuarioId,
}: {
  membros: MembroGrupo[]
  premios: number[]
  premiacaoAnterior: PremioSemana[]
  usuarioId: string | null
}) {
  const podio = ORDEM_PODIO.filter((i) => i < membros.length).map((i) => ({
    membro: membros[i],
    posicao: i + 1,
  }))
  const restante = membros.slice(3)
  const indiceProprio = membros.findIndex((m) => m.id === usuarioId)
  const eu = indiceProprio >= 0 ? membros[indiceProprio] : null

  // O cracha so aparece onde o servidor realmente vai pagar, e as duas condicoes
  // sao as mesmas de `premiar_semana`: a pessoa precisa ter ganho ouro na semana,
  // e o grupo precisa de pelo menos duas pessoas com ouro, senao um grupo parado
  // imprimiria ouro toda segunda. Sem esta conta a tela prometia 500 ao primeiro
  // numa semana em que so uma pessoa fez check-in, e o pagamento nao vinha.
  const comOuro = membros.filter((m) => m.ouroSemana > 0).length
  const premiaDeVerdade = comOuro >= 2

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ranking da semana
        </h2>
        {/* Numero sem criterio parece arbitrario. O criterio fica na tela. */}
        <p className="text-xs text-muted-foreground">
          Ouro ganho nos desafios do grupo nesta semana. Empate vai para a ofensiva.
        </p>
      </div>

      {membros.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Ninguém no grupo ainda. Mande o código de convite.
        </p>
      ) : (
        <ul className="flex items-end justify-center gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
          {podio.map(({ membro, posicao }) => (
            <ItemPodio
              key={membro.id}
              membro={membro}
              posicao={posicao}
              premio={premiaDeVerdade && membro.ouroSemana > 0 ? (premios[posicao - 1] ?? 0) : 0}
              souEu={membro.id === usuarioId}
            />
          ))}
        </ul>
      )}

      {/* A propria posicao nunca fica escondida no fim da lista, nem em decimo. */}
      {eu && (
        <div className="rounded-xl border-2 border-primary bg-card shadow-sm">
          <LinhaRanking membro={eu} posicao={indiceProprio + 1} souEu />
        </div>
      )}

      {restante.length > 0 && (
        <ul className="space-y-2">
          {restante.map((m, i) => (
            <li key={m.id} className="rounded-xl border border-border bg-card shadow-sm">
              <LinhaRanking membro={m} posicao={i + 4} souEu={m.id === usuarioId} />
            </li>
          ))}
        </ul>
      )}

      <PremioDaSemana
        premios={premios}
        premiacaoAnterior={premiacaoAnterior}
        usuarioId={usuarioId}
      />

      <RankingGeral membros={membros} usuarioId={usuarioId} />
    </section>
  )
}

/**
 * A competição do grupo: quem levou o prêmio na última segunda.
 *
 * Fica no fim da seção, abaixo de tudo que o esqueleto desenha, e nunca acima do
 * pódio. Ele nasce da consulta e só existe em grupo que cadastrou prêmio: no
 * topo, apareceria junto com a resposta e empurraria o pódio para baixo com a
 * pessoa já lendo, que é o mesmo defeito que tirou o botão de capa do cabeçalho.
 */
function PremioDaSemana({
  premios,
  premiacaoAnterior,
  usuarioId,
}: {
  premios: number[]
  premiacaoAnterior: PremioSemana[]
  usuarioId: string | null
}) {
  const houvePagamento = premiacaoAnterior.length > 0

  // Grupo sem prêmio cadastrado e sem histórico não tem competição nenhuma, e um
  // bloco explicando um jogo que não existe é ruído na tela de quem só quer ver
  // o ranking.
  if (!houvePagamento && premios.every((p) => p === 0)) return null

  return (
    <div className="space-y-2 pt-1">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {houvePagamento ? 'Semana passada' : 'Prêmio da semana'}
        </h3>
        <p className="text-xs text-muted-foreground">
          Toda segunda o servidor paga o pódio da semana.
        </p>
      </div>
      {houvePagamento && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {premiacaoAnterior.map((premio) => (
            <li
              key={premio.posicao}
              className={cn(
                'flex min-h-11 items-center gap-3 px-3 py-2 text-sm',
                premio.usuarioId === usuarioId && 'bg-primary/5',
              )}
            >
              <span
                className={cn(
                  'w-6 shrink-0 text-center text-xs font-semibold',
                  premio.usuarioId === usuarioId ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {premio.posicao}º
              </span>
              {/* Quem saiu do grupo depois de receber deixa de ter nome legível
                  aqui. O prêmio aconteceu e continua na lista: inventar um nome
                  seria pior que dizer o que de fato se sabe. */}
              <span className="min-w-0 flex-1 truncate">
                {premio.usuarioId === usuarioId ? 'Você' : (premio.nome ?? 'Saiu do grupo')}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-semibold">
                <Coins className="size-4 text-warning" />
                {premio.ouro}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * O acumulado do grupo, desde que ele existe.
 *
 * Fica embaixo e em formato compacto de propósito: a disputa viva é a do mês,
 * onde quem entrou ontem ainda pode ganhar. Esta é a memória, e memória não
 * pode ocupar o lugar do jogo de agora.
 */
function RankingGeral({
  membros,
  usuarioId,
}: {
  membros: MembroGrupo[]
  usuarioId: string | null
}) {
  const tabela = useMemo(
    () =>
      [...membros].sort(
        (a, b) =>
          b.ouroTotal - a.ouroTotal ||
          b.streakTotal - a.streakTotal ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      ),
    [membros],
  )

  // Grupo novo tem a mesma lista duas vezes na tela, uma abaixo da outra, sem
  // nenhum numero diferente. Só aparece quando o acumulado ja diz algo.
  if (tabela.every((m) => m.ouroTotal === 0)) return null

  return (
    <div className="space-y-2 pt-1">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Desde o começo
        </h3>
        <p className="text-xs text-muted-foreground">Todo o ouro ganho no grupo até hoje.</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {tabela.map((m, i) => (
          <li
            key={m.id}
            className={cn(
              'flex min-h-11 items-center gap-3 px-3 py-2 text-sm',
              m.id === usuarioId && 'bg-primary/5',
            )}
          >
            <span
              className={cn(
                'w-6 shrink-0 text-center text-xs font-semibold',
                m.id === usuarioId ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {i + 1}º
            </span>
            <span className="min-w-0 flex-1 truncate">{m.id === usuarioId ? 'Você' : m.nome}</span>
            <span className="flex shrink-0 items-center gap-1 font-semibold">
              <Coins className="size-4 text-warning" />
              {m.ouroTotal}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ItemPodio({
  membro,
  posicao,
  premio,
  souEu,
}: {
  membro: MembroGrupo
  posicao: number
  /** Ouro que esta posição paga na segunda. Zero quando o grupo não premia. */
  premio: number
  souEu: boolean
}) {
  const primeiro = posicao === 1

  return (
    <li className="flex min-w-0 shrink basis-0 grow flex-col items-center gap-1">
      {/* O anel acompanha a caixa do avatar, que e quadrada. Redondo, ele
          cortava o pedestal: o cenario de chao ocupa 84% da largura colado na
          base, entao os cantos da plataforma ficavam de fora do circulo. */}
      <span
        className={cn(
          'inline-flex rounded-lg',
          souEu && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
        )}
      >
        <Avatar
          base={membro.avatarBase}
          item={membro.itemEquipado}
          cenario={membro.cenarioEquipado}
          tamanho={primeiro ? 72 : 52}
          doente={membro.doente}
        />
      </span>
      <span className="w-full truncate text-center text-sm font-medium">
        {souEu ? 'Você' : membro.nome}
      </span>
      <span
        className={cn('flex items-center gap-1 font-semibold', primeiro ? 'text-sm' : 'text-xs')}
      >
        <Coins className={cn('text-warning', primeiro ? 'size-4' : 'size-3.5')} />
        {membro.ouroSemana}
      </span>
      {/* A ofensiva vira o segundo numero: ela desempata, entao continua na
          tela, menor que o ouro que decide. */}
      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Flame className="size-3" />
        {membro.streakTotal}
      </span>
      {/* O prêmio entra DENTRO da barra do pódio, e a altura dela não muda com
          ele: o esqueleto desenha exatamente h-14 e h-9, e uma linha a mais aqui
          faria a tela pular no instante em que os números chegam. Por isso o
          número da posição passou a ficar centralizado em vez de colado no topo,
          abrindo espaço para o prêmio sem crescer um pixel. */}
      <span
        className={cn(
          'mt-1 flex w-full flex-col items-center justify-center gap-0.5 rounded-t-lg leading-none',
          primeiro ? 'h-14 bg-warning/20 text-warning' : 'h-9 bg-muted text-muted-foreground',
        )}
      >
        <span className="text-lg font-bold">{posicao}º</span>
        {premio > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] font-semibold">
            <Coins className="size-3" />
            {premio}
          </span>
        )}
      </span>
    </li>
  )
}

function LinhaRanking({
  membro,
  posicao,
  souEu,
}: {
  membro: MembroGrupo
  posicao: number
  souEu: boolean
}) {
  return (
    <div className="flex min-h-[3.25rem] items-center gap-3 p-3">
      <span
        className={cn(
          'w-7 shrink-0 text-center text-sm font-semibold',
          souEu ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {posicao}º
      </span>
      {/* A lista desce por dezenas de membros e so o comeco esta na tela. O
          podio acima continua imediato: ele e o que a pessoa abre para ver. */}
      <Avatar
        base={membro.avatarBase}
        item={membro.itemEquipado}
        cenario={membro.cenarioEquipado}
        tamanho={40}
        doente={membro.doente}
        adiavel
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate font-medium">{membro.nome}</span>
          {souEu && (
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
              Você
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {membro.concluidosHoje} {membro.concluidosHoje === 1 ? 'feito' : 'feitos'} hoje
          </span>
          <span className="flex items-center gap-0.5">
            <Flame className="size-3" />
            {membro.streakTotal}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
        <Coins className="size-4 text-warning" />
        {membro.ouroSemana}
      </span>
    </div>
  )
}
