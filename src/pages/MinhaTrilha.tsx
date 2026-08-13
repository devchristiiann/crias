import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Loader2, Palette } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { BarraVida } from '@/components/perfil/BarraVida'
import { CalendarioOfensiva } from '@/components/perfil/CalendarioOfensiva'
import { Trilha } from '@/components/trilha/Trilha'
import { Botao } from '@/components/ui/Botao'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { Folha } from '@/components/ui/Folha'
import { useItensPossuidos } from '@/hooks/useItensPossuidos'
import { usePerfil } from '@/hooks/usePerfil'
import { useTrilha } from '@/hooks/useTrilha'
import { POR_ID, type Peca, pecasDoSlot } from '@/lib/catalogo'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** Aqui a grade mostra o catalogo inteiro, nao so o degrau inicial: depois do
 *  onboarding o usuario tem ouro e a troca cobra o preco de cada personagem.
 *  Agrupado por familia, do mesmo jeito que a Loja organiza a prateleira. */
const PERSONAGENS = pecasDoSlot('personagem')

const FAMILIAS = [
  ...PERSONAGENS.reduce((mapa, p) => {
    mapa.set(p.familia, [...(mapa.get(p.familia) ?? []), p])
    return mapa
  }, new Map<string, Peca[]>()),
]

/** Faixa que o servidor libera de graca na primeira escolha. Acima disso ele
 *  cobra ate no primeiro clique, senao o primeiro clique levava um lendario. */
const FAIXA_INICIAL = 200

/**
 * Quanto a troca custa de verdade, espelhando `trocar_personagem`.
 *
 * Personagem que ja e seu volta de graca. A primeira escolha tambem e de graca,
 * mas so ate a faixa inicial. O servidor cobra de novo por conta propria: isto
 * existe para a tela nao mentir o preco antes do clique.
 */
export function custoDaTroca(id: string, possui: boolean, primeiraEscolha: boolean) {
  const custo = POR_ID.get(id)?.custo ?? 0
  if (possui) return 0
  if (primeiraEscolha && custo <= FAIXA_INICIAL) return 0
  return custo
}

/** Se a primeira escolha ainda esta de pe. O `custo` que esta RPC devolve e
 *  numero fixo antigo: nao serve mais, cada personagem tem o proprio preco. */
interface InfoPersonagem {
  gratis: boolean
  ouro: number
  base: string
}

function useInfoPersonagem(usuarioId: string | undefined) {
  return useQuery({
    queryKey: ['personagem', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<InfoPersonagem> => {
      const { data, error } = await supabase.rpc('info_personagem')
      if (error) throw error
      return data as InfoPersonagem
    },
  })
}

export function MinhaTrilha() {
  const { data: perfil, isPending, isError, refetch } = usePerfil()
  const { data: trilha } = useTrilha()
  const { data: info } = useInfoPersonagem(perfil?.id)
  const { data: possuidos } = useItensPossuidos()
  const [trocandoAparencia, setTrocandoAparencia] = useState(false)

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

  // O menor preco entre os que faltam. Quem ja tem tudo, ou ainda nao gastou a
  // primeira escolha, nao ve preco nenhum no botao.
  const faltando = possuidos ? PERSONAGENS.filter((p) => !possuidos.has(p.id)) : []
  const maisBarato = faltando.length > 0 ? Math.min(...faltando.map((p) => p.custo)) : null

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
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <BarraVida vida={perfil.vida} />
      </div>

      {/* O preco aparece no proprio botao: ninguem abre a folha sem saber que a
          troca tem custo. Como cada personagem cobra o seu, o botao mostra o
          menor deles, nao um numero unico. */}
      <Botao
        variante="secundario"
        className="w-full justify-between"
        onClick={() => setTrocandoAparencia(true)}
      >
        <span className="flex items-center gap-2">
          <Palette className="size-4" />
          Trocar personagem
        </span>
        {info && !info.gratis && maisBarato !== null && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <Coins className="size-4" />a partir de {maisBarato}
          </span>
        )}
      </Botao>

      <CalendarioOfensiva diasProdutivos={dias} />

      {/* A chave zera a previa quando o personagem vestido muda. Sem ela a folha
          reabre depois da troca com o boneco antigo em destaque, oferecendo
          desfazer o que o usuario acabou de comprar. */}
      <FolhaAparencia
        key={perfil.avatar_base}
        aberta={trocandoAparencia}
        aoFechar={() => setTrocandoAparencia(false)}
        baseAtual={perfil.avatar_base}
        itemEquipado={perfil.item_equipado}
        info={info}
        possuidos={possuidos}
        ouro={perfil.ouro}
      />
    </section>
  )
}

