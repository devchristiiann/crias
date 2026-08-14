import type { LucideIcon } from 'lucide-react'
import { z } from 'zod'
import { FUSO } from '@/lib/data'
import { iconeDoHabito } from '@/lib/icones'

/**
 * Regras de modulo de rotina no front. Unico dono desses nomes.
 *
 * Aqui so mora calculo puro e validacao de formulario. Quem paga, recusa e
 * decide faixa e o servidor, com o relogio dele. Se os dois discordarem, o
 * servidor esta certo.
 */

export type Modulo = 'livre' | 'acordar' | 'dormir' | 'agua' | 'tela'
/**
 * `ate` no formato HH:MM. Em `acordar` e `dormir` e hora do relogio. Em `tela` e
 * DURACAO: o mesmo formato com outro significado, e o servidor usa o mesmo
 * `habits.config`.
 */
export type Faixa = { ate: string; ouro: number }
export type ConfigHorario = { faixas: Faixa[] }
export type ConfigAgua = { vezes: number; lembretes: string[] }
export type ConfigModulo = ConfigHorario | ConfigAgua | Record<string, never>

export const PRECO_CURA = 200
export const PRECO_ESCUDO = 800

export const MAX_FAIXAS = 4
export const OURO_MAXIMO = 30
/**
 * Quanto vale uma rotina nova antes de a pessoa escolher.
 *
 * Separado do teto de proposito. Enquanto os dois eram 10, um numero servia
 * para as duas coisas e ninguem via a diferenca; subir o teto para 30 com o
 * padrao amarrado nele triplicaria calado a recompensa de toda rotina criada
 * daqui para frente, sem ninguem decidir nada. O teto e ate onde da para ir, o
 * padrao e onde se comeca.
 */
export const OURO_PADRAO = 10
export const COPOS_MIN = 2
export const COPOS_MAX = 10
/** Duracao declarada no check-in de `tela`. O servidor recusa fora daqui. */
const MINUTOS_MIN = 1
const MINUTOS_MAX = 1440

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const horaSchema = z.string().regex(HORA)

const horarioSchema = z.object({
  faixas: z
    .array(z.object({ ate: horaSchema, ouro: z.number().int().min(1).max(OURO_MAXIMO) }))
    .min(1)
    .max(MAX_FAIXAS)
    // Ouro decrescente e horario sem repetir valem para os dois modulos de
    // horario. A ordem crescente depende da janela, entao fica em `erroConfig`.
    .refine((f) => f.every((x, i) => i === 0 || x.ouro < f[i - 1].ouro))
    .refine((f) => new Set(f.map((x) => x.ate)).size === f.length),
})

const aguaSchema = z
  .object({
    vezes: z.number().int().min(COPOS_MIN).max(COPOS_MAX),
    lembretes: z.array(horaSchema),
  })
  .refine((c) => c.lembretes.length <= c.vezes)
  .refine((c) => c.lembretes.every((h, i) => i === 0 || h > c.lembretes[i - 1]))

/** Valida `habits.config`. A trava real e a constraint do banco. */
export const configSchema: z.ZodType<ConfigModulo> = z.union([
  horarioSchema,
  aguaSchema,
  z.record(z.never()),
])

const ROTULOS: Record<Modulo, string> = {
  // `livre` cobre "Quero fazer" e "Quero evitar": quem separa os dois e
  // `habits.tipo`, entao aqui o rotulo precisa servir para os dois.
  livre: 'Rotina',
  acordar: 'Acordar cedo',
  dormir: 'Dormir cedo',
  agua: 'Beber água',
  tela: 'Menos tela',
}

/**
 * Nome do icone gravado em `habits.icone`. No modulo o icone e fixo.
 *
 * Os nomes sao os mesmos que `criar_habito` grava. Divergir daqui faz a rotina
 * recem criada abrir com um icone e recarregar com outro.
 */
export const ICONE_MODULO: Record<Modulo, string> = {
  livre: 'target',
  acordar: 'sunrise',
  dormir: 'moon',
  agua: 'droplets',
  tela: 'smartphone',
}

export function rotuloModulo(m: Modulo): string {
  return ROTULOS[m]
}

export function iconeModulo(m: Modulo): LucideIcon {
  return iconeDoHabito(ICONE_MODULO[m])
}

export function ehModuloHorario(m: Modulo): boolean {
  return m === 'acordar' || m === 'dormir'
}

/**
 * Faixa por duracao, nao por relogio. `tela` e o unico, e a diferenca importa:
 * o `ate` daqui nunca passa pela regra de madrugada do `dormir`.
 */
export function ehModuloDuracao(m: Modulo): boolean {
  return m === 'tela'
}

/**
 * Rotina que so existe dentro de grupo. Sem grupo nao existe quem valide, e o
 * check-in ficaria esperando para sempre.
 */
