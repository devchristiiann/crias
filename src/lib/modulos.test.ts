import { describe, expect, it } from 'vitest'
import {
  configSchema,
  erroConfig,
  estadoFaixa,
  faixaVigente,
  type ConfigHorario,
} from './modulos'

const ACORDAR: ConfigHorario = {
  faixas: [
    { ate: '06:00', ouro: 10 },
    { ate: '07:00', ouro: 7 },
    { ate: '08:00', ouro: 4 },
  ],
}

// Faixa depois da meia noite: quem dorme 00h30 e a maioria do publico.
const DORMIR: ConfigHorario = {
  faixas: [
    { ate: '22:00', ouro: 10 },
    { ate: '23:00', ouro: 7 },
    { ate: '00:30', ouro: 4 },
  ],
}

/** Instante com hora civil de Sao Paulo, independente do fuso de quem roda. */
function emSP(hhmm: string, dia = '2026-08-13') {
  return new Date(`${dia}T${hhmm}:00-03:00`)
}

describe('configSchema', () => {
  it('aceita config vazia do modulo livre', () => {
    expect(configSchema.safeParse({}).success).toBe(true)
  })

  it('aceita faixas de horario', () => {
    expect(configSchema.safeParse(ACORDAR).success).toBe(true)
  })

  it('aceita config de agua', () => {
    expect(configSchema.safeParse({ vezes: 5, lembretes: ['08:00', '11:00'] }).success).toBe(true)
  })

  it('aceita agua sem nenhum lembrete', () => {
    expect(configSchema.safeParse({ vezes: 2, lembretes: [] }).success).toBe(true)
  })

  it('rejeita ouro crescente entre faixas', () => {
    const config = { faixas: [{ ate: '06:00', ouro: 4 }, { ate: '07:00', ouro: 10 }] }
    expect(configSchema.safeParse(config).success).toBe(false)
  })

  it('rejeita ouro repetido entre faixas', () => {
    const config = { faixas: [{ ate: '06:00', ouro: 5 }, { ate: '07:00', ouro: 5 }] }
    expect(configSchema.safeParse(config).success).toBe(false)
  })

  it('rejeita mais de quatro faixas', () => {
    const config = {
      faixas: [
        { ate: '05:00', ouro: 10 },
        { ate: '06:00', ouro: 8 },
        { ate: '07:00', ouro: 6 },
        { ate: '08:00', ouro: 4 },
        { ate: '09:00', ouro: 2 },
      ],
    }
    expect(configSchema.safeParse(config).success).toBe(false)
  })

  it('rejeita lista de faixas vazia', () => {
    expect(configSchema.safeParse({ faixas: [] }).success).toBe(false)
  })

  it('rejeita ouro acima do teto', () => {
    expect(configSchema.safeParse({ faixas: [{ ate: '06:00', ouro: 11 }] }).success).toBe(false)
  })

  it('rejeita horario fora do formato', () => {
    expect(configSchema.safeParse({ faixas: [{ ate: '6h', ouro: 10 }] }).success).toBe(false)
    expect(configSchema.safeParse({ faixas: [{ ate: '25:00', ouro: 10 }] }).success).toBe(false)
  })

  it('rejeita horario repetido', () => {
    const config = { faixas: [{ ate: '06:00', ouro: 10 }, { ate: '06:00', ouro: 4 }] }
    expect(configSchema.safeParse(config).success).toBe(false)
  })

  it('rejeita menos de dois copos', () => {
    expect(configSchema.safeParse({ vezes: 1, lembretes: [] }).success).toBe(false)
  })

  it('rejeita mais de dez copos', () => {
    expect(configSchema.safeParse({ vezes: 11, lembretes: [] }).success).toBe(false)
  })

  it('rejeita mais alarmes que copos', () => {
    const config = { vezes: 2, lembretes: ['08:00', '11:00', '14:00'] }
    expect(configSchema.safeParse(config).success).toBe(false)
  })

  it('rejeita alarme fora de ordem', () => {
    expect(configSchema.safeParse({ vezes: 3, lembretes: ['11:00', '08:00'] }).success).toBe(false)
  })

  it('rejeita alarme repetido', () => {
    expect(configSchema.safeParse({ vezes: 3, lembretes: ['08:00', '08:00'] }).success).toBe(false)
  })

  it('rejeita chave estranha no modulo livre', () => {
    expect(configSchema.safeParse({ vezes: 5 }).success).toBe(false)
  })
})

