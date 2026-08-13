import { Camera, Coins, Flame, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Folha } from '@/components/ui/Folha'
import { useCheckIn, type ResultadoCheckIn } from '@/hooks/useCheckIn'
import type { OcorrenciaHoje } from '@/hooks/useOcorrenciasHoje'
import { rotuloFrequencia } from '@/lib/frequencia'
import { iconeDoHabito } from '@/lib/icones'

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

  function fechar() {
    setFoto(null)
    setResultado(null)
    aoFechar()
  }

  if (!ocorrencia) return null

  const Icone = iconeDoHabito(ocorrencia.icone)
  const feito = ocorrencia.status === 'feito'

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

        {resultado?.bau && (
          <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm font-medium text-warning-foreground">
            Baú aberto no nó {resultado.no}. Mais 50 de ouro.
          </p>
        )}

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
                      if (r.completou || r.ja_feito) setTimeout(fechar, 1200)
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
      </div>
    </Folha>
  )
}
