// Helpers para telas que precisam continuar funcionando sem rede (ex.:
// apontador em campo). `fetchWithOfflineCache` cacheia a última resposta boa
// em IndexedDB e cai pra ela quando a busca falha por falta de conexão.
import { useSyncExternalStore } from "react";
import { idbDelete, idbGet, idbSet } from "./idb-kv";

type OfflineFetchResult<T> = { data: T | null; error: any; status?: number };

export type OfflineCacheResult<T> = {
  data: T;
  source: "network" | "cache";
  cachedAt: number;
};

type OfflineCacheOptions = {
  maxAgeMs?: number;
};

/**
 * Distingue falha de rede (sem sinal, DNS, timeout) de erro real do
 * Postgres/PostgREST. O postgrest-js sempre devolve `code: ''` e `status: 0`
 * quando o próprio `fetch` falhou (ver PostgrestBuilder.ts); erros reais do
 * banco (RLS, unique violation, not-null, etc.) sempre trazem `code` preenchido.
 */
export function isNetworkError(error: unknown, status?: number): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!error) return false;
  const code = (error as { code?: string })?.code;
  if (code) return false;
  if (typeof status === "number" && status !== 0) return false;
  return true;
}

export async function fetchWithOfflineCache<T>(
  cacheKey: string,
  fetcher: () => Promise<OfflineFetchResult<T>>,
): Promise<T> {
  const result = await fetchWithOfflineCacheDetailed(cacheKey, fetcher);
  return result.data;
}

export async function fetchWithOfflineCacheDetailed<T>(
  cacheKey: string,
  fetcher: () => Promise<OfflineFetchResult<T>>,
  options: OfflineCacheOptions = {},
): Promise<OfflineCacheResult<T>> {
  const { data, error, status } = await fetcher();
  if (!error) {
    const cachedAt = Date.now();
    idbSet(cacheKey, { data, cachedAt }).catch(() => {});
    return { data: data as T, source: "network", cachedAt };
  }
  if (isNetworkError(error, status)) {
    const cached = await idbGet<{ data: T; cachedAt: number }>(cacheKey);
    if (cached) {
      if (options.maxAgeMs && Date.now() - cached.cachedAt > options.maxAgeMs) {
        await idbDelete(cacheKey).catch(() => {});
      } else {
        return { data: cached.data, source: "cache", cachedAt: cached.cachedAt };
      }
    }
  }
  throw error;
}

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
