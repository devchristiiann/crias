import type { ReactNode } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Folha } from '@/components/ui/Folha'

interface Props {
  aberta: boolean
  aoFechar: () => void
  titulo: string
  /** Uma linha curta explicando a consequência. Nunca um parágrafo. */
  detalhe?: ReactNode
  rotuloConfirmar?: string
  rotuloCancelar?: string
  perigo?: boolean
  carregando?: boolean
  erro?: string | null
  aoConfirmar: () => void
}

/**
 * Confirmação de ação com efeito, em folha inferior.
 *
 * Existe para o app parar de usar `window.confirm`, que no iPhone abre um
 * alerta do sistema fora do desenho do app e some junto com a barra do Safari
 * em algumas versões, deixando a ação acontecer sem ninguém ver o aviso.
 */
export function Confirmar({
  aberta,
  aoFechar,
  titulo,
  detalhe,
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Cancelar',
  perigo = false,
  carregando = false,
  erro,
  aoConfirmar,
}: Props) {
  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo={titulo}>
      <div className="space-y-4">
        {detalhe && <div className="text-sm text-muted-foreground">{detalhe}</div>}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <div className="flex gap-2">
          <Botao variante="secundario" className="flex-1" disabled={carregando} onClick={aoFechar}>
            {rotuloCancelar}
          </Botao>
          {/* Trava contra duplo clique: `carregando` desabilita o botao. */}
          <Botao
            variante={perigo ? 'perigo' : 'primario'}
            className="flex-1"
            carregando={carregando}
            onClick={aoConfirmar}
          >
            {rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </Folha>
  )
}
