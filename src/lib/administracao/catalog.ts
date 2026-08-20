import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  listarFuncionarios,
  listarDemissoes,
  listarTransferencias,
  listarDocumentosPorFuncionario,
  listarAlertasDocumentos,
  listarUltimaImportacaoEfetivo,
  efetivoDoDia,
} from "./db";

export type RhSetor = { id: string; nome: string; ativo: boolean };
export type RhEncarregado = { id: string; nome: string; ativo: boolean };
export type RhGrupo = { id: string; nome: string; ativo: boolean };
export type RhCargo = {
  id: string;
  nome: string;
  setor_padrao_id: string | null;
  grupo_id: string | null;
  categoria: "D" | "I" | null;
  mapeia_para_role_apontamento: "pedreiro" | "servente" | "carpinteiro" | null;
  ativo: boolean;
};
export type TipoDocumento = { id: string; key: string; nome: string; validade_dias: number; ativo: boolean };

function useRhCatalogo<T extends { nome: string }>(tabela: string, organizacaoId: string | undefined, colunas: string) {
  return useQuery({
    queryKey: [tabela, organizacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tabela)
        .select(colunas)
        .eq("organizacao_id", organizacaoId!)
        .eq("ativo", true);
      if (error) throw error;
      return (data as unknown as T[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
    enabled: !!organizacaoId,
  });
}

export function useRhSetores(organizacaoId?: string) {
  return useRhCatalogo<RhSetor>("rh_setores", organizacaoId, "id,nome,ativo");
}

export function useRhEncarregados(organizacaoId?: string) {
  return useRhCatalogo<RhEncarregado>("rh_encarregados", organizacaoId, "id,nome,ativo");
}

export function useRhGrupos(organizacaoId?: string) {
  return useRhCatalogo<RhGrupo>("rh_grupos", organizacaoId, "id,nome,ativo");
}

export function useRhCargos(organizacaoId?: string) {
  return useRhCatalogo<RhCargo>(
    "rh_cargos",
    organizacaoId,
    "id,nome,setor_padrao_id,grupo_id,categoria,mapeia_para_role_apontamento,ativo"
  );
}

export function useTiposDocumento(organizacaoId?: string) {
  return useRhCatalogo<TipoDocumento>("tipos_documento", organizacaoId, "id,key,nome,validade_dias,ativo");
}

export function useFuncionarios(organizacaoId?: string, projetoId?: string) {
  return useQuery({
    queryKey: ["funcionarios", organizacaoId, projetoId],
    queryFn: () => listarFuncionarios(organizacaoId!, projetoId!),
    enabled: !!organizacaoId && !!projetoId,
  });
}

export function useDemissoes(organizacaoId?: string, projetoId?: string) {
  return useQuery({
    queryKey: ["demissoes", organizacaoId, projetoId],
    queryFn: () => listarDemissoes(organizacaoId!, projetoId!),
    enabled: !!organizacaoId && !!projetoId,
  });
}

export function useTransferencias(organizacaoId?: string, projetoId?: string) {
  return useQuery({
    queryKey: ["transferencias", organizacaoId, projetoId],
    queryFn: () => listarTransferencias(organizacaoId!, projetoId!),
    enabled: !!organizacaoId && !!projetoId,
  });
}

export function useDocumentosFuncionario(funcionarioId?: string) {
  return useQuery({
    queryKey: ["documentos_funcionario", funcionarioId],
    queryFn: () => listarDocumentosPorFuncionario(funcionarioId!),
    enabled: !!funcionarioId,
  });
}

export function useAlertasDocumentos(organizacaoId?: string, projetoId?: string) {
  return useQuery({
    queryKey: ["alertas_documentos", organizacaoId, projetoId],
    queryFn: () => listarAlertasDocumentos(organizacaoId!, projetoId!),
    enabled: !!organizacaoId && !!projetoId,
  });
}

export function useEfetivoDoDia(organizacaoId: string | undefined, projetoId: string | undefined, data: string) {
  return useQuery({
    queryKey: ["efetivo_do_dia", organizacaoId, projetoId, data],
    queryFn: () => efetivoDoDia(organizacaoId!, projetoId!, data),
    enabled: !!organizacaoId && !!projetoId,
  });
}

export function useUltimaImportacaoEfetivo(organizacaoId?: string, projetoId?: string) {
  return useQuery({
    queryKey: ["ultima_importacao_efetivo", organizacaoId, projetoId],
    queryFn: () => listarUltimaImportacaoEfetivo(organizacaoId!, projetoId!),
    enabled: !!organizacaoId && !!projetoId,
  });
}
