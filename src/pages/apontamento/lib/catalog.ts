import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Empresa = { id: string; nome: string; ativo: boolean };
export type Lideranca = { id: string; nome: string; tipo: string; ativo: boolean };
export type Setor = { id: string; nome: string; ativo: boolean };
export type Area = { id: string; setor_id: string; nome: string; ativo: boolean };
export type Subarea = { id: string; area_id: string; nome: string; ativo: boolean };
export type Atividade = { id: string; nome: string; ativo: boolean; subarea_id?: string | null };

export function useEmpresas(onlyActive = true) {
  return useQuery({
    queryKey: ["empresas", onlyActive],
    queryFn: async () => {
      let q = supabase.from("empresas").select("id,nome,ativo");
      if (onlyActive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Empresa[]).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export function useLiderancas(onlyActive = true) {
  return useQuery({
    queryKey: ["liderancas", onlyActive],
    queryFn: async () => {
      let q = supabase.from("liderancas").select("id,nome,tipo,ativo");
      if (onlyActive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Lideranca[]).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export function useSetores(onlyActive = true) {
  return useQuery({
    queryKey: ["setores", onlyActive],
    queryFn: async () => {
      let q = supabase.from("setores").select("id,nome,ativo");
      if (onlyActive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Setor[]).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export function useAreas(setorId?: string | null, onlyActive = true) {
  return useQuery({
    queryKey: ["areas", setorId ?? null, onlyActive],
    queryFn: async () => {
      let q = supabase.from("areas").select("id,setor_id,nome,ativo");
      if (setorId) q = q.eq("setor_id", setorId);
      if (onlyActive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Area[]).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export function useSubareas(areaId?: string | null, onlyActive = true) {
  return useQuery({
    queryKey: ["subareas", areaId ?? null, onlyActive],
    queryFn: async () => {
      let q = supabase.from("subareas").select("id,area_id,nome,ativo");
      if (areaId) q = q.eq("area_id", areaId);
      if (onlyActive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Subarea[]).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export function useAtividades(onlyActive = true) {
  return useQuery({
    queryKey: ["atividades", onlyActive],
    queryFn: async () => {
      let q = supabase.from("atividades").select("id,nome,ativo");
      if (onlyActive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Atividade[]).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export const TIPOS_LIDERANCA = ["MESTRE", "CONTRAMESTRE", "ENCARREGADO", "AUXILIAR"] as const;

export type Cronograma = {
  id: string;
  nome: string;
  ativo: boolean;
  data_importacao: string;
  arquivo_xml: string | null;
};

export type CronogramaItem = {
  id: string;
  cronograma_id: string;
  indice: string;
  nome: string;
  nivel: number | null;
  pai_id: string | null;
  hh_total: number | null;
  hh_ganho: number | null;
  hh_consumido: number | null;
  status: string | null;
  produtividade: number | null;
  aderencia: number | null;
  projecao_hh: number | null;
  atividade_id: string | null;
  ativo: boolean;
};

export type CronogramaSelecao = {
  id: string;
  usuario_id: string;
  cronograma_id: string;
  item_id: string;
  selecionado_em: string;
};

export function useCronogramas() {
  return useQuery({
    queryKey: ["cronogramas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cronogramas")
        .select("id,nome,ativo,data_importacao,arquivo_xml")
        .eq("ativo", true);
      if (error) {
        if (error.message?.includes("not found") || error.message?.includes("does not exist")) return [] as Cronograma[];
        throw error;
      }
      return (data as Cronograma[]).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export function useCronogramaItens(cronogramaId: string | null) {
  return useQuery({
    queryKey: ["cronograma_itens", cronogramaId],
    queryFn: async () => {
      if (!cronogramaId) return [] as CronogramaItem[];
      const { data, error } = await supabase
        .from("cronograma_itens")
        .select("id,cronograma_id,indice,nome,nivel,pai_id,hh_total,hh_ganho,hh_consumido,status,produtividade,aderencia,projecao_hh,atividade_id,ativo")
        .eq("cronograma_id", cronogramaId);
      if (error) {
        if (error.message?.includes("not found") || error.message?.includes("does not exist")) return [] as CronogramaItem[];
        throw error;
      }
      return (data as CronogramaItem[]).sort((a, b) => a.indice.localeCompare(b.indice));
    },
    enabled: !!cronogramaId,
  });
}

export function useCronogramaSelecoes(usuarioId: string | null) {
  return useQuery({
    queryKey: ["cronograma_selecoes", usuarioId],
    queryFn: async () => {
      if (!usuarioId) return [] as CronogramaSelecao[];
      const { data, error } = await supabase
        .from("cronograma_selecoes")
        .select("id,usuario_id,cronograma_id,item_id,selecionado_em")
        .eq("usuario_id", usuarioId);
      if (error) {
        if (error.message?.includes("not found") || error.message?.includes("does not exist")) return [] as CronogramaSelecao[];
        throw error;
      }
      return data as CronogramaSelecao[];
    },
    enabled: !!usuarioId,
  });
}
