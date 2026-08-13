import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { EstadoErro } from '@/components/ui/EstadoErro'
import { comprimirImagem } from '@/lib/comprimirImagem'
import { supabase } from '@/lib/supabase'

type Etapa = 'comprimindo' | 'enviando' | null

/**
 * Capa do grupo. Quem nao e dono so ve a imagem, e grupo sem foto nao deixa
 * moldura vazia na tela: o bloco inteiro some.
 */
export function FotoCapaGrupo({
  grupoId,
  nome,
  fotoUrl,
  ehDono,
}: {
  grupoId: string
  nome: string
  fotoUrl: string | null
  ehDono: boolean
}) {
  const cliente = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const [etapa, setEtapa] = useState<Etapa>(null)

  const enviar = useMutation({
    mutationFn: async (arquivo: File) => {
      setEtapa('comprimindo')
      const comprimida = await comprimirImagem(arquivo)

      setEtapa('enviando')
      // Caminho fixo, e nao um nome escolhido aqui: a policy do bucket amarra o
      // primeiro segmento ao id do grupo, e a RPC confere de novo do lado de la.
      const caminho = `${grupoId}/capa.webp`
      const { error: erroUpload } = await supabase.storage
        .from('grupos')
        .upload(caminho, comprimida, { contentType: 'image/webp', upsert: true })
      if (erroUpload) throw erroUpload

      const { data, error } = await supabase.rpc('definir_foto_grupo', {
        p_grupo: grupoId,
        p_caminho: caminho,
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
    },
    onSettled: () => setEtapa(null),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['grupo'] }),
  })

  function escolher() {
    enviar.reset()
    entrada.current?.click()
  }

  if (!fotoUrl && !ehDono) return null

  return (
    <div className="space-y-2">
      {fotoUrl && (
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
          <img
            src={fotoUrl}
            alt={`Capa do grupo ${nome}`}
            className="aspect-video w-full object-cover"
          />
          {ehDono && (
            <Botao
              variante="secundario"
              className="absolute bottom-2 right-2"
              carregando={enviar.isPending}
              onClick={escolher}
            >
              <Camera className="size-4" />
              Trocar foto
            </Botao>
          )}
        </div>
      )}

      {!fotoUrl && ehDono && (
        <Botao
          variante="secundario"
          className="w-full"
          carregando={enviar.isPending}
          onClick={escolher}
        >
          <Camera className="size-4" />
          Adicionar foto de capa
        </Botao>
      )}

      {etapa && (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {etapa === 'comprimindo' ? 'Comprimindo a foto' : 'Enviando a foto'}
        </p>
      )}

      {enviar.isError && (
        <EstadoErro mensagem="Não deu para salvar a foto agora." aoTentarDeNovo={escolher} />
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          // Zerar o valor deixa escolher a mesma foto de novo depois de um erro.
          e.target.value = ''
          if (arquivo) enviar.mutate(arquivo)
        }}
      />
    </div>
  )
}
