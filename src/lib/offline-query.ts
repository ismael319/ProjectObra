// Helpers para telas que precisam continuar funcionando sem rede (ex.:
// apontador em campo). `fetchWithOfflineCache` cacheia a última resposta boa
// em IndexedDB e cai pra ela quando a busca falha por falta de conexão.
import { useSyncExternalStore } from "react";
import { idbGet, idbSet } from "./idb-kv";

type OfflineFetchResult<T> = { data: T | null; error: any; status?: number };

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
  const { data, error, status } = await fetcher();
  if (!error) {
    idbSet(cacheKey, { data, cachedAt: Date.now() }).catch(() => {});
    return data as T;
  }
  if (isNetworkError(error, status)) {
    const cached = await idbGet<{ data: T; cachedAt: number }>(cacheKey);
    if (cached) return cached.data;
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
