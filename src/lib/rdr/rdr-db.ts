import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { RdrRecord, RdrRecordInput } from "./mappers"

const BUCKET = "rdr-fotos"

export interface FotoUpload {
  dataUrl: string
  name: string
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",")
  const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg"
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function extrairExtensao(dataUrl: string): string {
  const mime = dataUrl.match(/data:([^;]+)/)?.[1] ?? "image/jpeg"
  switch (mime) {
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    default:
      return "jpg"
  }
}

export async function fazerUploadFotos(
  organizacaoId: string,
  recordId: string,
  fotos: FotoUpload[]
): Promise<{ path: string; name: string }[]> {
  const resultados: { path: string; name: string }[] = []
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i]
    const ext = extrairExtensao(f.dataUrl)
    const nome = `${Date.now()}-${i}.${ext}`
    const path = `${organizacaoId}/${recordId}/${nome}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, dataUrlToBlob(f.dataUrl), {
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      upsert: true,
    })
    if (error) throw error
    resultados.push({ path, name: f.name })
  }
  return resultados
}

export async function excluirFotos(paths: string[]): Promise<void> {
  if (!paths.length) return
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) throw error
}

export async function obterFotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) throw error
  return data.signedUrl
}

export function useRdrRecords(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ["rdr_records", organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rdr_records")
        .select("*")
        .eq("organizacao_id", organizacaoId!)
        .order("data_ocorrido", { ascending: false })
        .order("criado_em", { ascending: false })
      if (error) throw error
      return (data as RdrRecord[]) ?? []
    },
  })
}

export function useRdrRecord(id: string | undefined) {
  return useQuery({
    queryKey: ["rdr_record", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("rdr_records").select("*").eq("id", id!).maybeSingle()
      if (error) throw error
      return (data as RdrRecord) ?? null
    },
  })
}

export function useSalvarRecord(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RdrRecordInput & { id?: string }) => {
      const { id, ...base } = input
      if (id) {
        const { error } = await supabase
          .from("rdr_records")
          .update({ ...base, atualizado_em: new Date().toISOString() })
          .eq("id", id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("rdr_records")
          .insert({ ...base, organizacao_id: organizacaoId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rdr_records", organizacaoId] })
    },
  })
}

export function useExcluirRecord(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (record: RdrRecord) => {
      const { error } = await supabase.from("rdr_records").delete().eq("id", record.id)
      if (error) throw error
      if (record.fotos?.length) {
        await excluirFotos(record.fotos.map((f) => f.path)).catch(() => undefined)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rdr_records", organizacaoId] })
    },
  })
}

export interface RdrConfigRow {
  organizacao_id: string
  chave: string
  valor: string
  atualizado_em: string
  atualizado_por: string | null
}

export function useRdrConfig(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ["rdr_config", organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rdr_config")
        .select("organizacao_id,chave,valor,atualizado_em,atualizado_por")
        .eq("organizacao_id", organizacaoId!)
      if (error) throw error
      return (data as RdrConfigRow[]) ?? []
    },
  })
}

export function useSalvarRdrConfig(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { chave: string; valor: string }) => {
      const { error } = await supabase
        .from("rdr_config")
        .upsert({
          organizacao_id: organizacaoId,
          chave: input.chave,
          valor: input.valor,
          atualizado_em: new Date().toISOString(),
        })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rdr_config", organizacaoId] })
    },
  })
}