describe('erroConfig', () => {
  it('aprova acordar dentro da janela', () => {
    expect(erroConfig('acordar', ACORDAR)).toBeNull()
  })

  it('aprova dormir com faixa depois da meia noite', () => {
    expect(erroConfig('dormir', DORMIR)).toBeNull()
  })

  it('aprova agua', () => {
    expect(erroConfig('agua', { vezes: 5, lembretes: ['08:00', '20:00'] })).toBeNull()
  })

  it('aprova livre com config vazia', () => {
    expect(erroConfig('livre', {})).toBeNull()
  })

  it('recusa acordar depois do meio-dia', () => {
    expect(erroConfig('acordar', { faixas: [{ ate: '13:00', ouro: 10 }] })).toBeTruthy()
  })

  it('recusa dormir no meio da tarde', () => {
    expect(erroConfig('dormir', { faixas: [{ ate: '15:00', ouro: 10 }] })).toBeTruthy()
  })

  it('explica ouro que sobe na faixa mais tarde', () => {
    const config = { faixas: [{ ate: '06:00', ouro: 4 }, { ate: '07:00', ouro: 10 }] }
    expect(erroConfig('acordar', config)).toBe(
      'Faixa mais tarde precisa pagar menos ouro que a anterior.',
    )
  })

  it('explica faixa fora de ordem', () => {
    const config = { faixas: [{ ate: '07:00', ouro: 10 }, { ate: '06:00', ouro: 4 }] }
    expect(erroConfig('acordar', config)).toBe('Cada faixa precisa terminar depois da anterior.')
  })

  it('recusa dormir com madrugada antes da noite', () => {
    const config = { faixas: [{ ate: '00:30', ouro: 10 }, { ate: '22:00', ouro: 4 }] }
    expect(erroConfig('dormir', config)).toBe('Cada faixa precisa terminar depois da anterior.')
  })

  it('recusa lista de faixas vazia', () => {
    expect(erroConfig('acordar', { faixas: [] })).toBe('Escolha de 1 a 4 faixas.')
  })

  it('recusa agua com um copo', () => {
    expect(erroConfig('agua', { vezes: 1, lembretes: [] })).toBe('Escolha de 2 a 10 copos.')
  })

  it('recusa mais alarmes que copos', () => {
    const config = { vezes: 2, lembretes: ['08:00', '11:00', '14:00'] }
    expect(erroConfig('agua', config)).toBe('No máximo um alarme por copo.')
  })

  it('nao usa hifen como pontuacao', () => {
    const mensagens = [
      erroConfig('acordar', { faixas: [] }),
      erroConfig('acordar', { faixas: [{ ate: '13:00', ouro: 10 }] }),
      erroConfig('agua', { vezes: 1, lembretes: [] }),
    ].join(' ')
    expect(mensagens).not.toMatch(/ [-–—] /)
  })
})

