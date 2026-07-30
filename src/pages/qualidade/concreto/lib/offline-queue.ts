// Fila de cargas de concreto capturadas offline (sem sinal na usina/canteiro),
// aguardando envio ao Supabase. Mesmo padrão de
// apontamento/lib/offline-queue.ts: vive em IndexedDB (store
// `cargas_concreto_queue`, ver src/lib/idb-kv.ts) pra sobreviver a fechar o
// app/recarregar a página entre a captura e a reconexão.
import { withConcretoQueueStore } from "@/lib/idb-kv";
import { supabase } from "@/lib/supabase";
import { isNetworkError } from "@/lib/offline-query";

export type QueuedCarga = {
  id: string; // crypto.randomUUID(), também usado como id do insert em cargas_concreto
  payload: Record<string, any>; // linha de cargas_concreto, congelada no momento do submit
  destinos: Record<string, any>[]; // linhas de destinos_carga (carga_id = payload.id), cada uma com seu próprio id gerado no cliente
  createdAt: string; // hora de captura em campo
  status: "pending" | "error";
  attempts: number;
  lastError?: string;
};

export async function enqueue(payload: Record<string, any>, destinos: Record<string, any>[]): Promise<QueuedCarga> {
  const item: QueuedCarga = {
    id: payload.id,
    payload,
    destinos,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await withConcretoQueueStore("readwrite", (store) => store.put(item));
  return item;
}

export async function listPending(): Promise<QueuedCarga[]> {
  const all = await withConcretoQueueStore<QueuedCarga[]>("readonly", (store) => store.getAll());
  return (all ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function remove(id: string): Promise<void> {
  await withConcretoQueueStore("readwrite", (store) => store.delete(id));
}

async function markError(item: QueuedCarga, message: string): Promise<void> {
  await withConcretoQueueStore("readwrite", (store) =>
    store.put({ ...item, status: "error", attempts: item.attempts + 1, lastError: message } satisfies QueuedCarga),
  );
}

export type DrainResult = {
  synced: string[];
  stillPending: number;
  errored: QueuedCarga[];
};

/**
 * Tenta enviar todas as cargas pendentes ao Supabase. Mesma lógica de
 * idempotência do offline-queue do Apontamento: `upsert` com
 * `ignoreDuplicates: true` (ON CONFLICT DO NOTHING) em vez de insert puro,
 * porque a RLS de cargas_concreto/destinos_carga libera INSERT pro papel
 * insercao_pontual mas não UPDATE — um upsert "normal" (ON CONFLICT DO
 * UPDATE) seria barrado num retry que colide com um insert anterior já
 * bem-sucedido. Os destinos entram só depois da carga confirmada, pra nunca
 * ficar destino órfão sem a carga (FK) se a rede cair no meio.
 */
export async function drain(): Promise<DrainResult> {
  const items = await listPending();
  const synced: string[] = [];
  const errored: QueuedCarga[] = [];

  for (const item of items) {
    const { error: cargaError, status: cargaStatus } = await supabase
      .from("cargas_concreto")
      .upsert(item.payload, { onConflict: "id", ignoreDuplicates: true });

    if (cargaError) {
      if (isNetworkError(cargaError, cargaStatus)) continue; // sem conexão ainda — mantém na fila, sem incomodar o usuário
      await markError(item, cargaError.message ?? "Erro desconhecido ao sincronizar carga");
      errored.push(item);
      continue;
    }

    if (item.destinos.length > 0) {
      const { error: destinosError, status: destinosStatus } = await supabase
        .from("destinos_carga")
        .upsert(item.destinos, { onConflict: "id", ignoreDuplicates: true });

      if (destinosError) {
        if (isNetworkError(destinosError, destinosStatus)) continue;
        await markError(item, destinosError.message ?? "Erro desconhecido ao sincronizar destinos da carga");
        errored.push(item);
        continue;
      }
    }

    await remove(item.id);
    synced.push(item.id);
  }

  return { synced, stillPending: (await listPending()).length, errored };
}
