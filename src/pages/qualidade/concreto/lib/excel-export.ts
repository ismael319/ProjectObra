import type { WorkBook } from "xlsx";
import { supabase } from "@/lib/supabase";

export type DestinoRow = {
  quantidade_m3_aplicada: number;
  observacao: string | null;
  // áreas_concreto é o catálogo próprio do Concreto; areas (global do
  // Apontamento) fica só como fallback pra destinos lançados antes da
  // separação (ver 20260807060000_concreto-setores-areas-migration.sql).
  areas_concreto: { nome: string } | null;
  areas: { nome: string } | null;
  etapa_concreto: { nome: string } | null;
};

export type CargaRow = {
  id: string;
  codigo_rastreabilidade: string;
  data: string;
  numero_carga: string | null;
  cod_laboratorio: string | null;
  quantidade_m3: number;
  tipo_origem: "propria" | "externa";
  peso_balanca_kg: number | null;
  preco_total: number | null;
  validado: boolean;
  criado_por_nome: string | null;
  fornecedores_concreto: { nome: string } | null;
  tracos_concreto: { nome: string; fck_mpa: number } | null;
  destinos_carga: DestinoRow[];
};

const CARGA_SELECT = `id, codigo_rastreabilidade, data, numero_carga, cod_laboratorio, quantidade_m3, tipo_origem, peso_balanca_kg, preco_total, validado, criado_por_nome,
  fornecedores_concreto(nome),
  tracos_concreto(nome, fck_mpa),
  destinos_carga(quantidade_m3_aplicada, observacao, areas_concreto(nome), areas(nome), etapa_concreto:etapas_concreto(nome))`;

