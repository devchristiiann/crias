import { Coins } from 'lucide-react'
import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Folha } from '@/components/ui/Folha'
import { useBrindePendente, useMarcarBrindeVisto } from '@/hooks/useBrinde'
import { SPRITES_UI } from '@/lib/catalogo'
import { cn } from '@/lib/utils'

/**
 * O caminho vem de `SPRITES_UI` e não escrito aqui porque lá ele carrega o
 * carimbo de versão do conteúdo. Escrito à mão, redesenhar a poção não mudaria
 * a URL e o aparelho continuaria mostrando o desenho antigo.
 */
const { pocao: POCAO } = SPRITES_UI

/**
 * Entrada em escala e opacidade, e depois cada prêmio aparecendo em sequência.
 * Tudo com `tailwindcss-animate`, que já é dependência do projeto: nenhuma
 * biblioteca nova e nenhum keyframe novo entram por causa desta tela.
 *
 * `fill-mode-both` acompanha todo atraso. Sem ele o elemento aparece pronto,
 * espera o atraso passar e só então salta para o quadro zero da animação, que é
 * um pisca-pisca no lugar de uma entrada.
 *
 * `motion-reduce:animate-none` em cada elemento animado: com movimento
 * reduzido o conteúdo simplesmente aparece, no estado final, sem nenhum passo
 * intermediário nem opacidade presa em zero.
 */
const ENTRADA = 'animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none'
const PREMIO = 'animate-in fade-in zoom-in-50 duration-500 fill-mode-both motion-reduce:animate-none'

function pocoes(quantidade: number): string {
  return quantidade === 1 ? '1 poção de vida' : `${quantidade} poções de vida`
}

/**
 * Aviso de brinde, montado na casca para aparecer em qualquer tela do app.
 *
 * Ele avisa, nunca paga: o ouro e a poção já foram creditados pelo servidor no
 * instante em que a linha de `brindes` nasceu. Um botão de resgatar aqui
 * pagaria de novo, e por isso não existe.
 *
 * Fechar não pede confirmação: não gasta nada e não apaga nada.
 */
export function ModalBrinde() {
  const { data: brinde } = useBrindePendente()
  const marcar = useMarcarBrindeVisto()
  // A chave que a pessoa já dispensou nesta sessão. Guardar a chave, e não um
  // booleano, é o que deixa um segundo brinde pendente abrir depois do primeiro.
  const [dispensada, setDispensada] = useState<string | null>(null)

  const aberta = brinde != null && brinde.chave !== dispensada

  function fechar() {
    if (!brinde) return
    // A tela fecha na hora, sem esperar a rede. Quando a gravação falha o
    // servidor continua com o brinde pendente e ele volta na próxima abertura,
    // que é o comportamento certo: melhor avisar duas vezes que nunca.
    setDispensada(brinde.chave)
    marcar.mutate(brinde.chave)
  }

  return (
    <Folha aberta={aberta} aoFechar={fechar} titulo={brinde?.titulo ?? ''}>
      {/* O conteúdo só monta com a folha aberta. Montado sempre, junto da casca,
          a animação de entrada rodaria na abertura do app, longe dos olhos, e a
          folha subiria com tudo já parado. */}
      {aberta && brinde && (
        <div className={cn('space-y-4', ENTRADA)}>
          <p className="text-sm text-muted-foreground">{brinde.corpo}</p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {brinde.ouro > 0 && (
              <span
                className={cn(
                  'flex items-center gap-2 rounded-xl bg-warning/15 px-4 py-3',
                  'text-lg font-semibold text-warning delay-100',
                  PREMIO,
                )}
              >
                <Coins className="size-5 shrink-0" />+{brinde.ouro}
              </span>
            )}

            {brinde.pocoes_vida > 0 && (
              <span
                className={cn(
                  'flex items-center gap-2 rounded-xl bg-muted px-4 py-3',
                  'text-sm font-medium delay-300',
                  PREMIO,
                )}
              >
                {/* `alt` vazio porque o texto ao lado já nomeia o item: com o
                    nome no sprite o leitor de tela diria a mesma coisa duas
                    vezes. `animate-bob` é a respiração que a trilha já usa. */}
                <img
                  src={POCAO}
                  alt=""
                  data-pixel
                  className="size-8 shrink-0 animate-bob motion-reduce:animate-none"
                />
                {pocoes(brinde.pocoes_vida)}
              </span>
            )}
          </div>

          <Botao className="w-full" onClick={fechar}>
            Entendi
          </Botao>
        </div>
      )}
    </Folha>
  )
}
