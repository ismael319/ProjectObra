import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchWithOfflineCache } from "@/lib/offline-query";
import { useAuth } from "@/lib/auth-context";

// Cadastros de apoio usados nos combos do Lançamento em campo: cacheados em
// IndexedDB a cada busca bem-sucedida e servidos desse cache quando a rede
// falhar (ver fetchWithOfflineCache). networkMode "always" é necessário
// porque o React Query, por padrão, nem chama o queryFn offline — a query
// fica "pausada" e o fallback pro cache nunca roda. retry desligado nas duas
// camadas (aqui e no builder do supabase-js) evita empilhar backoff antes de
// cair pro cache.
const OFFLINE_CATALOG_OPTS = {
  networkMode: "always" as const,
  retry: false,
  refetchOnReconnect: "always" as const,
  staleTime: 5 * 60_000,
};

export type Empresa = { id: string; nome: string; ativo: boolean };
export type Lideranca = { id: string; nome: string; tipo: string; ativo: boolean };
export type Setor = { id: string; nome: string; ativo: boolean };
export type Area = { id: string; setor_id: string; nome: string; ativo: boolean };
export type Subarea = { id: string; area_id: string; nome: string; ativo: boolean };
export type Atividade = { id: string; nome: string; ativo: boolean; subarea_id?: string | null };

function useCatalogScope() {
  const { user, userProfile } = useAuth();
  return {
    cacheScope: user && userProfile ? `${userProfile.organizacao_id ?? "all"}:${user.id}` : "pending",
    cacheReady: !!user && !!userProfile,
  };
}

export function useEmpresas(onlyActive = true) {
  const { cacheScope, cacheReady } = useCatalogScope();
  return useQuery({
    queryKey: ["empresas", cacheScope, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:v2:${cacheScope}:empresas:${onlyActive}`, async () => {
        let q = supabase.from("empresas").select("id,nome,ativo").retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as Empresa[]).sort((a, b) => a.nome.localeCompare(b.nome))),
    enabled: cacheReady,
    ...OFFLINE_CATALOG_OPTS,
  });
}

export function useLiderancas(onlyActive = true) {
  const { cacheScope, cacheReady } = useCatalogScope();
  return useQuery({
    queryKey: ["liderancas", cacheScope, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:v2:${cacheScope}:liderancas:${onlyActive}`, async () => {
        let q = supabase.from("liderancas").select("id,nome,tipo,ativo").retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as Lideranca[]).sort((a, b) => a.nome.localeCompare(b.nome))),
    enabled: cacheReady,
    ...OFFLINE_CATALOG_OPTS,
  });
}

export function useSetores(onlyActive = true) {
  const { cacheScope, cacheReady } = useCatalogScope();
  return useQuery({
    queryKey: ["setores", cacheScope, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:v2:${cacheScope}:setores:${onlyActive}`, async () => {
        let q = supabase.from("setores").select("id,nome,ativo").retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as Setor[]).sort((a, b) => a.nome.localeCompare(b.nome))),
    enabled: cacheReady,
    ...OFFLINE_CATALOG_OPTS,
  });
}

// setorId/areaId filtram em memória (`select`) sobre a lista JÁ cacheada, em
// vez de entrar na queryKey/cacheKey — antes, cada setor selecionado gerava
// uma chave de cache OFFLINE diferente (`catalog:areas:<setorId>:...`), então
// só o setor que o usuário já tinha aberto enquanto online funcionava sem
// rede; os outros vinham com a lista de Área vazia. Buscando tudo de uma vez
// (mesmo padrão de empresas/lideranças/setores) e filtrando depois, qualquer
// setor funciona offline assim que a tela é aberta uma vez online — e trocar
// de setor deixa de disparar uma nova busca de rede.
export function useAreas(setorId?: string | null, onlyActive = true) {
  const { cacheScope, cacheReady } = useCatalogScope();
  return useQuery({
    queryKey: ["areas", cacheScope, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:v2:${cacheScope}:areas:${onlyActive}`, async () => {
        let q = supabase.from("areas").select("id,setor_id,nome,ativo").retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as Area[]).sort((a, b) => a.nome.localeCompare(b.nome))),
    select: (data) => (setorId ? data.filter((a) => a.setor_id === setorId) : data),
    enabled: cacheReady,
    ...OFFLINE_CATALOG_OPTS,
  });
}

export function useSubareas(areaId?: string | null, onlyActive = true) {
  const { cacheScope, cacheReady } = useCatalogScope();
  return useQuery({
    queryKey: ["subareas", cacheScope, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:v2:${cacheScope}:subareas:${onlyActive}`, async () => {
        let q = supabase.from("subareas").select("id,area_id,nome,ativo").retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as Subarea[]).sort((a, b) => a.nome.localeCompare(b.nome))),
    select: (data) => (areaId ? data.filter((s) => s.area_id === areaId) : data),
    enabled: cacheReady,
    ...OFFLINE_CATALOG_OPTS,
  });
}

export function useAtividades(onlyActive = true) {
  const { cacheScope, cacheReady } = useCatalogScope();
  return useQuery({
    queryKey: ["atividades", cacheScope, onlyActive],
    queryFn: () =>
      fetchWithOfflineCache(`catalog:v2:${cacheScope}:atividades:${onlyActive}`, async () => {
        let q = supabase.from("atividades").select("id,nome,ativo").retry(false);
        if (onlyActive) q = q.eq("ativo", true);
        return await q;
      }).then((data) => (data as Atividade[]).sort((a, b) => a.nome.localeCompare(b.nome))),
    enabled: cacheReady,
    ...OFFLINE_CATALOG_OPTS,
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
