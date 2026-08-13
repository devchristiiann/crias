import { useQuery } from '@tanstack/react-query'
import { hojeSP, somarDias } from '@/lib/data'
import type { RegraFrequencia } from '@/lib/frequencia'
import type { ConfigModulo, Modulo } from '@/lib/modulos'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface OcorrenciaHoje {
  id: string
  data_sp: string
  vence_em: string
  /**
   * `em_validacao` e a declaracao esperando o grupo votar. Nada foi pago, a
   * ofensiva nao andou e a vida nao foi cobrada: e um quarto estado, nao um
   * "feito" com enfeite.
   */
  status: 'pendente' | 'feito' | 'atrasado' | 'em_validacao'
  vezes_feitas: number
  vezes_alvo: number
  foto_path: string | null
  /** Minutos de uso declarados. Só o módulo de tela preenche. */
  minutos_declarados: number | null
  /** Prazo de 48h da enquete. Null fora de `em_validacao`. */
  validacao_ate: string | null
  /**
   * Dia da última marcação, em São Paulo. Só "N vezes por semana" e "N vezes por
   * mês" olham para isto: a ocorrência cobre a janela inteira e vale uma
   * marcação por dia. Sem esta coluna o botão prometia "Marcar 2 de 3" e só
   * descobria `ja_marcado_hoje` no clique.
   */
  ultima_marcacao_sp: string | null
  habitId: string
  titulo: string
  icone: string
  ouroBase: number
  regra: RegraFrequencia
  /** Tipo de rotina. Decide o corpo da folha e o que a tela mostra de faixa. */
  modulo: Modulo
  /** Faixas de horario, copos por dia. Quem paga e o servidor, isto so desenha. */
  config: ConfigModulo
  lembrete: string | null
  grupoId: string | null
  grupoNome: string | null
  /** Dono do grupo. So ele pode excluir a rotina de grupo. Null em rotina individual. */
  grupoDonoId: string | null
  /** Grupo que so aceita check-in com foto. A trava de verdade e a RPC `check_in`. */
  grupoExigeFoto: boolean
  streak: number
  feitosNoGrupo: number
  totalGrupo: number
}

interface LinhaOcorrencia {
  id: string
  data_sp: string
  vence_em: string
  status: OcorrenciaHoje['status']
  vezes_feitas: number
  vezes_alvo: number
  foto_path: string | null
  minutos_declarados: number | null
  validacao_ate: string | null
  ultima_marcacao_sp: string | null
  habits: {
    id: string
    titulo: string
    icone: string
    ouro_base: number
    regra_frequencia: RegraFrequencia
    modulo: Modulo
    config: ConfigModulo
    lembrete_hora: string | null
    group_id: string | null
    groups: { nome: string; dono_id: string; exige_foto: boolean } | null
  }
}

/**
 * Ordem da lista: o que ainda depende da pessoa vem primeiro, depois o que
 * depende do grupo, e por ultimo o que ja acabou.
 */
const ORDEM_STATUS: Record<OcorrenciaHoje['status'], number> = {
  pendente: 0,
  atrasado: 0,
  em_validacao: 1,
  feito: 2,
}

