import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchWithOfflineCache } from "@/lib/offline-query";

// Cadastros de apoio do Concreto (Fornecedores/Traços) — cacheados em
// IndexedDB a cada busca bem-sucedida e servidos desse cache quando a rede
// falhar, mesmo padrão de apontamento/lib/catalog.ts (o Lançamento de carga
// também precisa funcionar sem sinal na usina/canteiro). Diferente das
// tabelas globais do Apontamento, essas são por organização — a cacheKey e
// a queryKey incluem organizacaoId.
const OFFLINE_CATALOG_OPTS = {
  networkMode: "always" as const,
  retry: false,
  staleTime: 5 * 60_000,
};

export type FornecedorConcreto = {
  id: string;
  nome: string;
  tipo: "propria" | "externa";
  ativo: boolean;
};

export type EtapaConcreto = {
  id: string;
  nome: string;
  ativo: boolean;
};

export type SetorConcreto = {
  id: string;
  nome: string;
  ativo: boolean;
};

export type AreaConcreto = {
  id: string;
  setor_concreto_id: string;
  nome: string;
  ativo: boolean;
};

export type TracoConcreto = {
  id: string;
  nome: string;
  fck_mpa: number;
  consumo_cimento_kg_m3: number | null;
  consumo_brita00_kg_m3: number | null;
  consumo_brita01_kg_m3: number | null;
  consumo_po_brita_kg_m3: number | null;
  consumo_areia_kg_m3: number | null;
  consumo_agua_l_m3: number | null;
  consumo_aditivo1_l_m3: number | null;
  consumo_aditivo2_l_m3: number | null;
  preco_unitario_m3: number | null;
  ativo: boolean;
};

export function useFornecedoresConcreto(organizacaoId?: string, onlyActive = true) {
  return useQuery({
    queryKey: ["fornecedores_concreto", organizacaoId, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:fornecedores_concreto:${organizacaoId}:${onlyActive}`, async () => {
        let q = supabase.from("fornecedores_concreto").select("id,nome,tipo,ativo").eq("organizacao_id", organizacaoId!).retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as FornecedorConcreto[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))),
    enabled: !!organizacaoId,
    ...OFFLINE_CATALOG_OPTS,
  });
}

// Etapa de aplicação do concreto (RADIER, PILAR, LAJE...) — catálogo próprio
// por organização, independente de Área/Setor (ver 20260806010000_etapas-
// concreto-migration.sql pro porquê disso substituir a antiga cascata
// Setor→Área→Etapa que reaproveitava subareas do Apontamento).
export function useEtapasConcreto(organizacaoId?: string, onlyActive = true) {
  return useQuery({
    queryKey: ["etapas_concreto", organizacaoId, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:etapas_concreto:${organizacaoId}:${onlyActive}`, async () => {
        let q = supabase.from("etapas_concreto").select("id,nome,ativo").eq("organizacao_id", organizacaoId!).retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as EtapaConcreto[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))),
    enabled: !!organizacaoId,
    ...OFFLINE_CATALOG_OPTS,
  });
}

export async function seedEtapasConcretoPadrao(organizacaoId: string): Promise<void> {
  const { error } = await supabase.rpc("seed_etapas_concreto_padrao", { p_organizacao_id: organizacaoId });
  if (error) throw new Error(error.message);
}

// Setores/Áreas do Lançamento de Concreto — catálogo PRÓPRIO por organização,
// separado dos setores/areas globais do Apontamento de efetivo (ver
// 20260807060000_concreto-setores-areas-migration.sql). Copiar o catálogo do
// Apontamento (seed_setores_areas_concreto_padrao) é opcional — o botão
// "Copiar do Apontamento" no Cadastro só traz as opções existentes pra dentro
// do Concreto; dali em diante cada módulo edita os próprios nomes.
export function useSetoresConcreto(organizacaoId?: string, onlyActive = true) {
  return useQuery({
    queryKey: ["setores_concreto", organizacaoId, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:setores_concreto:${organizacaoId}:${onlyActive}`, async () => {
        let q = supabase.from("setores_concreto").select("id,nome,ativo").eq("organizacao_id", organizacaoId!).retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as SetorConcreto[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))),
    enabled: !!organizacaoId,
    ...OFFLINE_CATALOG_OPTS,
  });
}

// setorConcretoId filtra em memória sobre a lista JÁ cacheada (mesmo padrão
// de useAreas no apontamento/lib/catalog.ts) — trocar de setor não dispara
// nova busca e qualquer setor funciona offline depois de abrir a tela online.
export function useAreasConcreto(setorConcretoId?: string | null, organizacaoId?: string, onlyActive = true) {
  return useQuery({
    queryKey: ["areas_concreto", organizacaoId, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:areas_concreto:${organizacaoId}:${onlyActive}`, async () => {
        let q = supabase.from("areas_concreto").select("id,setor_concreto_id,nome,ativo").eq("organizacao_id", organizacaoId!).retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as AreaConcreto[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))),
    select: (data) => (setorConcretoId ? data.filter((a) => a.setor_concreto_id === setorConcretoId) : data),
    enabled: !!organizacaoId,
    ...OFFLINE_CATALOG_OPTS,
  });
}

export async function seedSetoresAreasConcretoDoApontamento(organizacaoId: string): Promise<void> {
  const { error } = await supabase.rpc("seed_setores_areas_concreto_padrao", { p_organizacao_id: organizacaoId });
  if (error) throw new Error(error.message);
}

export type Laboratorio = {
  id: string;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
};

export function useLaboratorios(organizacaoId?: string, onlyActive = true) {
  return useQuery({
    queryKey: ["laboratorios", organizacaoId, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:laboratorios:${organizacaoId}:${onlyActive}`, async () => {
        let q = supabase.from("laboratorios").select("id,nome,cnpj,contato,telefone,email,ativo").eq("organizacao_id", organizacaoId!).retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as Laboratorio[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))),
    enabled: !!organizacaoId,
    ...OFFLINE_CATALOG_OPTS,
  });
}

export function useTracosConcreto(organizacaoId?: string, onlyActive = true) {
  return useQuery({
    queryKey: ["tracos_concreto", organizacaoId, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:tracos_concreto:${organizacaoId}:${onlyActive}`, async () => {
        let q = supabase.from("tracos_concreto").select("*").eq("organizacao_id", organizacaoId!).retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as TracoConcreto[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))),
    enabled: !!organizacaoId,
    ...OFFLINE_CATALOG_OPTS,
  });
}
