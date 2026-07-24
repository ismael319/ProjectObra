import { useEffect, useRef, useState } from "react";
import { catalogCacheGet, catalogCacheSet } from "@/lib/idb-kv";

interface CatalogQueryResult<T> {
  data: T[] | undefined;
  isSuccess: boolean;
}

// Espelha o resultado de uma query de catálogo (empresas, liderancas, etc.) no
// IndexedDB e usa esse espelho como fallback quando a tela abre offline pela
// primeira vez — o cache do react-query é só em memória e some ao recarregar,
// então sem isso os dropdowns ficariam vazios até a conexão voltar.
export function useCatalogWithOfflineFallback<T>(cacheKey: string, queryResult: CatalogQueryResult<T>): T[] {
  const [cached, setCached] = useState<T[] | undefined>(undefined);
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedKeyRef.current === cacheKey) return;
    loadedKeyRef.current = cacheKey;
    setCached(undefined);
    catalogCacheGet<T[]>(cacheKey).then((value) => setCached(value));
  }, [cacheKey]);

  useEffect(() => {
    if (queryResult.isSuccess && queryResult.data) {
      catalogCacheSet(cacheKey, queryResult.data);
    }
  }, [cacheKey, queryResult.isSuccess, queryResult.data]);

  return queryResult.data ?? cached ?? [];
}
