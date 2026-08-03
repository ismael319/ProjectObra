import { CATEGORIAS } from "./constants"

export interface RdrFoto {
  path: string
  name: string
}

export interface RdrRecord {
  id: string
  organizacao_id: string
  data_ocorrido: string
  hora: string
  autor_id: string | null
  autor_nome: string
  local: string
  categorias: string[]
  concluido: string
  nome_colaborador: string
  responsavel_setor: string
  responsavel_registro: string
  descricao: string
  sugestao_correcao: string
  prazo: string | null
  concluido_em: string | null
  fotos: RdrFoto[]
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

export interface RdrRecordInput {
  data_ocorrido: string
  hora: string
  local: string
  categorias: string[]
  concluido: string
  nome_colaborador: string
  responsavel_setor: string
  responsavel_registro: string
  descricao: string
  sugestao_correcao: string
  prazo: string | null
  concluido_em: string | null
  fotos: RdrFoto[]
}

export function categoriasValidas(): string[] {
  return CATEGORIAS
}

export function ehDesvio(categorias: string[]): boolean {
  return categorias.includes("Reconhecimento") === false
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`
}