describe('faixaVigente', () => {
  it('antes da primeira faixa vale a primeira', () => {
    expect(faixaVigente('acordar', ACORDAR, emSP('05:00'))).toEqual({ ate: '06:00', ouro: 10 })
  })

  it('dentro da segunda faixa vale a segunda', () => {
    expect(faixaVigente('acordar', ACORDAR, emSP('06:30'))).toEqual({ ate: '07:00', ouro: 7 })
  })

  it('na borda da faixa ainda vale a faixa', () => {
    expect(faixaVigente('acordar', ACORDAR, emSP('06:00'))).toEqual({ ate: '06:00', ouro: 10 })
  })

  it('na borda da ultima faixa ainda vale a ultima', () => {
    expect(faixaVigente('acordar', ACORDAR, emSP('08:00'))).toEqual({ ate: '08:00', ouro: 4 })
  })

  it('depois da ultima faixa nao vale nada', () => {
    expect(faixaVigente('acordar', ACORDAR, emSP('08:01'))).toBeNull()
  })

  it('dormir de madrugada cai na faixa depois da meia noite', () => {
    expect(faixaVigente('dormir', DORMIR, emSP('23:30'))).toEqual({ ate: '00:30', ouro: 4 })
    expect(faixaVigente('dormir', DORMIR, emSP('00:10'))).toEqual({ ate: '00:30', ouro: 4 })
  })

  it('dormir na borda da madrugada ainda vale', () => {
    expect(faixaVigente('dormir', DORMIR, emSP('00:30'))).toEqual({ ate: '00:30', ouro: 4 })
  })

  it('dormir depois da ultima faixa nao vale nada', () => {
    expect(faixaVigente('dormir', DORMIR, emSP('00:31'))).toBeNull()
  })

  it('dormir no comeco da noite vale a primeira faixa', () => {
    expect(faixaVigente('dormir', DORMIR, emSP('21:00'))).toEqual({ ate: '22:00', ouro: 10 })
  })

  it('dormir fora da janela nao tem faixa', () => {
    // As 10h da manha a tela prometia a faixa das 22:00 e o botao Concluir, e o
    // servidor recusava com `fora_da_faixa`.
    expect(faixaVigente('dormir', DORMIR, emSP('10:00'))).toBeNull()
    expect(faixaVigente('dormir', DORMIR, emSP('06:00'))).toBeNull()
    expect(faixaVigente('dormir', DORMIR, emSP('17:59'))).toBeNull()
  })

  it('dormir na borda de baixo da janela ja vale', () => {
    expect(faixaVigente('dormir', DORMIR, emSP('18:00'))).toEqual({ ate: '22:00', ouro: 10 })
  })

  it('acordar fora da janela nao tem faixa', () => {
    expect(faixaVigente('acordar', ACORDAR, emSP('12:00'))).toBeNull()
  })

  it('modulo sem horario nao tem faixa', () => {
    expect(faixaVigente('livre', {}, emSP('06:00'))).toBeNull()
    expect(faixaVigente('agua', { vezes: 5, lembretes: [] }, emSP('06:00'))).toBeNull()
  })
})

describe('estadoFaixa', () => {
  it('dormir antes da janela ainda vai abrir, com a primeira faixa', () => {
    // As 13h45 a tela dizia "Faixa encerrada" para quem dorme as 23:00. A faixa
    // nao encerrou, ela abre as 18:00 e vale o ouro da primeira.
    expect(estadoFaixa('dormir', DORMIR, emSP('13:45'))).toEqual({
      estado: 'antes',
      faixa: { ate: '22:00', ouro: 10 },
      abre: '18:00',
    })
    expect(estadoFaixa('dormir', DORMIR, emSP('17:59'))?.estado).toBe('antes')
    expect(estadoFaixa('dormir', DORMIR, emSP('06:00'))?.estado).toBe('antes')
  })

  it('dormir dentro da janela esta aberta', () => {
    expect(estadoFaixa('dormir', DORMIR, emSP('18:00'))).toEqual({
      estado: 'aberta',
      faixa: { ate: '22:00', ouro: 10 },
      abre: '18:00',
    })
    expect(estadoFaixa('dormir', DORMIR, emSP('00:10'))?.faixa).toEqual({ ate: '00:30', ouro: 4 })
  })

  it('dormir depois da ultima faixa esta encerrada', () => {
    expect(estadoFaixa('dormir', DORMIR, emSP('00:31'))).toEqual({
      estado: 'encerrada',
      faixa: null,
      abre: '18:00',
    })
  })

  it('acordar de madrugada ja esta aberto', () => {
    expect(estadoFaixa('acordar', ACORDAR, emSP('00:00'))).toEqual({
      estado: 'aberta',
      faixa: { ate: '06:00', ouro: 10 },
      abre: '00:00',
    })
  })

  it('acordar depois da ultima faixa esta encerrado', () => {
    expect(estadoFaixa('acordar', ACORDAR, emSP('08:01'))?.estado).toBe('encerrada')
    expect(estadoFaixa('acordar', ACORDAR, emSP('13:45'))).toEqual({
      estado: 'encerrada',
      faixa: null,
      abre: '00:00',
    })
  })

  it('acordar nunca fica antes de abrir, porque a janela dele comeca 00:00', () => {
    const horas = ['00:00', '05:59', '08:00', '11:59', '12:00', '23:59']
    expect(horas.map((h) => estadoFaixa('acordar', ACORDAR, emSP(h))?.estado)).not.toContain('antes')
  })

  it('modulo sem horario nao tem estado', () => {
    expect(estadoFaixa('livre', {}, emSP('06:00'))).toBeNull()
    expect(estadoFaixa('agua', { vezes: 5, lembretes: [] }, emSP('06:00'))).toBeNull()
    expect(estadoFaixa('acordar', { faixas: [] }, emSP('06:00'))).toBeNull()
  })
})
