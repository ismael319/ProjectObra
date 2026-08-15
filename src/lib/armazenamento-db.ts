import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const BUCKETS_MONITORADOS = ['mapa-plantas', 'rdr-fotos'] as const
export type BucketMonitorado = (typeof BUCKETS_MONITORADOS)[number]

export interface UsoArmazenamentoBucket {
  bucketId: string
  totalBytes: number
  totalArquivos: number
}

// Uso agregado (bytes + contagem) por bucket, só o que é da MINHA empresa —
// a função no banco (uso_armazenamento_organizacao, SECURITY DEFINER) lê
// storage.objects.metadata direto, sem precisar listar arquivo por arquivo
// no cliente. Ver migration 20260813040000.
export function useUsoArmazenamento(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['uso_armazenamento', organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async (): Promise<UsoArmazenamentoBucket[]> => {
      const { data, error } = await supabase.rpc('uso_armazenamento_organizacao', { p_organizacao_id: organizacaoId! })
      if (error) throw error
      return ((data ?? []) as { bucket_id: string; total_bytes: number | string; total_arquivos: number | string }[]).map((r) => ({
        bucketId: r.bucket_id,
        totalBytes: Number(r.total_bytes),
        totalArquivos: Number(r.total_arquivos),
      }))
    },
  })
}

export interface ArquivoOrfao {
  path: string
  bytes: number
}

// Plantas de Gestão à Vista órfãs: arquivo existe no bucket mapa-plantas mas
// nenhuma linha de mapa_plantas aponta pra ele — sobra de exclusão que falhou
// no passo do storage (useExcluirPlanta é best-effort nesse passo de
// propósito, ver comentário lá).
export function useArquivosOrfaosPlantas(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_plantas_orfaos', organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async (): Promise<{ arquivos: ArquivoOrfao[]; totalBytes: number }> => {
      const [{ data: arquivos, error: errArquivos }, { data: plantas, error: errPlantas }] = await Promise.all([
        supabase.rpc('listar_arquivos_organizacao', { p_organizacao_id: organizacaoId!, p_bucket: 'mapa-plantas' }),
        supabase.from('mapa_plantas').select('arquivo_path').eq('organizacao_id', organizacaoId!),
      ])
      if (errArquivos) throw errArquivos
      if (errPlantas) throw errPlantas

      const vivos = new Set((plantas ?? []).map((p) => p.arquivo_path as string))
      const orfaos = ((arquivos ?? []) as { name: string; size: number | string }[]).filter((a) => !vivos.has(a.name))

      return {
        arquivos: orfaos.map((a) => ({ path: a.name, bytes: Number(a.size) })),
        totalBytes: orfaos.reduce((soma, a) => soma + Number(a.size), 0),
      }
    },
  })
}

// Remoção de verdade passa pela API de Storage (não um DELETE em
// storage.objects) — só ela limpa o blob no backend junto com o metadado.
export function useLimparArquivosOrfaosPlantas(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (paths: string[]) => {
      if (paths.length === 0) return
      const { error } = await supabase.storage.from('mapa-plantas').remove(paths)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_plantas_orfaos', organizacaoId] })
      qc.invalidateQueries({ queryKey: ['uso_armazenamento', organizacaoId] })
    },
  })
}

export function formatarBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}
