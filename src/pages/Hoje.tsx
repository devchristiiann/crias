import { Coins, Heart, Loader2, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FormularioHabito } from '@/components/habito/FormularioHabito'
import { CardHabitoRuim } from '@/components/hoje/CardHabitoRuim'
import { CardOcorrencia } from '@/components/hoje/CardOcorrencia'
import { FolhaDesafio } from '@/components/hoje/FolhaDesafio'
import { SinoNotificacoes } from '@/components/notificacoes/SinoNotificacoes'
import { Botao } from '@/components/ui/Botao'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { Folha } from '@/components/ui/Folha'
import { useHabitosRuins } from '@/hooks/useHabitosRuins'
import { useOcorrenciasHoje } from '@/hooks/useOcorrenciasHoje'
import { usePerfil } from '@/hooks/usePerfil'
import { emValidacao } from '@/lib/modulos'

export function Hoje() {
  const { data: ocorrencias, isPending, isError, refetch } = useOcorrenciasHoje()
  const { data: habitosRuins } = useHabitosRuins()
  const { data: perfil } = usePerfil()
  const [parametros, setParametros] = useSearchParams()
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  // A notificacao chega como /hoje?occ=<id>. Abrir a folha daquele desafio
  // e o ponto do push inteiro: o toque tem que cair no lugar certo.
  const daUrl = parametros.get('occ')
  useEffect(() => {
    if (daUrl) setSelecionada(daUrl)
  }, [daUrl])

  const { pendentes, concluidas, aFazer } = useMemo(() => {
    const lista = ocorrencias ?? []
    const pendentes = lista.filter((o) => o.status !== 'feito')
    return {
      pendentes,
      concluidas: lista.filter((o) => o.status === 'feito'),
      // Declaração aguardando o grupo já saiu das mãos da pessoa: o card
      // continua na lista, porque ela precisa ver que declarou e está
      // esperando, mas contar como pendência é cobrar de novo o que já foi
      // feito e não pode mais ser tocado.
      aFazer: pendentes.filter((o) => !emValidacao(o.status)).length,
    }
  }, [ocorrencias])

  const ruins = habitosRuins ?? []
  const aberta = (ocorrencias ?? []).find((o) => o.id === selecionada) ?? null

  function fecharFolha() {
    setSelecionada(null)
    if (daUrl) {
      parametros.delete('occ')
      setParametros(parametros, { replace: true })
    }
  }

  return (
    <section className="space-y-5">
      {/* O bloco da direita cresceu com o sino, e o ouro pode chegar a cinco
          digitos. Sem `min-w-0` o titulo empurra a linha para fora dos 360px. */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Hoje</h1>
          <p className="truncate text-sm text-muted-foreground">
            {aFazer === 0 && pendentes.length + concluidas.length > 0
              ? 'Tudo feito. Volte amanhã.'
              : `${aFazer} para fazer`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SinoNotificacoes />
          {perfil && (
            <dl className="flex gap-3 text-sm font-semibold">
              <div className="flex items-center gap-1" title="Ouro">
                <Coins className="size-4 text-warning" />
                {perfil.ouro}
              </div>
              <div className="flex items-center gap-1" title="Vida">
                <Heart className="size-4 text-destructive" />
                {perfil.vida}
              </div>
            </dl>
          )}
        </div>
      </header>

      {isPending && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <EstadoErro mensagem="Não deu para carregar seus hábitos." aoTentarDeNovo={refetch} />
      )}

      {!isPending && !isError && (
        <>
          {/* A secao Evitar conta: dizer "nada marcado" com habito de perda
              logo abaixo e a tela contradizendo a si mesma. */}
          {pendentes.length === 0 && concluidas.length === 0 && ruins.length === 0 && (
            <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              Nada marcado para hoje. Crie um hábito ou espere a próxima data da sua frequência.
            </p>
          )}

          <ul className="space-y-2">
            {pendentes.map((o) => (
              <li key={o.id}>
                <CardOcorrencia ocorrencia={o} aoAbrir={() => setSelecionada(o.id)} />
              </li>
            ))}
          </ul>

          {concluidas.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Concluídos
              </h2>
              <ul className="space-y-2">
                {concluidas.map((o) => (
                  <li key={o.id}>
                    <CardOcorrencia ocorrencia={o} aoAbrir={() => setSelecionada(o.id)} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ruins.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Evitar
              </h2>
              <ul className="space-y-2">
                {ruins.map((h) => (
                  <li key={h.id}>
                    <CardHabitoRuim habito={h} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Botao variante="secundario" className="w-full" onClick={() => setCriando(true)}>
        <Plus className="size-4" />
        Novo hábito
      </Botao>

      <FolhaDesafio ocorrencia={aberta} aoFechar={fecharFolha} />

      <Folha aberta={criando} aoFechar={() => setCriando(false)} titulo="Novo hábito">
        <FormularioHabito aoCriar={() => setCriando(false)} />
      </Folha>
    </section>
  )
}