export function ehModuloDeGrupo(m: Modulo): boolean {
  return m === 'tela'
}

/**
 * Ocorrencia declarada e esperando o grupo. Recebe `string` de proposito: o
 * status vem de `occurrences.status`, que ganhou `em_validacao` na migration, e
 * este arquivo nao e dono daquele tipo.
 */
export function emValidacao(status: string): boolean {
  return status === 'em_validacao'
}

/**
 * Se o check-in exige foto. Dono unico da regra: a folha e o card precisam
 * dizer a mesma coisa, senao o card promete camera e a folha nao pede, ou pior.
 *
 * Agua fica de fora sempre, mesmo em grupo que exige foto: sao ate 10 copos por
 * dia e uma foto por copo transforma marcar agua em sessao de fotografia.
 * Anexar continua permitido, so deixa de ser obrigatorio. Acordar e dormir
 * exigem sempre, porque a foto e a prova social do horario. Tela exige sempre
 * pelo mesmo motivo mais forte: sem o print nao ha o que o grupo validar. A
 * trava de verdade e o `check_in`.
 */
export function exigeFotoNoCheckIn(m: Modulo, grupoExigeFoto: boolean): boolean {
  if (m === 'agua') return false
  return grupoExigeFoto || ehModuloHorario(m) || ehModuloDuracao(m)
}

/** Minutos puros de um HH:MM. Sem regra de janela nenhuma. */
function minutosDoTexto(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
}

/**
 * Minutos desde o inicio da janela do modulo. **So os modulos de relogio.**
 *
 * Em `dormir`, hora abaixo de 06:00 e madrugada do dia seguinte: sem isso o
 * modulo nasce quebrado para quem dorme 00h30, que e a maioria do publico.
 *
 * `tela` passa por aqui e sai intacto, e precisa continuar assim: la o `ate` e
 * duracao, e somar 24 horas faria 20 minutos de uso virar uma faixa maior que
 * 23 horas de uso. Quem converte duracao e `minutosDoTexto`, direto.
 */
function minutosNaJanela(modulo: Modulo, hhmm: string): number {
  const minutos = minutosDoTexto(hhmm)
  return modulo === 'dormir' && minutos < 6 * 60 ? minutos + 24 * 60 : minutos
}

/**
 * Limites de cada faixa, por modulo. Relogio e duracao dividem o mesmo editor e
 * a mesma validacao: o que muda e o intervalo aceito e como a frase explica.
 */
const LIMITES: Record<
  'acordar' | 'dormir' | 'tela',
  { de: number; ate: number; aviso: string; ordem: string; ouro: string }
> = {
  acordar: {
    de: 0,
    ate: 11 * 60 + 59,
    aviso: 'Acordar cedo aceita horário de 00:00 até 11:59.',
    ordem: 'Cada faixa precisa terminar depois da anterior.',
    ouro: 'Faixa mais tarde precisa pagar menos ouro que a anterior.',
  },
  dormir: {
    de: 18 * 60,
    ate: 5 * 60 + 59 + 24 * 60,
    aviso: 'Dormir cedo aceita horário de 18:00 até 05:59.',
    ordem: 'Cada faixa precisa terminar depois da anterior.',
    ouro: 'Faixa mais tarde precisa pagar menos ouro que a anterior.',
  },
  tela: {
    de: 15,
    ate: 23 * 60 + 59,
    aviso: 'O tempo de uso aceita de 00:15 até 23:59.',
    ordem: 'Cada faixa precisa cobrir mais tempo que a anterior.',
    ouro: 'Faixa de mais tempo precisa pagar menos ouro que a anterior.',
  },
}

function limiteDaFaixa(m: Modulo) {
  return m === 'acordar' || m === 'dormir' || m === 'tela' ? LIMITES[m] : null
}

/**
 * Minutos de uma duracao HH:MM digitada, ou null quando o campo esta vazio ou
 * torto. Quem recusa de verdade e o `check_in`, com `minutos_invalidos`.
 */
export function minutosDeDuracao(hhmm: string): number | null {
  if (!HORA.test(hhmm)) return null
  const minutos = minutosDoTexto(hhmm)
  return minutos >= MINUTOS_MIN && minutos <= MINUTOS_MAX ? minutos : null
}

/**
 * Faixa que cobre os minutos declarados, ou null acima da ultima faixa.
 *
 * Mesma regra do servidor: a primeira faixa cujo `ate` seja maior ou igual ao
 * declarado. Nenhuma serve e o check-in e recusado com `fora_da_faixa`.
 *
 * Aceita nulo e zero de proposito, e devolve null para os dois: a coluna
 * `minutos_declarados` e nula fora do modulo `tela`, e um `?? 0` no chamador
 * cairia na PRIMEIRA faixa, que e justamente a que paga mais. Quem nao declarou
 * nao tem faixa, e a guarda mora aqui para nao existir em duas versoes.
 */
