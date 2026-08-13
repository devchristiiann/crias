import { Coins, Flame } from 'lucide-react'
import { useMemo } from 'react'
import { Avatar } from '@/components/Avatar'
import type { MembroGrupo } from '@/hooks/useGrupos'
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

export function Ranking({
  membros,
  usuarioId,
}: {
  membros: MembroGrupo[]
  usuarioId: string | null
}) {
  const podio = ORDEM_PODIO.filter((i) => i < membros.length).map((i) => ({
    membro: membros[i],
    posicao: i + 1,
  }))
  const restante = membros.slice(3)
  const indiceProprio = membros.findIndex((m) => m.id === usuarioId)
  const eu = indiceProprio >= 0 ? membros[indiceProprio] : null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ranking do mês
        </h2>
        {/* Numero sem criterio parece arbitrario. O criterio fica na tela. */}
        <p className="text-xs text-muted-foreground">
          Ouro ganho nos desafios do grupo neste mês. Empate vai para a ofensiva.
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

      <RankingGeral membros={membros} usuarioId={usuarioId} />
    </section>
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
  souEu,
}: {
  membro: MembroGrupo
  posicao: number
  souEu: boolean
}) {
  const primeiro = posicao === 1

  return (
    <li className="flex min-w-0 shrink basis-0 grow flex-col items-center gap-1">
      <span
        className={cn(
          'inline-flex rounded-full',
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
        {membro.ouroMes}
      </span>
      {/* A ofensiva vira o segundo numero: ela desempata, entao continua na
          tela, menor que o ouro que decide. */}
      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Flame className="size-3" />
        {membro.streakTotal}
      </span>
      <span
        className={cn(
          'mt-1 flex w-full justify-center rounded-t-lg pt-1.5 text-lg font-bold',
          primeiro ? 'h-14 bg-warning/20 text-warning' : 'h-9 bg-muted text-muted-foreground',
        )}
      >
        {posicao}º
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
      <Avatar
        base={membro.avatarBase}
        item={membro.itemEquipado}
        cenario={membro.cenarioEquipado}
        tamanho={40}
        doente={membro.doente}
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
        {membro.ouroMes}
      </span>
    </div>
  )
}
