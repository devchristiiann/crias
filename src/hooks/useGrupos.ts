import { useQuery } from '@tanstack/react-query'
import { hojeSP } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

/**
 * Criterio unico do ranking: soma da ofensiva atual de todos os desafios do
 * grupo. Empate desempata por nome, e as duas telas usam esta mesma funcao,
 * senao a mesma pessoa apareceria em posicoes diferentes na lista e no detalhe.
 */
function porOfensiva(
  a: { nome: string; streakTotal: number },
  b: { nome: string; streakTotal: number },
): number {
  return b.streakTotal - a.streakTotal || a.nome.localeCompare(b.nome, 'pt-BR')
}

/**
 * Validade da URL assinada da capa. Curta porque o bucket e privado e o link
 * assinado vale para quem o tiver em maos, mas maior que o cache da consulta,
 * senao a imagem quebra na tela sem nenhuma nova busca acontecer.
 */
const SEGUNDOS_URL_CAPA = 600

/**
 * Assina em lote. Uma lista de dez grupos com uma chamada por card sao dez idas
 * ao servidor antes da primeira imagem aparecer.
 */
async function assinarCapas(caminhos: string[]): Promise<Map<string, string>> {
  const url = new Map<string, string>()
  if (caminhos.length === 0) return url

  const { data, error } = await supabase.storage
    .from('grupos')
    .createSignedUrls(caminhos, SEGUNDOS_URL_CAPA)
  // Capa e enfeite: falhar aqui nao pode derrubar a lista de grupos.
  if (error) return url

  for (const item of data ?? []) {
    if (item.signedUrl && item.path) url.set(item.path, item.signedUrl)
  }
  return url
}

export interface ResumoGrupo {
  id: string
  nome: string
  codigo: string
  membros: number
  desafios: number
  /** Posicao do usuario no ranking do grupo. Null se ele nao aparecer na lista. */
  posicao: number | null
  /** URL assinada da capa. Null quando o grupo nao tem foto. */
  fotoUrl: string | null
}

interface LinhaGrupoLista {
  id: string
  nome: string
  codigo_convite: string
  foto_path: string | null
  group_members: { user_id: string; profiles: { nome: string } | null }[] | null
  habits: { id: string; streaks: { user_id: string; atual: number }[] | null }[] | null
}

export function useGrupos() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['grupo', 'lista', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<ResumoGrupo[]> => {
      // A ofensiva vem aninhada na mesma consulta de propósito: da para calcular
      // a posicao sem nenhuma ida extra ao servidor.
      // ponytail: o volume cresce com grupos x desafios x membros. Se passar de
      // alguns milhares de linhas, o certo e uma RPC que ja devolve o agregado.
      const { data, error } = await supabase
        .from('groups')
        .select(
          'id, nome, codigo_convite, foto_path, group_members(user_id, profiles(nome)), habits(id, streaks(user_id, atual))',
        )
        .eq('habits.ativo', true)
        // Habito de perda nao gera ocorrencia nem rende ouro: ninguem faz
        // check-in nele, entao ele nao pode entrar na contagem de desafios.
        .eq('habits.tipo', 'bom')
        .order('criado_em', { ascending: true })
      if (error) throw error

      // O PostgREST devolve o relacionamento para um so como objeto, mas sem os
      // tipos gerados o TypeScript infere array. O cast fica aqui, na fronteira.
      const linhas = (data ?? []) as unknown as LinhaGrupoLista[]

      const capas = await assinarCapas(
        linhas.map((g) => g.foto_path).filter((c): c is string => Boolean(c)),
      )

      return linhas.map((g) => {
        // Mesmo descarte que `useGrupo` faz: membro sem perfil embutido nao entra
        // no ranking, entao tambem nao pode entrar na contagem. Contar diferente
        // aqui fazia o card dizer "5 membros" e o detalhe mostrar 4, e alguem
        // achar que tinha gente saindo do grupo sozinha.
        const membros = (g.group_members ?? []).filter((m) => m.profiles !== null)
        const desafios = g.habits ?? []

        const ofensiva = new Map<string, number>()
        for (const d of desafios) {
          for (const s of d.streaks ?? []) {
            ofensiva.set(s.user_id, (ofensiva.get(s.user_id) ?? 0) + s.atual)
          }
        }

        const tabela = membros
          .map((m) => ({
            id: m.user_id,
            nome: m.profiles?.nome ?? '',
            streakTotal: ofensiva.get(m.user_id) ?? 0,
          }))
          .sort(porOfensiva)

        const indice = tabela.findIndex((m) => m.id === usuarioId)

        return {
          id: g.id,
          nome: g.nome,
          codigo: g.codigo_convite,
          membros: membros.length,
          desafios: desafios.length,
          posicao: indice >= 0 ? indice + 1 : null,
          fotoUrl: (g.foto_path && capas.get(g.foto_path)) || null,
        }
      })
    },
  })
}

