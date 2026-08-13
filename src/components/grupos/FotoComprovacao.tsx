import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

/** Foto do check-in aberta em tela cheia. Null quando nao ha nada aberto. */
export interface FotoAberta {
  url: string
  alt: string
}

/**
 * Foto aberta em tela cheia sobre `<dialog>` nativo, como a `Folha`.
 *
 * O elemento nativo ja traz backdrop, ESC e trava de foco. A guarda no
 * `showModal` e a mesma paga na `Folha`: Safari antigo lanca, e sem ela o React
 * derruba a arvore inteira e a pessoa fica com tela branca no lugar da foto.
 */
export function FotoAmpliada({
  foto,
  aoFechar,
}: {
  foto: FotoAberta | null
  aoFechar: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    try {
      if (foto && !dialogo.open) dialogo.showModal()
      if (!foto && dialogo.open) dialogo.close()
    } catch {
      dialogo.open = Boolean(foto)
    }
  }, [foto])

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onClick={aoFechar}
      className="max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/85"
      /* `inset: 0` no lugar de `100vw`: em tela com barra de rolagem classica a
         largura da viewport passa da largura util e nasce scroll horizontal. */
      style={{ inset: 0, width: 'auto', height: 'auto', margin: 0 }}
    >
      <div className="flex h-full w-full items-center justify-center p-3">
        {foto && (
          // Toque no fundo fecha, toque na propria foto nao: quem abriu a
          // comprovacao quer olhar para ela, e o dedo cai em cima dela.
          <img
            src={foto.url}
            alt={foto.alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        )}
      </div>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar"
        className="absolute right-3 flex size-11 items-center justify-center rounded-full
                   bg-black/60 text-white"
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <X className="size-5" />
      </button>
    </dialog>
  )
}

/**
 * A comprovacao dentro do cartao: mesmo tamanho, mesmo recorte e mesma abertura
 * em tela cheia no feed e na enquete.
 *
 * Existe como componente unico de proposito. O print da enquete e a foto do
 * feed sao a mesma coisa para quem olha, e duas copias divergiriam no primeiro
 * ajuste de altura.
 */
export function FotoComprovacao({
  url,
  alt,
  aoAmpliar,
}: {
  url: string
  alt: string
  aoAmpliar: (foto: FotoAberta) => void
}) {
  return (
    <button
      type="button"
      onClick={() => aoAmpliar({ url, alt })}
      className="block w-full"
      aria-label={`Ampliar ${alt.toLowerCase()}`}
    >
      {/* `loading="lazy"` e o que mantem a lista barata: foto de item que a
          pessoa nunca rolou ate ver nao chega a ser baixada. */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-44 w-full bg-muted object-cover"
      />
    </button>
  )
}
