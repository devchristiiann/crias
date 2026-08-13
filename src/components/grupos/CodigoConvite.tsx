import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

/**
 * Bloco do codigo de convite, com copia num toque.
 *
 * Aparece em dois lugares: assim que o grupo nasce, que e quando a pessoa vai
 * mandar o convite, e dentro de administrar o grupo, para quem precisar dele de
 * novo. Fora da tela principal de proposito: era o bloco mais chamativo do
 * grupo, e ninguem entra num grupo que ja e seu.
 */
export function CodigoConvite({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissao de area de transferencia: o codigo ja esta visivel na tela.
      setCopiado(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="flex w-full items-center justify-between rounded-xl border border-border
                 bg-card p-4 text-left shadow-sm"
    >
      <span>
        <span className="block text-xs text-muted-foreground">Código de convite</span>
        <span className="block font-mono text-xl font-semibold tracking-widest">{codigo}</span>
      </span>
      {copiado ? <Check className="size-5 text-success" /> : <Copy className="size-5" />}
    </button>
  )
}
