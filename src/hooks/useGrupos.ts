import { useQuery } from '@tanstack/react-query'
import { hojeSP } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface ResumoGrupo {
  id: string
  nome: string
  codigo: string
  membros: number
  desafios: number
}

export function useGrupos() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['grupo', 'lista', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<ResumoGrupo[]> => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, nome, codigo_convite, group_members(user_id), habits(id)')
        .order('criado_em', { ascending: true })
      if (error) throw error

      return (data ?? []).map((g) => ({
        id: g.id,
        nome: g.nome,
        codigo: g.codigo_convite,
        membros: (g.group_members ?? []).length,
        desafios: (g.habits ?? []).length,
      }))
    },
  })
}

export interface MembroGrupo {
  id: string
  nome: string
  avatarBase: string
  itemEquipado: string | null
  concluidosHoje: number
  streakTotal: number
}

interface LinhaMembro {
  user_id: string
  profiles: {
    id: string
    nome: string
    avatar_base: string
    item_equipado: string | null
  } | null
}

export interface DetalheGrupo {
  id: string
  nome: string
  codigo: string
  donoId: string
  membros: MembroGrupo[]
  desafios: { id: string; titulo: string; icone: string; ouroBase: number }[]
  feed: { id: string; usuarioId: string; titulo: string; feitoEm: string }[]
}

export function useGrupo(grupoId: string | undefined) {
  return useQuery({
    queryKey: ['grupo', grupoId],
    enabled: Boolean(grupoId),
    queryFn: async (): Promise<DetalheGrupo> => {
      const { data: grupo, error } = await supabase
        .from('groups')
        .select('id, nome, codigo_convite, dono_id, group_members(user_id, profiles(id, nome, avatar_base, item_equipado))')
        .eq('id', grupoId!)
        .single()
      if (error) throw error

      const { data: desafios, error: erroDesafios } = await supabase
        .from('habits')
        .select('id, titulo, icone, ouro_base')
        .eq('group_id', grupoId!)
        .eq('ativo', true)
      if (erroDesafios) throw erroDesafios

      const ids = (desafios ?? []).map((d) => d.id)
      const porUsuario = new Map<string, number>()
      const feed: DetalheGrupo['feed'] = []

      if (ids.length > 0) {
        const { data: ocorrencias, error: erroOcorrencias } = await supabase
          .from('occurrences')
          .select('id, user_id, habit_id, status, feito_em, data_sp')
          .in('habit_id', ids)
          .eq('status', 'feito')
          .order('feito_em', { ascending: false })
          .limit(50)
        if (erroOcorrencias) throw erroOcorrencias

        const titulos = new Map((desafios ?? []).map((d) => [d.id, d.titulo]))
        const hoje = hojeSP()

        for (const o of ocorrencias ?? []) {
          if (o.data_sp === hoje) {
            porUsuario.set(o.user_id, (porUsuario.get(o.user_id) ?? 0) + 1)
          }
          if (feed.length < 20 && o.feito_em) {
            feed.push({
              id: o.id,
              usuarioId: o.user_id,
              titulo: titulos.get(o.habit_id) ?? 'Desafio',
              feitoEm: o.feito_em,
            })
          }
        }
      }

      const streakPorUsuario = new Map<string, number>()
      if (ids.length > 0) {
        const { data: streaks, error: erroStreaks } = await supabase
          .from('streaks')
          .select('user_id, atual')
          .in('habit_id', ids)
        // Falhar aqui em silencio zeraria o ranking inteiro sem ninguem notar.
        if (erroStreaks) throw erroStreaks
        for (const s of streaks ?? []) {
          streakPorUsuario.set(s.user_id, (streakPorUsuario.get(s.user_id) ?? 0) + s.atual)
        }
      }

      // O PostgREST devolve o relacionamento como objeto quando e para um so,
      // mas sem os tipos gerados o TypeScript infere array. O cast fica aqui,
      // na fronteira, e nao espalha `any` pelo resto do arquivo.
      const linhasMembro = (grupo.group_members ?? []) as unknown as LinhaMembro[]

      const membros: MembroGrupo[] = linhasMembro
        .map((m) => {
          const p = m.profiles
          if (!p) return null
          return {
            id: p.id,
            nome: p.nome,
            avatarBase: p.avatar_base,
            itemEquipado: p.item_equipado,
            concluidosHoje: porUsuario.get(p.id) ?? 0,
            streakTotal: streakPorUsuario.get(p.id) ?? 0,
          }
        })
        .filter((m): m is MembroGrupo => m !== null)
        .sort((a, b) => b.streakTotal - a.streakTotal || a.nome.localeCompare(b.nome, 'pt-BR'))

      return {
        id: grupo.id,
        nome: grupo.nome,
        codigo: grupo.codigo_convite,
        donoId: grupo.dono_id,
        membros,
        desafios: (desafios ?? []).map((d) => ({
          id: d.id,
          titulo: d.titulo,
          icone: d.icone,
          ouroBase: d.ouro_base,
        })),
        feed,
      }
    },
  })
}
