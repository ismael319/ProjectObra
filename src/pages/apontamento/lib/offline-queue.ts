// Fila de apontamentos capturados offline (sem sinal em campo), aguardando
// envio ao Supabase. Vive em IndexedDB (store `apontamentos_queue`, ver
// src/lib/idb-kv.ts) pra sobreviver a fechar o app/recarregar a página entre
// a captura e a reconexão.
import { withQueueStore } from "@/lib/idb-kv";
import { supabase } from "@/lib/supabase";
import { isNetworkError } from "@/lib/offline-query";

export type QueuedApontamento = {
  id: string; // crypto.randomUUID(), também usado como id do insert no Supabase
  payload: Record<string, any>; // saída de computeApontamento(), congelada no momento do submit
  createdAt: string; // hora de captura em campo
  status: "pending" | "error";
  attempts: number;
  lastError?: string;
};

export async function enqueue(payload: Record<string, any>): Promise<QueuedApontamento> {
  const item: QueuedApontamento = {
    id: payload.id,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await withQueueStore("readwrite", (store) => store.put(item));
  return item;
}

export async function listPending(): Promise<QueuedApontamento[]> {
  const all = await withQueueStore<QueuedApontamento[]>("readonly", (store) => store.getAll());
  return (all ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function remove(id: string): Promise<void> {
  await withQueueStore("readwrite", (store) => store.delete(id));
}

async function markError(item: QueuedApontamento, message: string): Promise<void> {
  await withQueueStore("readwrite", (store) =>
    store.put({ ...item, status: "error", attempts: item.attempts + 1, lastError: message } satisfies QueuedApontamento),
  );
}

export type DrainResult = {
  synced: string[];
  stillPending: number;
  errored: QueuedApontamento[];
};

/**
 * Tenta enviar todos os apontamentos pendentes ao Supabase. Usa `upsert` com
 * `ignoreDuplicates: true` (ON CONFLICT DO NOTHING) em vez de `insert` puro ou
 * de um `upsert` "normal": a RLS de `apontamentos_diarios` libera INSERT pro
 * papel `campo`, mas não UPDATE, então um upsert que gerasse
 * `ON CONFLICT DO UPDATE` seria barrado num retry que colide com um insert
 * anterior já bem-sucedido (ex.: resposta perdida por rede instável antes de
 * confirmar sucesso). `ignoreDuplicates: true` não aciona a política de
 * update — só ignora a duplicata — e assim o reenvio fica seguro (idempotente)
 * sem precisar mudar a RLS.
 */
export async function drain(): Promise<DrainResult> {
  const items = await listPending();
  const synced: string[] = [];
  const errored: QueuedApontamento[] = [];

  for (const item of items) {
    const { error, status } = await supabase
      .from("apontamentos_diarios")
      .upsert(item.payload, { onConflict: "id", ignoreDuplicates: true });

    if (!error) {
      await remove(item.id);
      synced.push(item.id);
      continue;
    }

    if (isNetworkError(error, status)) {
      // Sem conexão ainda — mantém na fila, sem incomodar o usuário.
      continue;
    }

    // Erro real (validação, RLS, etc.) — não adianta re-tentar sozinho.
    await markError(item, error.message ?? "Erro desconhecido ao sincronizar");
    errored.push(item);
  }

  return { synced, stillPending: (await listPending()).length, errored };
}