export interface MembroGrupo {
  id: string
  nome: string
  avatarBase: string
  itemEquipado: string | null
  cenarioEquipado: string | null
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
    cenario_equipado: string | null
  } | null
}

export interface DetalheGrupo {
  id: string
  nome: string
  codigo: string
  donoId: string
  /** Grupo que exige foto obriga comprovacao no check-in de todo desafio dele. */
  exigeFoto: boolean
  /** URL assinada da capa. Null quando o grupo nao tem foto. */
  fotoUrl: string | null
  membros: MembroGrupo[]
  desafios: { id: string; titulo: string; icone: string; ouroBase: number }[]
  feed: { id: string; usuarioId: string; titulo: string; feitoEm: string }[]
}

export function useGrupo(grupoId: string | undefined) {
  return useQuery({
    queryKey: ['grupo', grupoId],
    enabled: Boolean(grupoId),
    queryFn: async (): Promise<DetalheGrupo> => {
      // Grupo e desafios so dependem do id da rota, entao vao juntos.
      const [{ data: grupo, error }, { data: desafios, error: erroDesafios }] = await Promise.all([
        supabase
          .from('groups')
          .select(
            'id, nome, codigo_convite, dono_id, exige_foto, foto_path, group_members(user_id, profiles(id, nome, avatar_base, item_equipado, cenario_equipado))',
          )
          .eq('id', grupoId!)
          .single(),
        supabase
          .from('habits')
          .select('id, titulo, icone, ouro_base')
          .eq('group_id', grupoId!)
          .eq('ativo', true)
          // Mesmo filtro da lista: habito de perda cobra em vez de render, e a
          // lista mostraria "{ouroBase} ouro" num item que nao aceita check-in.
          .eq('tipo', 'bom'),
      ])
      if (error) throw error
      if (erroDesafios) throw erroDesafios

      const ids = (desafios ?? []).map((d) => d.id)
      const concluidosPorUsuario = new Map<string, number>()
      const streakPorUsuario = new Map<string, number>()
      const feed: DetalheGrupo['feed'] = []

      if (ids.length > 0) {
        // As tres dependem so dos ids dos desafios, entao vao na mesma rodada.
        const [rHoje, rFeed, rStreaks] = await Promise.all([
          // O placar de hoje e filtrado no servidor. Contar a partir do feed
          // limitado dava numero errado assim que o grupo passava de 50 feitos.
          supabase
            .from('occurrences')
            .select('user_id')
            .in('habit_id', ids)
            .eq('status', 'feito')
            .eq('data_sp', hojeSP()),
          supabase
            .from('occurrences')
            .select('id, user_id, habit_id, feito_em')
            .in('habit_id', ids)
            .eq('status', 'feito')
            .not('feito_em', 'is', null)
            .order('feito_em', { ascending: false })
            .limit(20),
          supabase.from('streaks').select('user_id, atual').in('habit_id', ids),
        ])

        // Falhar aqui em silencio zeraria o ranking inteiro sem ninguem notar.
        if (rHoje.error) throw rHoje.error
        if (rFeed.error) throw rFeed.error
        if (rStreaks.error) throw rStreaks.error

        for (const o of rHoje.data ?? []) {
          concluidosPorUsuario.set(o.user_id, (concluidosPorUsuario.get(o.user_id) ?? 0) + 1)
        }
        for (const s of rStreaks.data ?? []) {
          streakPorUsuario.set(s.user_id, (streakPorUsuario.get(s.user_id) ?? 0) + s.atual)
        }

        const titulos = new Map((desafios ?? []).map((d) => [d.id, d.titulo]))
        for (const o of rFeed.data ?? []) {
          feed.push({
            id: o.id,
            usuarioId: o.user_id,
            titulo: titulos.get(o.habit_id) ?? 'Desafio',
            feitoEm: o.feito_em,
          })
        }
      }

      const capas = await assinarCapas(grupo.foto_path ? [grupo.foto_path] : [])

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
            cenarioEquipado: p.cenario_equipado,
            concluidosHoje: concluidosPorUsuario.get(p.id) ?? 0,
            streakTotal: streakPorUsuario.get(p.id) ?? 0,
          }
        })
        .filter((m): m is MembroGrupo => m !== null)
        .sort(porOfensiva)

      return {
        id: grupo.id,
        nome: grupo.nome,
        codigo: grupo.codigo_convite,
        donoId: grupo.dono_id,
        exigeFoto: Boolean(grupo.exige_foto),
        fotoUrl: (grupo.foto_path && capas.get(grupo.foto_path)) || null,
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