/**
 * Trocar o boneco depois do onboarding.
 *
 * Antes a escolha acontecia uma vez so, no cadastro, e ficava travada para
 * sempre: quem se arrependia nao tinha caminho nenhum de volta.
 *
 * Hoje custa ouro, entao tocar no personagem apenas seleciona: quem debita e o
 * botao de confirmar, que carrega o preco escrito. Cobrar no toque da grade
 * tirava ouro de quem so estava olhando as opcoes.
 */
function FolhaAparencia({
  aberta,
  aoFechar,
  baseAtual,
  itemEquipado,
  info,
  possuidos,
  ouro,
}: {
  aberta: boolean
  aoFechar: () => void
  baseAtual: string
  itemEquipado: string | null
  info: InfoPersonagem | undefined
  possuidos: Set<string> | undefined
  /** Vem do perfil, nao da consulta de preco: e o mesmo numero do topo da tela
   *  e do menu, e duas fontes de ouro na mesma folha divergem na hora errada. */
  ouro: number
}) {
  const cliente = useQueryClient()
  const [erro, setErro] = useState<string | null>(null)
  const [escolhida, setEscolhida] = useState(baseAtual)

  const trocar = useMutation({
    mutationFn: async (base: string) => {
      const { data, error } = await supabase.rpc('trocar_personagem', { p_base: base })
      if (error) throw error
      if (data?.error === 'ouro_insuficiente') {
        throw new Error('Ouro insuficiente para este personagem.')
      }
      if (data?.error) throw new Error('Não deu para trocar agora. Tente de novo.')
    },
    onSuccess: () => {
      setErro(null)
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['personagem'] })
      // A troca compra o personagem: sem isto a Loja e o proprio preco desta
      // folha continuam dizendo que ele nao e seu.
      cliente.invalidateQueries({ queryKey: ['itens'] })
      aoFechar()
    },
    onError: (e: Error) => setErro(e.message),
  })

  const pronto = Boolean(info) && Boolean(possuidos)
  const possuiEscolhida = possuidos?.has(escolhida) ?? false
  const custo = custoDaTroca(escolhida, possuiEscolhida, info?.gratis ?? false)
  const mudou = escolhida !== baseAtual
  const falta = custo - ouro

  // Fechar sem confirmar descarta a previa. Sem isso a folha reabre com outro
  // personagem em destaque e o botao de cobrar ja liberado.
  function fechar() {
    setEscolhida(baseAtual)
    setErro(null)
    aoFechar()
  }

  return (
    <Folha aberta={aberta} aoFechar={fechar} titulo="Trocar personagem">
      <div className="space-y-4">
        {FAMILIAS.map(([familia, pecas]) => (
          <div key={familia} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {familia}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {pecas.map((p) => {
                const seu = possuidos?.has(p.id) ?? false
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={seu ? p.nome : `${p.nome}, ${p.custo} de ouro`}
                    aria-pressed={escolhida === p.id}
                    onClick={() => setEscolhida(p.id)}
                    className={cn(
                      'flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border-2 bg-card py-2',
                      escolhida === p.id ? 'border-primary' : 'border-border',
                    )}
                  >
                    <Avatar base={p.id} item={itemEquipado} tamanho={44} />
                    {!seu && (
                      <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-warning">
                        <Coins className="size-3" />
                        {p.custo}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Preco e confirmacao grudam no rodape da folha: com 36 personagens na
            grade, um botao no fim da rolagem some da tela na hora de decidir.
            A margem negativa engole o respiro do rodape da Folha, senao a
            grade continua aparecendo numa fresta por baixo do botao. */}
        <div
          className="sticky space-y-3 border-t border-border bg-card pt-3"
          style={{
            bottom: 'calc(-1rem - env(safe-area-inset-bottom))',
            paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
          }}
        >
          <p className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {custo > 0
                ? `Custa ${custo} de ouro`
                : possuiEscolhida
                  ? 'Já é seu, troca de graça'
                  : 'Primeira escolha, de graça'}
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-warning">
              <Coins className="size-4" />
              {ouro}
            </span>
          </p>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <Botao
            tamanho="lg"
            className="w-full"
            disabled={!mudou || falta > 0 || !pronto}
            carregando={trocar.isPending}
            onClick={() => trocar.mutate(escolhida)}
          >
            {!mudou
              ? 'Escolha outro personagem'
              : falta > 0
                ? `Faltam ${falta} de ouro`
                : custo > 0
                  ? `Trocar por ${custo} de ouro`
                  : 'Trocar personagem'}
          </Botao>
        </div>
      </div>
    </Folha>
  )
}