export function faixaPorDuracao(
  config: ConfigModulo,
  minutos: number | null | undefined,
): Faixa | null {
  if (!('faixas' in config) || !minutos || minutos <= 0) return null
  return config.faixas.find((f) => minutosDoTexto(f.ate) >= minutos) ?? null
}

/** Instanciar o formatador e a parte cara. Uma vez por modulo, nao por card. */
const RELOGIO_SP = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * Estado da faixa agora, ou null quando o modulo nao tem faixa nenhuma.
 *
 * Fora da janela existem dois casos, e trata-los como um so faz a tela mentir:
 * as 13h a faixa de dormir nao encerrou, ela ainda nem abriu. `abre` e a hora
 * em que a janela do modulo comeca, para a tela dizer a partir de quando vale.
 */
export type EstadoFaixa =
  | { estado: 'antes' | 'aberta'; faixa: Faixa; abre: string }
  | { estado: 'encerrada'; faixa: null; abre: string }

export function estadoFaixa(
  modulo: Modulo,
  config: ConfigModulo,
  agora: Date,
): EstadoFaixa | null {
  if (!ehModuloHorario(modulo) || !('faixas' in config) || config.faixas.length === 0) return null
  const janela = LIMITES[modulo === 'dormir' ? 'dormir' : 'acordar']
  const abre = `${String(Math.floor(janela.de / 60)).padStart(2, '0')}:${String(janela.de % 60).padStart(2, '0')}`
  const agoraNaJanela = minutosNaJanela(modulo, RELOGIO_SP.format(agora))
  if (agoraNaJanela < janela.de) return { estado: 'antes', faixa: config.faixas[0], abre }
  const faixa =
    agoraNaJanela > janela.ate
      ? undefined
      : config.faixas.find((f) => minutosNaJanela(modulo, f.ate) >= agoraNaJanela)
  return faixa ? { estado: 'aberta', faixa, abre } : { estado: 'encerrada', faixa: null, abre }
}

/** Faixa que vale agora, ou null fora da janela do modulo. */
export function faixaVigente(modulo: Modulo, config: ConfigModulo, agora: Date): Faixa | null {
  const atual = estadoFaixa(modulo, config, agora)
  return atual?.estado === 'aberta' ? atual.faixa : null
}

/**
 * Mensagem pronta para a tela, ou null quando a config esta boa.
 *
 * Existe porque `configSchema` nao recebe o modulo e as janelas de horario
 * mudam entre `acordar` e `dormir`.
 */
export function erroConfig(modulo: Modulo, config: ConfigModulo): string | null {
  // Relogio e duracao compartilham o editor e a validacao. `minutosNaJanela` so
  // muda alguma coisa em `dormir`, entao a duracao atravessa em minutos puros.
  const limite = limiteDaFaixa(modulo)
  if (limite) {
    const faixas = 'faixas' in config ? config.faixas : []
    if (faixas.length < 1 || faixas.length > MAX_FAIXAS) {
      return `Escolha de 1 a ${MAX_FAIXAS} faixas.`
    }
    for (const faixa of faixas) {
      if (!HORA.test(faixa.ate)) return limite.aviso
      const minuto = minutosNaJanela(modulo, faixa.ate)
      if (minuto < limite.de || minuto > limite.ate) return limite.aviso
      if (!Number.isInteger(faixa.ouro) || faixa.ouro < 1 || faixa.ouro > OURO_MAXIMO) {
        return `O ouro de cada faixa fica entre 1 e ${OURO_MAXIMO}.`
      }
    }
    for (let i = 1; i < faixas.length; i++) {
      if (minutosNaJanela(modulo, faixas[i].ate) <= minutosNaJanela(modulo, faixas[i - 1].ate)) {
        return limite.ordem
      }
      if (faixas[i].ouro >= faixas[i - 1].ouro) return limite.ouro
    }
  }

  if (modulo === 'agua') {
    const vezes = 'vezes' in config ? config.vezes : 0
    const lembretes = 'lembretes' in config ? config.lembretes : []
    if (!Number.isInteger(vezes) || vezes < COPOS_MIN || vezes > COPOS_MAX) {
      return `Escolha de ${COPOS_MIN} a ${COPOS_MAX} copos.`
    }
    if (lembretes.length > vezes) return 'No máximo um alarme por copo.'
    if (lembretes.some((h, i) => !HORA.test(h) || (i > 0 && h <= lembretes[i - 1]))) {
      return 'Os alarmes precisam estar em ordem crescente, sem repetir.'
    }
  }

  return configSchema.safeParse(config).success ? null : 'Configuração inválida.'
}
