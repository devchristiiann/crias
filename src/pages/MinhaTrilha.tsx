import { Coins, Loader2 } from 'lucide-react'
import { BarraVida, VIDA_MAXIMA } from '@/components/perfil/BarraVida'
import { CalendarioOfensiva } from '@/components/perfil/CalendarioOfensiva'
import { Protecoes } from '@/components/perfil/Protecoes'
import { Trilha } from '@/components/trilha/Trilha'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { usePerfil } from '@/hooks/usePerfil'
import { useTrilha } from '@/hooks/useTrilha'
import { MOTIVO_EM_PORTUGUES, useVida } from '@/hooks/useVida'
import { FUSO } from '@/lib/data'
import { cn } from '@/lib/utils'

/** Data e hora curtas, sempre em São Paulo, nunca no fuso do navegador. */
const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * A trilha so mostra. Trocar de personagem vive na aba Personagens da Loja, que
 * e onde estao o preco, o que ja e seu e o resto do elenco. Dois lugares para a
 * mesma compra divergiam de preco e de estado.
 */
export function MinhaTrilha() {
  const { data: perfil, isPending, isError, refetch } = usePerfil()
  const { data: trilha } = useTrilha()

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !perfil) {
    return <EstadoErro mensagem="Não deu para carregar sua trilha." aoTentarDeNovo={refetch} />
  }

  const dias = trilha?.diasProdutivos ?? []

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sua trilha</h1>
          <p className="text-sm text-muted-foreground">
            {dias.length} {dias.length === 1 ? 'dia produtivo' : 'dias produtivos'}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-warning/15 px-3 py-2 font-semibold text-warning">
          <Coins className="size-4" />
          {perfil.ouro}
        </span>
      </header>

      {/* O fundo de perfil entra aqui dentro, atras da trilha e do boneco. E o
          unico bloco da tela com o avatar do proprio usuario em destaque. */}
      <Trilha
        diasProdutivos={dias}
        avatarBase={perfil.avatar_base}
        itemEquipado={perfil.item_equipado}
        cenarioEquipado={perfil.cenario_equipado}
        fundoEquipado={perfil.fundo_equipado}
        doente={perfil.doente}
        bauBase={perfil.bau_base}
      />

      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <BarraVida vida={perfil.vida} />
        <Protecoes doente={perfil.doente} escudos={perfil.escudos} />
        <HistoricoVida vida={perfil.vida} />
      </div>

      <CalendarioOfensiva diasProdutivos={dias} />
    </section>
  )
}

/**
 * O que já mexeu na vida, do mais recente para o mais antigo.
 *
 * Sem esta lista a barra só mostrava o saldo, e a pessoa via o número cair sem
 * nunca saber qual rotina atrasou nem quando.
 */
function HistoricoVida({ vida }: { vida: number }) {
  const { data: eventos, isError } = useVida()

  if (isError) {
    return <p className="text-xs text-muted-foreground">Não deu para carregar o histórico agora.</p>
  }

  if (!eventos || eventos.length === 0) {
    // Lista vazia nao quer dizer vida cheia: a barra logo acima pode estar em 20
    // de 50 e o personagem doente. Quem decide a frase e a vida, nao a lista.
    return (
      <p className="text-xs text-muted-foreground">
        {vida >= VIDA_MAXIMA
          ? 'Sua vida ainda está inteira.'
          : 'Ainda não há registro do que mexeu na sua vida.'}
      </p>
    )
  }

  return (
    <ul className="space-y-1 border-t border-border pt-3">
      {eventos.map((e) => (
        <li key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-medium">{MOTIVO_EM_PORTUGUES[e.motivo]}</span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className={cn('font-semibold', e.delta < 0 ? 'text-destructive' : 'text-primary')}>
              {e.delta > 0 ? `+${e.delta}` : e.delta}
            </span>
            <time dateTime={e.criado_em} className="text-muted-foreground">
              {QUANDO.format(new Date(e.criado_em))}
            </time>
          </span>
        </li>
      ))}
    </ul>
  )
}
