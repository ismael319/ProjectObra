import { useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const BUCKET = 'dashboard-widgets-fotos'

/** Imagem como object URL local (blob:) — não signed URL: a exportação A4/PDF
 * (html2canvas) trata imagem de outra origem como suja e devolve captura em
 * branco. Mesmo padrão de usePlantaSetoresUrl (mapa-setores-db.ts), sem o
 * cache em IndexedDB de lá — foto de dashboard é ocasional, não vale a
 * complexidade extra aqui. */
export function useFotoDashboardUrl(path: string | undefined) {
  const query = useQuery({
    queryKey: ['dashboard_foto_blob', path],
    enabled: !!path,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path!)
      if (error || !data) throw error ?? new Error('Não foi possível abrir a foto')
      return URL.createObjectURL(data)
    },
  })

  const url = query.data
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  return query
}

export function useUploadFotoDashboard() {
  return useMutation({
    mutationFn: async ({ organizacaoId, arquivo }: { organizacaoId: string; arquivo: File }) => {
      const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${organizacaoId}/${crypto.randomUUID()}.${extensao}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: arquivo.type })
      if (error) throw new Error(error.message)
      return path
    },
  })
}

export function useExcluirFotoDashboard() {
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.storage.from(BUCKET).remove([path])
      if (error) throw new Error(error.message)
    },
  })
}
