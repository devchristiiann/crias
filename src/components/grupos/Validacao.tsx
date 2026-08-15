import { ThumbsDown, ThumbsUp, Timer } from 'lucide-react'
import { Botao } from '@/components/ui/Botao'
import { useVotarValidacao } from '@/hooks/useEnquetesGrupo'
import type { ItemFeed } from '@/hooks/useFeedGrupo'
import type { MembroGrupo } from '@/hooks/useGrupos'
import { cn } from '@/lib/utils'

/**
 * Minutos declarados em horas e minutos, como a pessoa fala: "2h15", "3h",
 * "45min". Numero cru de minuto obriga quem le a fazer a conta de cabeca.
 */
export function formatarDuracao(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas === 0) return `${resto}min`
  if (resto === 0) return `${horas}h`
  return `${horas}h${String(resto).padStart(2, '0')}`
}

/**
 * Quanto falta para a enquete fechar.
 *
 * O prazo vencido continua aparecendo porque quem fecha e o `pg_cron`, de hora
 * em hora. A tela diz que acabou e recolhe os botoes em vez de deixar a pessoa
 * tocar num voto que a RPC ja recusa. O agora entra por parametro porque
 * relogio dentro da funcao nao se testa.
 */
export function prazo(
  iso: string,
  agora: Date = new Date(),
): { encerrado: boolean; rotulo: string } {
  const restante = iso ? new Date(iso).getTime() - agora.getTime() : 0
  if (restante <= 0) return { encerrado: true, rotulo: 'Prazo encerrado' }
  const horas = Math.floor(restante / 3_600_000)
  return { encerrado: false, rotulo: horas < 1 ? 'Fecha em menos de 1h' : `Fecha em ${horas}h` }
}

/**
 * O corpo do post enquanto o grupo ainda vota.
 *
 * Vive dentro do cartao do feed, no lugar da linha "concluiu": a declaracao e
 * post como qualquer outro, em ordem cronologica, e nao um bloco de destaque
 * acima da lista. O que a distingue e o contorno tracejado do cartao e o relogio
 * do prazo, nao a posicao.
 *
 * O tom e de registro, nao de julgamento: quem foi contestado nao ganha vermelho
 * de erro nem palavra de acusacao. O voto e aberto por decisao do dono, e as
 * mesmas pessoas se veem no dia seguinte.
 */
export function BlocoValidacao({
  item,
  titulo,
  membros,
  grupoId,
  usuarioId,
}: {
  item: ItemFeed
  titulo: string
  membros: Map<string, MembroGrupo>
  grupoId: string
  usuarioId: string | null
}) {
  const votar = useVotarValidacao(grupoId, usuarioId)

  const nomes = (lista: string[]) => lista.map((id) => membros.get(id)?.nome ?? 'Alguém').join(', ')
  // A propria declaracao nao recebe voto de quem a fez. A trava e a RPC, com
  // `voto_proprio`; aqui a tela so nao oferece o que ja nasceria recusado.
  const souAutor = item.usuarioId === usuarioId
  const meuVoto = usuarioId
    ? item.aFavor.includes(usuarioId)
      ? true
      : item.contra.includes(usuarioId)
        ? false
        : null
    : null
  const restante = prazo(item.validacaoAte ?? '')

  return (
    <>
      <div className="space-y-1.5 px-3 py-2.5 text-sm">
        <p className="flex items-start gap-2">
          <Timer className="mt-0.5 size-4 shrink-0 text-warning" />
          <span className="min-w-0 break-words">
            declarou <span className="font-medium">{formatarDuracao(item.minutos ?? 0)}</span> em{' '}
            <span className="font-medium">{titulo}</span>
          </span>
        </p>
        <p className="flex items-start gap-2">
          <ThumbsUp className="mt-0.5 size-4 shrink-0 text-success" />
          <span className="min-w-0 break-words">
            <span className="font-medium">Validado {item.aFavor.length}</span>
            {item.aFavor.length > 0 && (
              <span className="text-muted-foreground"> {nomes(item.aFavor)}</span>
            )}
          </span>
        </p>
        {/* Contestado nunca em vermelho de erro: quem contestou registrou uma
            leitura, nao denunciou ninguem. */}
        <p className="flex items-start gap-2">
          <ThumbsDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-words">
            <span className="font-medium">Contestado {item.contra.length}</span>
            {item.contra.length > 0 && (
              <span className="text-muted-foreground"> {nomes(item.contra)}</span>
            )}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{restante.rotulo}</p>
      </div>

      {souAutor ? (
        <p className="border-t border-border px-3 py-2.5 text-sm text-muted-foreground">
          Sua declaração está aguardando o grupo.
        </p>
      ) : (
        !restante.encerrado && (
          <div className="space-y-2 border-t border-border p-3">
            {/* O voto atual se destaca por borda, fundo e peso, nao so por cor:
                alem de acessivel, evita pintar "contestado" de vermelho de erro.
                Trocar o voto e tocar no outro botao. */}
            <div className="flex gap-2">
              <Botao
                variante="secundario"
                className={cn(
                  'flex-1',
                  meuVoto === true && 'border-success bg-success/10 font-semibold',
                )}
                aria-pressed={meuVoto === true}
                carregando={votar.isPending && votar.variables?.aprova === true}
                disabled={votar.isPending}
                onClick={() => votar.mutate({ occ: item.id, aprova: true })}
              >
                <ThumbsUp className="size-4" />
                Validar
              </Botao>
              <Botao
                variante="secundario"
                className={cn(
                  'flex-1',
                  meuVoto === false && 'border-foreground/40 bg-accent font-semibold',
                )}
                aria-pressed={meuVoto === false}
                carregando={votar.isPending && votar.variables?.aprova === false}
                disabled={votar.isPending}
                onClick={() => votar.mutate({ occ: item.id, aprova: false })}
              >
                <ThumbsDown className="size-4" />
                Contestar
              </Botao>
            </div>
            {votar.isError && <p className="text-sm text-destructive">{votar.error.message}</p>}
          </div>
        )
      )}
    </>
  )
}
