import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Coins } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Confirmar } from '@/components/ui/Confirmar'
import { Esqueleto } from '@/components/ui/Esqueleto'
import type { Perfil } from '@/hooks/usePerfil'
import { SPRITES_UI } from '@/lib/catalogo'
import { hojeSP } from '@/lib/data'
import { PRECO_ESCUDO } from '@/lib/modulos'
import { supabase } from '@/lib/supabase'

type Tipo = 'vida' | 'ouro' | 'escudo'

interface Pocao {
  tipo: Tipo
  nome: string
  sprite: string
  efeito: string
  preco: number
  /** Escudo não se usa à mão: ele é consumido sozinho no primeiro vacilo. */
  usavel: boolean
}

/**
 * Preço aqui é só para a tela dizer quanto custa antes do toque. Quem cobra é
 * `comprar_pocao`, com a tabela dela. O escudo reusa `PRECO_ESCUDO` porque é o
 * mesmo produto que a tela do perfil vende: dois números diferentes para a
 * mesma compra seria bug visível em duas telas ao mesmo tempo.
 *
 * A arte sai de `SPRITES_UI` e nunca escrita à mão: lá ela carrega o carimbo de
 * versão do conteúdo, e sem ele redesenhar a poção não mudaria a URL.
 */
const POCOES: Pocao[] = [
  {
    tipo: 'vida',
    nome: 'Poção de vida',
    sprite: SPRITES_UI.pocao,
    efeito: 'Devolve 25 de vida na hora.',
    preco: 120,
    usavel: true,
  },
  {
    tipo: 'ouro',
    nome: 'Poção de ouro',
    sprite: SPRITES_UI.pocaoOuro,
    efeito: 'Dobra o ouro das rotinas de hoje.',
    preco: 250,
    usavel: true,
  },
  {
    tipo: 'escudo',
    nome: 'Escudo',
    sprite: SPRITES_UI.escudo,
    efeito: 'Salva suas ofensivas no primeiro vacilo do dia.',
    preco: PRECO_ESCUDO,
    usavel: false,
  },
]

interface Resposta {
  ok?: boolean
  error?: string
  falta?: number
  ouro?: number
  vida?: number
  restantes?: number
}

interface Acao {
  acao: 'comprar' | 'usar'
  pocao: Pocao
  token: string
}

/**
 * Tradução dos códigos que `comprar_pocao` e `usar_pocao` devolvem dentro de um
 * 200. `ouro_insuficiente` fica de fora porque a mensagem dele carrega o
 * `falta` que o servidor calculou: dizer "sem ouro" sem o número não diz o que
 * fazer.
 */
const ERROS: Record<string, string> = {
  sem_pocao: 'Você não tem essa poção.',
  vida_cheia: 'Sua vida já está cheia.',
  ja_ativo: 'O ouro de hoje já está dobrado.',
}

function mensagem(resposta: Resposta): string {
  if (resposta.error === 'ouro_insuficiente') {
    const falta = resposta.falta ?? 0
    return falta === 1 ? 'Falta 1 de ouro.' : `Faltam ${falta} de ouro.`
  }
  return ERROS[resposta.error ?? ''] ?? 'Não deu para concluir agora. Tente de novo.'
}

/** Só o número que a RPC devolveu. A tela nunca recalcula saldo nem vida. */
function sucesso({ acao, pocao }: Acao, resposta: Resposta): string {
  if (acao === 'comprar') return `Comprou. Ficaram ${resposta.ouro ?? 0} de ouro.`
  if (pocao.tipo === 'vida') return `Usou. Sua vida está em ${resposta.vida ?? 0}.`
  return 'Usou. O ouro das rotinas de hoje está dobrado.'
}

/**
 * Poções: vida, ouro dobrado e escudo.
 *
 * Prateleira própria, e não uma aba da coleção, porque nada aqui se veste nem
 * se coleciona: a peça da coleção tem slot, é única e vira `owned_items`, a
 * poção tem quantidade e é gasta. Enfiar as duas na mesma grade daria uma aba
 * onde "Vestir" não existe e a contagem `seus/total` não significa nada.
 */
