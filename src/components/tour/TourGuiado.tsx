import { CalendarCheck, Check, Coins, Settings, Store, Users } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { usePerfil } from '@/hooks/usePerfil'
import { pecasDoSlot } from '@/lib/catalogo'
import { cn } from '@/lib/utils'

type Aba = 'hoje' | 'grupos' | 'trilha' | 'loja'

const TELAS: { aba: Aba; titulo: string; frase: string }[] = [
  { aba: 'hoje', titulo: 'Hoje', frase: 'Seus hábitos do dia. Um toque no círculo conclui.' },
  { aba: 'grupos', titulo: 'Grupos', frase: 'Quem está com você e quem já concluiu hoje.' },
  { aba: 'trilha', titulo: 'Trilha', frase: 'Cada dia produtivo avança seu personagem um nó.' },
  { aba: 'loja', titulo: 'Loja', frase: 'O ouro dos hábitos vira acessório do personagem.' },
]

const ABAS_ESQUERDA = [
  { aba: 'hoje', rotulo: 'Hoje', Icone: CalendarCheck },
  { aba: 'grupos', rotulo: 'Grupos', Icone: Users },
] as const

const ABAS_DIREITA = [
  { aba: 'loja', rotulo: 'Loja', Icone: Store },
  { aba: 'ajustes', rotulo: 'Ajustes', Icone: Settings },
] as const

/** Tres bonecos quaisquer, so para a maquete de grupo ter gente dentro. */
const TRES_BASES = pecasDoSlot('personagem')
  .slice(0, 3)
  .map((p) => p.id)

/** Vitrine de mentira da maquete da loja. Ids do catalogo de verdade, senao a
 *  camada de acessorio nao acha o arquivo e o quadro sai vazio. */
const DOIS_PREMIOS = [
  { item: 'ace-2', nome: 'Chapéu', preco: 250 },
  { item: 'ace-3', nome: 'Capacete', preco: 250 },
]

/**
 * Tour do onboarding: mostra uma maquete das telas, nao a tela real.
 *
 * Ele roda dentro do fluxo de onboarding, onde nenhuma das paginas do app
 * esta montada, entao nao ha no de DOM para medir nem destacar. O recorte e
 * feito sem medida nenhuma: um veu escuro cobre a maquete inteira e o bloco
 * explicado sobe acima dele por z-index.
 */
export function TourGuiado({ aoConcluir }: { aoConcluir: () => void }) {
  const [indice, setIndice] = useState(0)
  const { data: perfil } = usePerfil()
  const tela = TELAS[indice]
  const ultima = indice === TELAS.length - 1

  return (
    <section className="relative space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Conheça o app</h1>
        <p className="text-sm text-muted-foreground">São quatro telas. Toque para avançar.</p>
      </header>

      <div className="relative overflow-hidden rounded-xl border border-border bg-background">
        {/* O veu escurece tudo que nao esta em destaque. Preto com opacidade,
            mesmo recurso do backdrop da Folha, porque token de tema inverteria
            no escuro e clarearia o fundo em vez de escurecer. */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-black/70" />

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">{tela.titulo}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Coins className="size-3.5" />
            240
          </span>
        </div>

        <div className="relative z-20 mx-3 mb-3 rounded-lg bg-background p-2 ring-2 ring-primary">
          <ConteudoDaTela aba={tela.aba} base={perfil?.avatar_base} />
        </div>

        <div className="border-t border-border bg-card">
          <div className="grid grid-cols-5 items-end">
            {ABAS_ESQUERDA.map((item) => (
              <ItemMaquete key={item.aba} {...item} destacado={tela.aba === item.aba} />
            ))}

            <div className="flex justify-center">
              <span
                className={cn(
                  'relative -top-4 flex size-12 items-center justify-center rounded-full bg-primary ring-4 ring-card',
                  tela.aba === 'trilha' && 'z-20 ring-primary',
                )}
              >
                <Avatar
                  base={perfil?.avatar_base}
                  item={perfil?.item_equipado}
                  cenario={perfil?.cenario_equipado}
                  tamanho={36}
                />
              </span>
            </div>

            {ABAS_DIREITA.map((item) => (
              <ItemMaquete key={item.aba} {...item} destacado={tela.aba === item.aba} />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold">{tela.titulo}</p>
        <p className="text-sm text-muted-foreground">{tela.frase}</p>
        <div className="flex gap-1.5 pt-1">
          {TELAS.map((t, i) => (
            <span
              key={t.aba}
              className={cn('h-1.5 w-6 rounded-full', i <= indice ? 'bg-primary' : 'bg-muted')}
            />
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {ultima ? 'Toque para terminar' : 'Toque em qualquer lugar para continuar'}
      </p>

      {/* A area de toque e a secao inteira, bem acima do minimo de 44px. Fica
          por ultimo e sem conteudo para nao virar botao com titulo dentro. */}
      <button
        type="button"
        aria-label={ultima ? 'Terminar o tour' : `Ver a próxima tela, ${TELAS[indice + 1]?.titulo}`}
        onClick={() => (ultima ? aoConcluir() : setIndice(indice + 1))}
        className="absolute inset-0 z-30 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </section>
  )
}

function ItemMaquete({
  rotulo,
  Icone,
  destacado,
}: {
  rotulo: string
  Icone: typeof CalendarCheck
  destacado: boolean
}) {
  return (
    <span
      className={cn(
        'flex h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium',
        destacado ? 'relative z-20 rounded-lg bg-card text-primary ring-2 ring-primary' : 'text-muted-foreground',
      )}
    >
      <Icone className="size-4" />
      {rotulo}
    </span>
  )
}

function ConteudoDaTela({ aba, base }: { aba: Aba; base?: string | null }) {
  if (aba === 'hoje') {
    return (
      <ul className="space-y-1.5">
        {['Beber água', 'Correr 20 min', 'Ler 10 páginas'].map((habito, i) => (
          <li
            key={habito}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border',
                i === 0 ? 'border-success bg-success text-success-foreground' : 'border-border',
              )}
            >
              {i === 0 && <Check className="size-3" />}
            </span>
            {habito}
          </li>
        ))}
      </ul>
    )
  }

  if (aba === 'grupos') {
    return (
      <ul className="space-y-1.5">
        {['Corrida da manhã', 'Leitura da noite'].map((grupo) => (
          <li
            key={grupo}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
          >
            {grupo}
            <span className="flex shrink-0 -space-x-1.5">
              {TRES_BASES.map((b) => (
                <Avatar key={b} base={b} tamanho={20} className="rounded-full bg-muted" />
              ))}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  if (aba === 'trilha') {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <span className="size-8 rounded-full border-2 border-dashed border-muted" />
        <span className="h-3 w-0.5 bg-border" />
        <span className="flex items-center gap-2">
          <span className="size-8 rounded-full border-2 border-primary bg-primary/15" />
          <Avatar base={base} tamanho={32} />
        </span>
        <span className="h-3 w-0.5 bg-border" />
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-4" />
        </span>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-1.5">
      {DOIS_PREMIOS.map((premio) => (
        <li
          key={premio.item}
          className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card px-2 py-2 text-xs"
        >
          <Avatar base={base} item={premio.item} tamanho={40} />
          {premio.nome}
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Coins className="size-3" />
            {premio.preco}
          </span>
        </li>
      ))}
    </ul>
  )
}
