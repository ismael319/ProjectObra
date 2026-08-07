// Tipos e queries de leitura da Rastreabilidade de Concreto (ver
// 20260807050000_rastreabilidade-concreto-views-migration.sql).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type StatusConformidade = "pendente" | "conforme" | "nao_conforme" | "nao_aplica";

export type RastreabilidadeCarga = {
  carga_id: string;
  organizacao_id: string;
  codigo_rastreabilidade: string;
  data: string;
  numero_carga: string | null;
  nota_fiscal: string | null;
  cod_laboratorio: string | null;
  quantidade_m3: number;
  traco_id: string;
  traco_nome: string;
  fck_mpa: number;
  fornecedor_id: string;
  fornecedor_nome: string;
  total_cps: number;
  cps_pendentes: number;
  cps_atrasados: number;
  tem_ensaio_atrasado: boolean;
  status_conformidade_geral: "conforme" | "nao_conforme" | null;
};

export type EnsaioCorpoProva = {
  corpo_prova_id: string;
  organizacao_id: string;
  carga_id: string;
  codigo_rastreabilidade: string;
  data_carga: string;
  numero_carga: string | null;
  nota_fiscal: string | null;
  traco_id: string;
  traco_nome: string;
  fck_mpa: number;
  laboratorio_id: string | null;
  laboratorio_nome: string | null;
  numero_lab: string | null;
  peca_concretada: string | null;
  idade_prevista_dias: number;
  data_moldagem: string;
  data_ruptura_prevista: string;
  status: "pendente" | "rompido";
  ensaio_atrasado: boolean;
  ensaio_id: string | null;
  data_ruptura_real: string | null;
  resultado_mpa: number | null;
  tipo_ruptura: string | null;
  temperatura_concreto: number | null;
  slump_aplicacao: number | null;
  observacoes: string | null;
  status_conformidade: StatusConformidade;
};

/** Status agregado de uma carga pra exibir na lista/filtro — deriva das
 * colunas já calculadas na view, sem repetir a lógica de conformidade. */
export function statusGeralCarga(r: RastreabilidadeCarga): "sem_cps" | "nao_conforme" | "atrasado" | "pendente" | "conforme" {
  if (r.total_cps === 0) return "sem_cps";
  if (r.status_conformidade_geral === "nao_conforme") return "nao_conforme";
  if (r.tem_ensaio_atrasado) return "atrasado";
  if (r.status_conformidade_geral === "conforme" && r.cps_pendentes === 0) return "conforme";
  return "pendente";
}

export function useRastreabilidadeCargas(organizacaoId?: string) {
  return useQuery({
    queryKey: ["vw_rastreabilidade_concreto", organizacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_rastreabilidade_concreto")
        .select("*")
        .eq("organizacao_id", organizacaoId!)
        .order("data", { ascending: false });
      if (error) throw error;
      return data as RastreabilidadeCarga[];
    },
    enabled: !!organizacaoId,
  });
}

/** Ids de carga com algum CP cuja peça concretada bate com o texto — usado
 * pra busca por peça na lista (a view de cargas não agrega essa coluna,
 * texto livre por CP, então a busca precisa olhar corpos_prova direto). */
export async function buscarCargaIdsPorPeca(organizacaoId: string, texto: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("corpos_prova")
    .select("carga_id")
    .eq("organizacao_id", organizacaoId)
    .ilike("peca_concretada", `%${texto}%`);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.carga_id as string));
}

export function useEnsaiosDaCarga(cargaId: string | null) {
  return useQuery({
    queryKey: ["vw_ensaios_concreto", cargaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_ensaios_concreto")
        .select("*")
        .eq("carga_id", cargaId!)
        .order("idade_prevista_dias", { ascending: true });
      if (error) throw error;
      return data as EnsaioCorpoProva[];
    },
    enabled: !!cargaId,
  });
}
