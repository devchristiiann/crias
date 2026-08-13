import { Coins, Heart, Loader2, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FormularioHabito } from '@/components/habito/FormularioHabito'
import { CardOcorrencia } from '@/components/hoje/CardOcorrencia'
import { FolhaDesafio } from '@/components/hoje/FolhaDesafio'
import { Botao } from '@/components/ui/Botao'
import { Folha } from '@/components/ui/Folha'
import { useOcorrenciasHoje } from '@/hooks/useOcorrenciasHoje'
import { usePerfil } from '@/hooks/usePerfil'

export function Hoje() {
  const { data: ocorrencias, isPending, isError } = useOcorrenciasHoje()
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

  const { pendentes, concluidas } = useMemo(() => {
    const lista = ocorrencias ?? []
    return {
      pendentes: lista.filter((o) => o.status !== 'feito'),
      concluidas: lista.filter((o) => o.status === 'feito'),
    }
  }, [ocorrencias])

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
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hoje</h1>
          <p className="text-sm text-muted-foreground">
            {pendentes.length === 0 && concluidas.length > 0
              ? 'Tudo feito. Volte amanhã.'
              : `${pendentes.length} para fazer`}
          </p>
        </div>
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
      </header>

      {isPending && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <p className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive">
          Não deu para carregar seus hábitos. Verifique a conexão e puxe a tela para recarregar.
        </p>
      )}

      {!isPending && !isError && (
        <>
          {pendentes.length === 0 && concluidas.length === 0 && (
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
