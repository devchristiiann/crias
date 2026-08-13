import { ThumbsDown, ThumbsUp, Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { FotoAmpliada, FotoComprovacao, type FotoAberta } from '@/components/grupos/FotoComprovacao'
import { Botao } from '@/components/ui/Botao'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { useEnquetesGrupo, useVotarValidacao } from '@/hooks/useEnquetesGrupo'
import type { DetalheGrupo } from '@/hooks/useGrupos'
import { useSessao } from '@/hooks/useSessao'
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
 * Enquetes abertas, no topo do feed do grupo.
 *
 * O tom e de registro, nao de julgamento: quem foi contestado nao ganha vermelho
 * de erro nem palavra de acusacao. O voto e aberto por decisao do dono, e as
 * mesmas pessoas se veem no dia seguinte.
 */
export function EnquetesGrupo({ grupo }: { grupo: DetalheGrupo }) {
  const ids = useMemo(() => grupo.desafios.map((d) => d.id), [grupo.desafios])
  const { data, isError, refetch } = useEnquetesGrupo(grupo.id, ids)
  const { usuarioId } = useSessao()
  const votar = useVotarValidacao(grupo.id)
  const [ampliada, setAmpliada] = useState<FotoAberta | null>(null)

  const membros = useMemo(() => new Map(grupo.membros.map((m) => [m.id, m])), [grupo.membros])
  const desafios = useMemo(() => new Map(grupo.desafios.map((d) => [d.id, d])), [grupo.desafios])
  const nomes = (lista: string[]) =>
    lista.map((id) => membros.get(id)?.nome ?? 'Alguém').join(', ')

  if (isError) {
    return <EstadoErro mensagem="Não deu para carregar as validações." aoTentarDeNovo={refetch} />
  }

  const enquetes = data ?? []
  if (enquetes.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Validação do grupo
      </h2>

      <ul className="space-y-3">
        {enquetes.map((enquete) => {
          const membro = membros.get(enquete.autorId)
          const nome = membro?.nome ?? 'Alguém'
          const titulo = desafios.get(enquete.habitId)?.titulo ?? 'uma rotina'
          const alt = `Comprovação de ${nome} em ${titulo}`
          const souAutor = enquete.autorId === usuarioId
          const meuVoto = usuarioId
            ? enquete.aFavor.includes(usuarioId)
              ? true
              : enquete.contra.includes(usuarioId)
                ? false
                : null
            : null
          const restante = prazo(enquete.validacaoAte)
          const emVoo = votar.isPending && votar.variables?.occ === enquete.id
          const erro = votar.isError && votar.variables?.occ === enquete.id

          return (
            <li
              key={enquete.id}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <div className="flex items-center gap-2.5 p-3">
                {/* Membro que saiu do grupo nao tem avatar para montar. O circulo
                    vazio mantem o alinhamento da linha. */}
                {membro ? (
                  <Avatar
                    base={membro.avatarBase}
                    item={membro.itemEquipado}
                    cenario={membro.cenarioEquipado}
                    tamanho={36}
                    doente={membro.doente}
                  />
                ) : (
                  <span className="size-9 shrink-0 rounded-full bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Declarou {formatarDuracao(enquete.minutos)} em {titulo}
                  </p>
                </div>
              </div>

              {enquete.fotoUrl && (
                <FotoComprovacao url={enquete.fotoUrl} alt={alt} aoAmpliar={setAmpliada} />
              )}

              <div className="space-y-1.5 px-3 py-2.5 text-sm">
                <p className="flex items-start gap-2">
                  <ThumbsUp className="mt-0.5 size-4 shrink-0 text-success" />
                  <span className="min-w-0 break-words">
                    <span className="font-medium">Validado {enquete.aFavor.length}</span>
                    {enquete.aFavor.length > 0 && (
                      <span className="text-muted-foreground"> {nomes(enquete.aFavor)}</span>
                    )}
                  </span>
                </p>
                {/* Contestado nunca em vermelho de erro: quem contestou registrou
                    uma leitura, nao denunciou ninguem. */}
                <p className="flex items-start gap-2">
                  <ThumbsDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 break-words">
                    <span className="font-medium">Contestado {enquete.contra.length}</span>
                    {enquete.contra.length > 0 && (
                      <span className="text-muted-foreground"> {nomes(enquete.contra)}</span>
                    )}
                  </span>
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Timer className="size-3.5 shrink-0" />
                  {restante.rotulo}
                </p>
              </div>

              {souAutor ? (
                <p className="border-t border-border px-3 py-2.5 text-sm text-muted-foreground">
                  Sua declaração está aguardando o grupo.
                </p>
              ) : (
                !restante.encerrado && (
                  <div className="space-y-2 border-t border-border p-3">
                    {/* O voto atual se destaca por borda, fundo e peso, nao so
                        por cor: alem de acessivel, evita pintar "contestado" de
                        vermelho de erro. Trocar o voto e tocar no outro botao. */}
                    <div className="flex gap-2">
                      <Botao
                        variante="secundario"
                        className={cn(
                          'flex-1',
                          meuVoto === true && 'border-success bg-success/10 font-semibold',
                        )}
                        aria-pressed={meuVoto === true}
                        carregando={emVoo && votar.variables?.aprova === true}
                        disabled={votar.isPending}
                        onClick={() => votar.mutate({ occ: enquete.id, aprova: true })}
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
                        carregando={emVoo && votar.variables?.aprova === false}
                        disabled={votar.isPending}
                        onClick={() => votar.mutate({ occ: enquete.id, aprova: false })}
                      >
                        <ThumbsDown className="size-4" />
                        Contestar
                      </Botao>
                    </div>
                    {erro && <p className="text-sm text-destructive">{votar.error.message}</p>}
                  </div>
                )
              )}
            </li>
          )
        })}
      </ul>

      <FotoAmpliada foto={ampliada} aoFechar={() => setAmpliada(null)} />
    </section>
  )
}
