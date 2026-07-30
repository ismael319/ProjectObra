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
