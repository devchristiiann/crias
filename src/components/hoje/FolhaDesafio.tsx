import { Camera, Coins, Flame, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { ExcluirRotina } from '@/components/habito/ExcluirRotina'
import { Botao } from '@/components/ui/Botao'
import { Folha } from '@/components/ui/Folha'
import { useCheckIn, type PremioBau, type ResultadoCheckIn } from '@/hooks/useCheckIn'
import type { OcorrenciaHoje } from '@/hooks/useOcorrenciasHoje'
import { useSessao } from '@/hooks/useSessao'
import { CATALOGO, POR_ID } from '@/lib/catalogo'
import { rotuloFrequencia } from '@/lib/frequencia'
import { iconeDoHabito } from '@/lib/icones'

export type FaceBau =
  | { visual: 'ouro'; rotulo: string }
  | { visual: 'item'; rotulo: string; itemId: string }
  | { visual: 'repetido'; rotulo: string }

/**
 * Decide o que o baú mostra a partir do prêmio que o servidor mandou.
 * Pura de propósito: é aqui que mora a ramificação, e é isto que o teste cobre.
 */
export function faceDoPremio(premio: PremioBau | null | undefined): FaceBau | null {
  if (!premio) return null
  if (premio.repetido) return { visual: 'repetido', rotulo: 'Nó já aberto antes. Nada novo.' }
  if (premio.tipo === 'item' && premio.item_id) {
    return { visual: 'item', rotulo: premio.item_nome ?? 'Item novo', itemId: premio.item_id }
  }
  return { visual: 'ouro', rotulo: `${premio.ouro} de ouro` }
}

/**
 * Rostos de enfeite do giro. NÃO vêm do servidor e não valem nada: existem só
 * para o baú demorar um instante. O prêmio de verdade é o que o servidor
 * mandou, fica embaixo desta camada e aparece quando a última fatia some.
 */
const ENFEITES = CATALOGO.filter((p) => p.slot === 'acessorio').slice(0, 4)

/** Fatias do giro, em ms. Desaceleram e somam 900. */
const FATIAS = [70, 75, 85, 95, 110, 130, 155, 180]
const INICIOS = FATIAS.map((_, i) => FATIAS.slice(0, i).reduce((soma, ms) => soma + ms, 0))

function Rosto({ face }: { face: FaceBau }) {
  if (face.visual === 'item') {
    return (
      <>
        <img
          src={POR_ID.get(face.itemId)?.arquivo}
          alt=""
          className="size-12 object-contain [image-rendering:pixelated]"
        />
        <span className="font-semibold">{face.rotulo}</span>
      </>
    )
  }
  if (face.visual === 'ouro') {
    return (
      <>
        <Coins className="size-6 text-warning" />
        <span className="text-lg font-semibold">{face.rotulo}</span>
      </>
    )
  }
  return <span className="text-sm text-muted-foreground">{face.rotulo}</span>
}

function RevelacaoBau({ face, no }: { face: FaceBau; no?: number }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-card px-3 py-3 text-center">
      <p className="text-xs text-muted-foreground">Baú do nó {no}</p>
      <div className="relative mt-2 flex h-14 items-center justify-center gap-2">
        <Rosto face={face} />
        {/* Camada de enfeite. Cobre o prêmio por 900ms e some. Sem `motion-safe`
            nada anima e o `opacity-0` mantém tudo invisível: quem pediu menos
            movimento vê o resultado na hora. */}
        {face.visual !== 'repetido' &&
          FATIAS.map((duracao, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center
                         gap-2 rounded-lg bg-card opacity-0 motion-safe:animate-giro"
              style={{ animationDelay: `${INICIOS[i]}ms`, animationDuration: `${duracao}ms` }}
            >
              {i % 2 === 0 ? (
                <Coins className="size-6 text-warning" />
              ) : (
                <img
                  src={ENFEITES[((i - 1) / 2) % ENFEITES.length].arquivo}
                  alt=""
                  className="size-12 object-contain [image-rendering:pixelated]"
                />
              )}
            </span>
          ))}
      </div>
    </div>
  )
}

