/**
 * Banco de frases das notificacoes.
 *
 * Vive em codigo, nao em tabela: e texto, muda junto com o produto e nao
 * precisa de tela de administracao. A variante e escolhida por hash do id da
 * ocorrencia, entao a mesma ocorrencia sempre gera a mesma frase e ocorrencias
 * diferentes variam. Nada de sorteio: sorteio quebraria reenvio idempotente.
 *
 * Tom: segunda pessoa, nome proprio, um numero concreto, imperativo no fim,
 * duas linhas no maximo. Sem emoji, sem hifen como pontuacao.
 */

export type Toque = 'lembrete' | 'cutucada' | 'noite' | 'consequencia'

export interface Contexto {
  nome: string
  habito: string
  grupo?: string | null
  streak: number
  feitosNoGrupo: number
  totalGrupo: number
  ouro: number
  vida: number
  horas: number
}

export interface Frase {
  titulo: string
  corpo: string
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || 'você'
}

const VARIANTES: Record<Toque, ((c: Contexto) => Frase)[]> = {
  lembrete: [
    (c) => ({
      titulo: `${c.habito} agora, ${primeiroNome(c.nome)}`,
      corpo: `${c.ouro} de ouro esperando por você.`,
    }),
    (c) => ({
      titulo: `Hora de ${c.habito.toLowerCase()}`,
      corpo:
        c.streak > 0
          ? `Sequência de ${c.streak} dias. Mantenha.`
          : `Comece a sequência hoje. Vale ${c.ouro} de ouro.`,
    }),
    (c) => ({
      titulo: `${primeiroNome(c.nome)}, combinamos ${c.habito.toLowerCase()}`,
      corpo: `Dois toques e ${c.ouro} de ouro entram na conta.`,
    }),
  ],
  cutucada: [
    (c) => ({
      titulo:
        c.grupo && c.totalGrupo > 0
          ? `${c.feitosNoGrupo} de ${c.totalGrupo} do ${c.grupo} já foram`
          : `Faltam ${c.horas} horas`,
      corpo:
        c.grupo && c.totalGrupo > 0
          ? `Falta você, ${primeiroNome(c.nome)}.`
          : `${c.habito} continua em aberto. Resolve agora.`,
    }),
    (c) => ({
      titulo: `Faltam ${c.horas} horas para ${c.habito.toLowerCase()}`,
      corpo: `${c.ouro} de ouro ainda em jogo, ${primeiroNome(c.nome)}.`,
    }),
  ],
  noite: [
    (c) => ({
      titulo:
        c.streak > 0
          ? `Sua ofensiva de ${c.streak} dias morre em ${c.horas} horas`
          : `Últimas ${c.horas} horas do dia`,
      corpo: `${c.habito}. Não deixa acabar assim.`,
    }),
    (c) => ({
      titulo: `Última chance hoje, ${primeiroNome(c.nome)}`,
      corpo:
        c.streak > 0
          ? `${c.streak} dias de sequência dependem das próximas ${c.horas} horas.`
          : `${c.habito} ainda dá tempo. ${c.ouro} de ouro.`,
    }),
  ],
  consequencia: [
    (c) => ({
      titulo: 'Perdeu 10 de vida',
      corpo: `${c.habito} ficou para trás e a sequência zerou. Recomeça hoje.`,
    }),
    (c) => ({
      titulo: `Sequência zerada, ${primeiroNome(c.nome)}`,
      corpo: `Restam ${c.vida} de vida. O de hoje ainda dá tempo.`,
    }),
  ],
}

function indicePorSemente(semente: string, total: number) {
  let acumulado = 7
  for (const caractere of semente) {
    acumulado = (acumulado * 31 + caractere.charCodeAt(0)) % 997
  }
  return acumulado % total
}

export function montarCopy(toque: Toque, contexto: Contexto, semente: string): Frase {
  const lista = VARIANTES[toque]
  return lista[indicePorSemente(semente, lista.length)](contexto)
}