export function useOcorrenciasHoje() {
  const { usuarioId } = useSessao()
  const hoje = hojeSP()
  // Dormir cedo com faixa de madrugada vence no dia seguinte: quem marca 00h15
  // ja virou o dia no relogio, e a ocorrencia certa e a de ontem, que continua
  // aberta ate 00h30. Rotina comum de ontem venceu as 23:59 e nao passa no
  // filtro de `vence_em`, entao a tela nao vira lista de pendencia velha.
  const ontem = somarDias(hoje, -1)
  const datas = [ontem, hoje]

  return useQuery({
    queryKey: ['ocorrencias', usuarioId, hoje],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<OcorrenciaHoje[]> => {
      const { data, error } = await supabase
        .from('occurrences')
        .select(
          `id, data_sp, vence_em, status, vezes_feitas, vezes_alvo, foto_path, ultima_marcacao_sp,
           minutos_declarados, validacao_ate,
           habits!inner ( id, titulo, icone, ouro_base, regra_frequencia, modulo, config,
                          lembrete_hora, group_id, groups ( nome, dono_id, exige_foto ) )`,
        )
        .eq('user_id', usuarioId!)
        .in('data_sp', datas)
      if (error) throw error

      const agora = Date.now()
      const abertas = ((data ?? []) as unknown as LinhaOcorrencia[]).filter(
        (l) => l.data_sp === hoje || new Date(l.vence_em).getTime() > agora,
      )

      // Entre 00h00 e o vencimento da madrugada as duas ocorrencias de dormir
      // estao abertas ao mesmo tempo, e duas fichas iguais na tela nao dizem
      // qual delas conta. Vale a que vence primeiro, que e a da noite passada.
      const vigentes = new Map<string, LinhaOcorrencia>()
      for (const l of abertas) {
        const atual = vigentes.get(l.habits.id)
        const vence = new Date(l.vence_em).getTime()
        if (!atual || vence < new Date(atual.vence_em).getTime()) vigentes.set(l.habits.id, l)
      }
      const linhas = [...vigentes.values()]
      if (linhas.length === 0) return []

      const { data: streaks, error: erroStreak } = await supabase
        .from('streaks')
        .select('habit_id, atual')
        .eq('user_id', usuarioId!)
      if (erroStreak) throw erroStreak
      const porHabito = new Map((streaks ?? []).map((s) => [s.habit_id, s.atual]))

      const habitosDeGrupo = linhas.filter((l) => l.habits.group_id).map((l) => l.habits.id)
      const progresso = new Map<string, { feitos: number; total: number }>()

      if (habitosDeGrupo.length > 0) {
        // RLS permite ler as ocorrencias dos colegas em habito de grupo.
        // E dai que sai o "4 de 6 do grupo ja foram".
        const { data: doGrupo, error: erroGrupo } = await supabase
          .from('occurrences')
          .select('habit_id, status, data_sp')
          .in('habit_id', habitosDeGrupo)
          .in('data_sp', datas)
        if (erroGrupo) throw erroGrupo

        // A chave carrega o dia junto: somar os dois dias no mesmo balde diria
        // "8 de 12 do grupo" num grupo de 6 pessoas.
        for (const linha of doGrupo ?? []) {
          const chave = `${linha.habit_id}|${linha.data_sp}`
          const atual = progresso.get(chave) ?? { feitos: 0, total: 0 }
          atual.total += 1
          if (linha.status === 'feito') atual.feitos += 1
          progresso.set(chave, atual)
        }
      }

      return linhas
        .map((l): OcorrenciaHoje => {
          const p = progresso.get(`${l.habits.id}|${l.data_sp}`) ?? { feitos: 0, total: 0 }
          return {
            id: l.id,
            data_sp: l.data_sp,
            vence_em: l.vence_em,
            status: l.status,
            vezes_feitas: l.vezes_feitas,
            vezes_alvo: l.vezes_alvo,
            foto_path: l.foto_path,
            minutos_declarados: l.minutos_declarados,
            validacao_ate: l.validacao_ate,
            ultima_marcacao_sp: l.ultima_marcacao_sp,
            habitId: l.habits.id,
            titulo: l.habits.titulo,
            icone: l.habits.icone,
            ouroBase: l.habits.ouro_base,
            regra: l.habits.regra_frequencia,
            modulo: l.habits.modulo,
            config: l.habits.config,
            lembrete: l.habits.lembrete_hora,
            grupoId: l.habits.group_id,
            grupoNome: l.habits.groups?.nome ?? null,
            grupoDonoId: l.habits.groups?.dono_id ?? null,
            grupoExigeFoto: l.habits.groups?.exige_foto ?? false,
            streak: porHabito.get(l.habits.id) ?? 0,
            feitosNoGrupo: p.feitos,
            totalGrupo: p.total,
          }
        })
        .sort((a, b) => {
          // Rank, e nao comparacao de igualdade: com quatro status, um
          // `a.status !== b.status` devolvia -1 nos dois sentidos entre pendente
          // e atrasado, e a ordem saia diferente a cada rodada do `sort`.
          if (ORDEM_STATUS[a.status] !== ORDEM_STATUS[b.status]) {
            return ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status]
          }
          const ha = a.lembrete ?? '99:99'
          const hb = b.lembrete ?? '99:99'
          if (ha !== hb) return ha < hb ? -1 : 1
          return a.titulo.localeCompare(b.titulo, 'pt-BR')
        })
    },
  })
}