export function FolhaDesafio({
  ocorrencia,
  aoFechar,
}: {
  ocorrencia: OcorrenciaHoje | null
  aoFechar: () => void
}) {
  const [foto, setFoto] = useState<File | null>(null)
  const [resultado, setResultado] = useState<ResultadoCheckIn | null>(null)
  const entradaArquivo = useRef<HTMLInputElement>(null)
  const checkIn = useCheckIn()
  const { usuarioId } = useSessao()

  function fechar() {
    setFoto(null)
    setResultado(null)
    aoFechar()
  }

  if (!ocorrencia) return null

  const Icone = iconeDoHabito(ocorrencia.icone)
  const feito = ocorrencia.status === 'feito'
  // Rotina individual e sempre de quem esta vendo. A de grupo so o dono apaga.
  const deGrupo = ocorrencia.grupoId !== null
  const podeExcluir = !deGrupo || ocorrencia.grupoDonoId === usuarioId
  const face = faceDoPremio(resultado?.premio)

  return (
    <Folha aberta aoFechar={fechar} titulo={ocorrencia.titulo}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icone className="size-7" />
          </span>
          <dl className="grid flex-1 grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">Ofensiva</dt>
              <dd className="flex items-center justify-center gap-1 font-semibold">
                <Flame className="size-4 text-warning" />
                {ocorrencia.streak}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ouro</dt>
              <dd className="flex items-center justify-center gap-1 font-semibold">
                <Coins className="size-4" />
                {ocorrencia.ouroBase}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Frequência</dt>
              <dd className="truncate text-sm font-medium">{rotuloFrequencia(ocorrencia.regra)}</dd>
            </div>
          </dl>
        </div>

        {ocorrencia.grupoNome && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <Users className="size-4 shrink-0" />
            {ocorrencia.feitosNoGrupo} de {ocorrencia.totalGrupo} do {ocorrencia.grupoNome} já
            concluíram hoje.
          </p>
        )}

        {ocorrencia.vezes_alvo > 1 && (
          <p className="text-sm text-muted-foreground">
            Você marcou {ocorrencia.vezes_feitas} de {ocorrencia.vezes_alvo} vezes neste período.
          </p>
        )}

        {resultado?.bau && face && <RevelacaoBau face={face} no={resultado.no} />}

        {resultado && !resultado.error && !resultado.ja_feito && (
          <p className="text-sm font-medium text-success">
            Mais {resultado.ouro_ganho} de ouro. Ofensiva de {resultado.streak} dias.
          </p>
        )}

        {checkIn.isError && (
          <p className="text-sm text-destructive">Não deu para marcar agora. Tente de novo.</p>
        )}

        {!feito && (
          <>
            <input
              ref={entradaArquivo}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            />
            <Botao
              variante="secundario"
              className="w-full"
              onClick={() => entradaArquivo.current?.click()}
            >
              <Camera className="size-4" />
              {foto ? 'Foto anexada' : 'Anexar foto'}
            </Botao>

            <Botao
              tamanho="lg"
              className="w-full"
              carregando={checkIn.isPending}
              onClick={() =>
                checkIn.mutate(
                  { ocorrenciaId: ocorrencia.id, foto },
                  {
                    onSuccess: (r) => {
                      setResultado(r)
                      // O giro do baú leva 900ms. Fechar em 1200 apagaria o
                      // prêmio no instante em que ele aparece.
                      if (r.completou || r.ja_feito) setTimeout(fechar, r.bau ? 2600 : 1200)
                    },
                  },
                )
              }
            >
              Concluir
            </Botao>
          </>
        )}

        {feito && (
          <Botao variante="secundario" className="w-full" onClick={fechar}>
            Fechar
          </Botao>
        )}

        {podeExcluir && (
          <ExcluirRotina
            habitId={ocorrencia.habitId}
            titulo={ocorrencia.titulo}
            deGrupo={deGrupo}
            aoExcluir={fechar}
          />
        )}
      </div>
    </Folha>
  )
}
