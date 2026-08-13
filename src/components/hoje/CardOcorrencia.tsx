import { Camera, Check, Coins, Flame, Hourglass, Users } from 'lucide-react'
import type { OcorrenciaHoje } from '@/hooks/useOcorrenciasHoje'
import { horaCurta } from '@/lib/data'
import { rotuloFrequencia } from '@/lib/frequencia'
import { iconeDoHabito } from '@/lib/icones'
import {
  ehModuloHorario,
  emValidacao as estaEmValidacao,
  estadoFaixa,
  exigeFotoNoCheckIn,
  faixaPorDuracao,
} from '@/lib/modulos'
import { cn } from '@/lib/utils'

export function CardOcorrencia({
  ocorrencia,
  aoAbrir,
}: {
  ocorrencia: OcorrenciaHoje
  aoAbrir: () => void
}) {
  const Icone = iconeDoHabito(ocorrencia.icone)
  const feito = ocorrencia.status === 'feito'
  const atrasado = ocorrencia.status === 'atrasado'
  // Declarado e esperando o grupo votar. Nada foi pago ainda, entao o ouro
  // desta linha e "quanto vale se passar", nunca "quanto voce ganhou".
  const emValidacao = estaEmValidacao(ocorrencia.status)
  // Sem `?? 0`: zero minuto caia na primeira faixa, a que paga mais, e o card
  // prometia o valor maximo para uma declaracao que nao existe. Quem trata
  // minuto ausente e `faixaPorDuracao`, dono unico da regra.
  const ouroSeValidar = emValidacao
    ? (faixaPorDuracao(ocorrencia.config, ocorrencia.minutos_declarados)?.ouro ?? null)
    : null
  const parcial = ocorrencia.vezes_alvo > 1
  // Faixa calculada no desenho, com o relogio do aparelho. E so vitrine: quem
  // paga, e quem recusa, e o servidor no instante do check-in.
  const porHorario = ehModuloHorario(ocorrencia.modulo)
  const faixa = porHorario ? estadoFaixa(ocorrencia.modulo, ocorrencia.config, new Date()) : null

  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm',
        'transition-colors hover:bg-accent',
        feito && 'opacity-60',
        atrasado && 'border-destructive/40',
        // Amarelo de espera, nunca vermelho: quem declarou fez a parte dela e
        // esta so aguardando. Vermelho aqui diria que alguma coisa deu errado.
        emValidacao && 'border-warning/40',
        !atrasado && !emValidacao && 'border-border',
      )}
    >
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-lg',
          feito && 'bg-success/15 text-success',
          emValidacao && 'bg-warning/15 text-warning',
          !feito && !emValidacao && 'bg-primary/10 text-primary',
        )}
      >
        {feito && <Check className="size-5" />}
        {emValidacao && <Hourglass className="size-5" />}
        {!feito && !emValidacao && <Icone className="size-5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate font-medium', feito && 'line-through')}>
            {ocorrencia.titulo}
          </span>
          {ocorrencia.streak > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-warning">
              <Flame className="size-3.5" />
              {ocorrencia.streak}
            </span>
          )}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{rotuloFrequencia(ocorrencia.regra)}</span>
          {ocorrencia.lembrete && <span>{horaCurta(ocorrencia.lembrete)}</span>}
          {porHorario && !feito && faixa && (
            <span
              className={cn(
                'font-medium',
                faixa.estado === 'encerrada' ? 'text-destructive' : 'text-foreground',
              )}
            >
              {faixa.estado === 'aberta' && `Até ${faixa.faixa.ate}`}
              {faixa.estado === 'antes' && `A partir das ${faixa.abre}`}
              {faixa.estado === 'encerrada' && 'Faixa encerrada'}
            </span>
          )}
          {parcial && (
            <span className="font-medium text-foreground">
              {ocorrencia.vezes_feitas} de {ocorrencia.vezes_alvo}
              {ocorrencia.modulo === 'agua' && ' copos'}
            </span>
          )}
          {ocorrencia.grupoNome && (
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {ocorrencia.feitosNoGrupo} de {ocorrencia.totalGrupo}
            </span>
          )}
          {/* Mesma regra da folha: água não pede foto nem em grupo que exige.
              Câmera aqui e nenhuma cobrança lá diria coisas diferentes. */}
          {!emValidacao && exigeFotoNoCheckIn(ocorrencia.modulo, ocorrencia.grupoExigeFoto) && (
            <span className="flex items-center gap-1">
              <Camera className="size-3" />
              <span className="sr-only">Precisa de foto</span>
            </span>
          )}
          {/* Texto em `foreground`, nao no ambar do icone: amarelo sobre card
              claro nao passa no contraste, e a ampulheta ja carrega a cor. */}
          {emValidacao && <span className="font-medium text-foreground">Aguardando o grupo</span>}
          {atrasado && <span className="font-medium text-destructive">Atrasado</span>}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground">
        <Coins className="size-4" />
        {/* Em modulo de horario o valor e o da faixa que esta valendo agora, nao
            o `ouro_base`, que guarda so a primeira faixa. Em validacao e a faixa
            dos minutos declarados: quanto vale se o grupo aprovar. */}
        {emValidacao && (ouroSeValidar ?? '—')}
        {!emValidacao &&
          (porHorario && !feito ? (faixa?.faixa ? faixa.faixa.ouro : '—') : ocorrencia.ouroBase)}
      </span>
    </button>
  )
}