// Busca TODAS as cargas da organização, sem filtro nem paginação — usada só pelo
// botão "Exportar tudo" (o banco completo, não o recorte filtrado da tela). Pagina
// internamente em lotes de 1000 (limite padrão do Supabase por chamada).
export async function listarTodasCargasConcreto(organizacaoId: string): Promise<CargaRow[]> {
  const PAGE_SIZE = 1000;
  const rows: CargaRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cargas_concreto")
      .select(CARGA_SELECT)
      .eq("organizacao_id", organizacaoId)
      .order("data", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as CargaRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function formatBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// Uma carga pode ter mais de um destino (dividida entre áreas) — cada campo
// abaixo junta os N destinos com "; ", mantendo a mesma ordem em todos, pra
// dar pra cruzar Projeto[i]/Etapa[i]/Observações[i] entre colunas na planilha.
function destinosCampo(destinos: DestinoRow[], extrair: (d: DestinoRow) => string): string {
  if (destinos.length === 0) return "";
  return destinos.map(extrair).join("; ");
}

function destinosTexto(destinos: DestinoRow[]): string {
  return destinosCampo(destinos, (d) => `${d.areas_concreto?.nome ?? d.areas?.nome ?? "Sem área"} — ${d.quantidade_m3_aplicada.toLocaleString("pt-BR")}m³`);
}

function projetosTexto(destinos: DestinoRow[]): string {
  return destinosCampo(destinos, (d) => d.areas_concreto?.nome ?? d.areas?.nome ?? "Sem área");
}

function etapasTexto(destinos: DestinoRow[]): string {
  return destinosCampo(destinos, (d) => d.etapa_concreto?.nome ?? "");
}

function observacoesTexto(destinos: DestinoRow[]): string {
  return destinosCampo(destinos, (d) => d.observacao ?? "");
}

const HEADERS = [
  "CÓD. RASTREABILIDADE", "DATA", "FORNECEDOR", "ORIGEM", "COD. LABORATÓRIO", "TRAÇO", "FCK (MPa)",
  "QTD (m³)", "PESO BALANÇA (kg)", "PREÇO TOTAL", "DESTINO(S)", "PROJETO", "ETAPA", "OBSERVAÇÕES",
  "VALIDADO", "LANÇADO POR",
];

function autoSizeFromRows(rows: (string | number)[][]) {
  if (rows.length === 0) return [];
  return rows[0]!.map((_, idx) => {
    let max = 8;
    for (const r of rows) {
      const v = r[idx];
      const s = v == null ? "" : String(v);
      if (s.length > max) max = s.length;
    }
    return { wch: Math.min(max + 2, 60) };
  });
}

export async function buildCargasConcretoWorkbook(rows: CargaRow[]): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const linhas: (string | number)[][] = [HEADERS];
  for (const r of rows) {
    linhas.push([
      r.codigo_rastreabilidade,
      formatBR(r.data),
      r.fornecedores_concreto?.nome ?? "",
      r.tipo_origem === "propria" ? "Própria" : "Externa",
      r.cod_laboratorio ?? "",
      r.tracos_concreto?.nome ?? "",
      r.tracos_concreto?.fck_mpa ?? "",
      r.quantidade_m3,
      r.peso_balanca_kg ?? "",
      r.preco_total ?? "",
      destinosTexto(r.destinos_carga),
      projetosTexto(r.destinos_carga),
      etapasTexto(r.destinos_carga),
      observacoesTexto(r.destinos_carga),
      r.validado ? "Sim" : "Não",
      r.criado_por_nome ?? "",
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = autoSizeFromRows(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cargas de Concreto");
  return wb;
}

export async function downloadCargasConcretoWorkbook(wb: WorkBook): Promise<void> {
  const XLSX = await import("xlsx");
  const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("");
  XLSX.writeFile(wb, `Concreto_Banco_Completo_${hoje}.xlsx`);
}

// ---------- Exportação de Ensaios ----------

export type EnsaioRow = {
  codigo_rastreabilidade: string;
  data_carga: string;
  numero_carga: string | null;
  nota_fiscal: string | null;
  cod_laboratorio: string | null;
  traco_nome: string;
  fck_mpa: number;
  laboratorio_nome: string | null;
  numero_lab: string | null;
  peca_concretada: string | null;
  idade_prevista_dias: number;
  data_moldagem: string;
  data_ruptura_prevista: string;
  status: "pendente" | "rompido";
  data_ruptura_real: string | null;
  resultado_mpa: number | null;
  tipo_ruptura: string | null;
  temperatura_concreto: number | null;
  slump_aplicacao: number | null;
  observacoes: string | null;
  status_conformidade: string;
};

const ENSAIO_SELECT = `codigo_rastreabilidade, data_carga, numero_carga, nota_fiscal, cod_laboratorio,
  traco_nome, fck_mpa, laboratorio_nome, numero_lab, peca_concretada,
  idade_prevista_dias, data_moldagem, data_ruptura_prevista, status,
  data_ruptura_real, resultado_mpa, tipo_ruptura, temperatura_concreto,
  slump_aplicacao, observacoes, status_conformidade`;

const ENSAIOS_HEADERS = [
  "COD. LABORATÓRIO", "DATA MOLDAGEM", "LABORATÓRIO", "Nº CP", "PEÇA CONCRETADA",
  "IDADE (DIAS)", "DATA RUPTURA", "FCJ (MPA)", "TIPO DE RUPTURA",
  "TEMPERATURA", "SLUMP", "OBSERVAÇÕES",
];

export async function listarTodosEnsaiosConcreto(organizacaoId: string): Promise<EnsaioRow[]> {
  const PAGE_SIZE = 1000;
  const rows: EnsaioRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("vw_ensaios_concreto")
      .select(ENSAIO_SELECT)
      .eq("organizacao_id", organizacaoId)
      .order("data_moldagem", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as EnsaioRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function buildEnsaiosConcretoWorkbook(rows: EnsaioRow[]): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const linhas: (string | number)[][] = [ENSAIOS_HEADERS];
  for (const r of rows) {
    linhas.push([
      r.cod_laboratorio ?? r.numero_carga ?? r.nota_fiscal ?? r.codigo_rastreabilidade,
      formatBR(r.data_moldagem),
      r.laboratorio_nome ?? "",
      r.numero_lab ?? "",
      r.peca_concretada ?? "",
      r.idade_prevista_dias,
      r.data_ruptura_real ? formatBR(r.data_ruptura_real) : "",
      r.resultado_mpa ?? "",
      r.tipo_ruptura ?? "",
      r.temperatura_concreto ?? "",
      r.slump_aplicacao ?? "",
      r.observacoes ?? "",
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = autoSizeFromRows(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ensaios de Concreto");
  return wb;
}

export async function downloadEnsaiosConcretoWorkbook(wb: WorkBook): Promise<void> {
  const XLSX = await import("xlsx");
  const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("");
  XLSX.writeFile(wb, `Concreto_Ensaios_${hoje}.xlsx`);
}
