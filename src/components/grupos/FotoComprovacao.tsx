import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

/** Foto do check-in aberta em tela cheia. Null quando nao ha nada aberto. */
export interface FotoAberta {
  url: string
  alt: string
  /**
   * Tamanho natural, lido da miniatura que abriu esta foto. E o que deixa o
   * visualizador reservar a caixa certa antes de os bytes chegarem. Opcional
   * porque a miniatura pode ainda nao ter carregado no momento do toque.
   */
  largura?: number
  altura?: number
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
          // comprovacao quer olhar para ela, e o dedo cai em cima dela. Por
          // isso a caixa continua sendo a da foto, e nao a tela inteira: uma
          // imagem esticada ate as bordas engoliria o toque do lado de fora.
          //
          // `width` e `height` sao a medida natural que a miniatura ja tinha em
          // maos. Com eles o navegador conhece a proporcao antes do primeiro
          // byte e desenha a caixa final de uma vez; sem eles a foto nascia com
          // altura zero e saltava para o tamanho certo ao carregar.
          <img
            src={foto.url}
            alt={foto.alt}
            width={foto.largura}
            height={foto.altura}
            loading="eager"
            decoding="async"
            onClick={(e) => e.stopPropagation()}
            className="h-auto w-auto max-h-full max-w-full rounded-lg object-contain"
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
  const imagem = useRef<HTMLImageElement>(null)

  return (
    <button
      type="button"
      // A medida natural sai daqui, da miniatura que ja esta na tela: e a mesma
      // imagem, entao o visualizador abre sabendo a proporcao. Zero quer dizer
      // que ela ainda nao carregou, e ai vai sem medida mesmo.
      onClick={() =>
        aoAmpliar({
          url,
          alt,
          largura: imagem.current?.naturalWidth || undefined,
          altura: imagem.current?.naturalHeight || undefined,
        })
      }
      className="block w-full"
      aria-label={`Ampliar ${alt.toLowerCase()}`}
    >
      {/* `loading="lazy"` e o que mantem a lista barata: foto de item que a
          pessoa nunca rolou ate ver nao chega a ser baixada. */}
      <img
        ref={imagem}
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-44 w-full bg-muted object-cover"
      />
    </button>
  )
}
