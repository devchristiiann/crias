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

export type Modulo = 'livre' | 'acordar' | 'dormir' | 'agua'
/** `ate` no formato HH:MM. */
export type Faixa = { ate: string; ouro: number }
export type ConfigHorario = { faixas: Faixa[] }
export type ConfigAgua = { vezes: number; lembretes: string[] }
export type ConfigModulo = ConfigHorario | ConfigAgua | Record<string, never>

export const PRECO_CURA = 200
export const PRECO_ESCUDO = 800

export const MAX_FAIXAS = 4
export const OURO_MAXIMO = 10
export const COPOS_MIN = 2
export const COPOS_MAX = 10

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
 * Minutos desde o inicio da janela do modulo.
 *
 * Em `dormir`, hora abaixo de 06:00 e madrugada do dia seguinte: sem isso o
 * modulo nasce quebrado para quem dorme 00h30, que e a maioria do publico.
 */
function minutosNaJanela(modulo: Modulo, hhmm: string): number {
  const minutos = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  return modulo === 'dormir' && minutos < 6 * 60 ? minutos + 24 * 60 : minutos
}

const JANELAS: Record<'acordar' | 'dormir', { de: number; ate: number; aviso: string }> = {
  acordar: { de: 0, ate: 11 * 60 + 59, aviso: 'Acordar cedo aceita horário de 00:00 até 11:59.' },
  dormir: {
    de: 18 * 60,
    ate: 5 * 60 + 59 + 24 * 60,
    aviso: 'Dormir cedo aceita horário de 18:00 até 05:59.',
  },
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
  const janela = JANELAS[modulo === 'dormir' ? 'dormir' : 'acordar']
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
  if (ehModuloHorario(modulo)) {
    const faixas = 'faixas' in config ? config.faixas : []
    const janela = JANELAS[modulo === 'dormir' ? 'dormir' : 'acordar']
    if (faixas.length < 1 || faixas.length > MAX_FAIXAS) {
      return `Escolha de 1 a ${MAX_FAIXAS} faixas.`
    }
    for (const faixa of faixas) {
      if (!HORA.test(faixa.ate)) return janela.aviso
      const minuto = minutosNaJanela(modulo, faixa.ate)
      if (minuto < janela.de || minuto > janela.ate) return janela.aviso
      if (!Number.isInteger(faixa.ouro) || faixa.ouro < 1 || faixa.ouro > OURO_MAXIMO) {
        return `O ouro de cada faixa fica entre 1 e ${OURO_MAXIMO}.`
      }
    }
    for (let i = 1; i < faixas.length; i++) {
      if (minutosNaJanela(modulo, faixas[i].ate) <= minutosNaJanela(modulo, faixas[i - 1].ate)) {
        return 'Cada faixa precisa terminar depois da anterior.'
      }
      if (faixas[i].ouro >= faixas[i - 1].ouro) {
        return 'Faixa mais tarde precisa pagar menos ouro que a anterior.'
      }
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