export function Pocoes({ perfil, ouro }: { perfil: Perfil | undefined; ouro: number | null }) {
  const cliente = useQueryClient()
  // O token nasce no toque que abre a confirmação, junto com a ação, nunca
  // dentro de `mutationFn`. Assim toda retentativa daquele mesmo toque (retry
  // do React Query, ou um novo Confirmar depois de erro de rede) manda o mesmo
  // token e a RPC devolve o resultado guardado em vez de cobrar de novo.
  const [confirmando, setConfirmando] = useState<Acao | null>(null)
  // Comprar e usar gastam sem entregar nada na tela: sem este aviso o único
  // sinal era um contador mudando, e a pessoa ficava adivinhando se funcionou.
  const [aviso, setAviso] = useState<{ tipo: Tipo; texto: string } | null>(null)

  useEffect(() => {
    if (!aviso) return
    const relogio = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(relogio)
  }, [aviso])

  const agir = useMutation({
    mutationFn: async ({ acao, pocao, token }: Acao): Promise<Resposta> => {
      const { data, error } = await supabase.rpc(
        acao === 'comprar' ? 'comprar_pocao' : 'usar_pocao',
        { p_tipo: pocao.tipo, p_token: token },
      )
      if (error) throw error
      const resposta = data as Resposta
      if (resposta?.error) throw new Error(mensagem(resposta))
      return resposta
    },
    onSuccess: (resposta, variaveis) => {
      // Ouro, contadores de poção e vida moram todos no perfil, e é só isso que
      // a compra move. Invalidar `['grupo']` aqui refaria todas as páginas já
      // roladas do feed, com todas as fotos reassinadas, por uma compra que não
      // muda uma linha do que o grupo vê.
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      // A poção de vida grava evento `pocao` e devolve 25 de vida. Sem esta
      // chave a barra enchia e a trilha abaixo dela não dizia de onde veio.
      cliente.invalidateQueries({ queryKey: ['vida'] })
      setAviso({ tipo: variaveis.pocao.tipo, texto: sucesso(variaveis, resposta) })
      setConfirmando(null)
    },
  })

  const abrir = (acao: 'comprar' | 'usar', pocao: Pocao) => {
    agir.reset()
    setConfirmando({ acao, pocao, token: crypto.randomUUID() })
  }

  const quantidade = (tipo: Tipo): number | null => {
    if (!perfil) return null
    if (tipo === 'vida') return perfil.pocoes_vida
    if (tipo === 'ouro') return perfil.pocoes_ouro
    return perfil.escudos
  }

  // O servidor é quem confere de verdade. A tela só evita prometer um Usar que
  // voltaria como `ja_ativo`.
  const dobradoHoje = perfil?.ouro_dobrado_em === hojeSP()

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Poções
      </h2>

      <ul className="space-y-2">
        {POCOES.map((p) => {
          const tem = quantidade(p.tipo)
          const pode = ouro !== null && ouro >= p.preco
          const ativa = p.tipo === 'ouro' && dobradoHoje
          const mostraUsar = p.usavel && tem !== null && tem > 0

          return (
            <li key={p.tipo} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <img
                    src={p.sprite}
                    alt=""
                    aria-hidden
                    data-pixel
                    draggable={false}
                    className="size-8 select-none"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{p.nome}</span>
                  <span className="block text-xs text-muted-foreground">{p.efeito}</span>
                  {/* Largura reservada: sem ela a linha encolhe quando o
                      esqueleto vira número e o bloco pisca de tamanho. */}
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    Você tem
                    <span className="inline-block min-w-[2ch] tabular-nums">
                      {tem === null ? <Esqueleto className="h-3 w-full" /> : tem}
                    </span>
                  </span>
                  {ativa && <span className="block text-xs text-success">Ativa hoje.</span>}
                </span>
              </div>

              <div className="mt-3 flex gap-2">
                <Botao
                  variante={pode ? 'primario' : 'secundario'}
                  className="flex-1"
                  disabled={!pode}
                  aria-label={`Comprar ${p.nome} por ${p.preco} de ouro`}
                  onClick={() => abrir('comprar', p)}
                >
                  <Coins className="size-4" />
                  {p.preco}
                </Botao>

                {mostraUsar && (
                  <Botao
                    variante="secundario"
                    className="flex-1"
                    disabled={ativa}
                    aria-label={`Usar ${p.nome}`}
                    onClick={() => abrir('usar', p)}
                  >
                    Usar
                  </Botao>
                )}
              </div>

              {aviso?.tipo === p.tipo && (
                <p
                  role="status"
                  className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-sm text-success"
                >
                  <Check className="size-4 shrink-0" />
                  {aviso.texto}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <Confirmar
        aberta={confirmando !== null}
        aoFechar={() => setConfirmando(null)}
        titulo={
          confirmando
            ? `${confirmando.acao === 'comprar' ? 'Comprar' : 'Usar'} ${confirmando.pocao.nome}?`
            : ''
        }
        detalhe={
          confirmando?.acao === 'comprar'
            ? `Custa ${confirmando.pocao.preco} de ouro.`
            : confirmando?.pocao.efeito
        }
        rotuloConfirmar={confirmando?.acao === 'comprar' ? 'Comprar' : 'Usar'}
        carregando={agir.isPending}
        erro={agir.error?.message ?? null}
        aoConfirmar={() => confirmando && agir.mutate(confirmando)}
      />
    </div>
  )
}
