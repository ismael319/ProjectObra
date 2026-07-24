import { supabase } from "@/lib/supabase";
import { queuePut, queueGetAll, queueDelete } from "@/lib/idb-kv";

export type QueueStatus = "pendente" | "sincronizado" | "erro";

export interface QueueItem {
  id: string;
  payload: Record<string, any>;
  status: QueueStatus;
  criadoEm: string;
  tentativas: number;
  erro: string | null;
  sincronizadoEm: string | null;
}

export interface FlushResult {
  synced: number;
  stillPending: number;
  errored: number;
}

// crypto.randomUUID() só existe em contexto seguro (HTTPS ou localhost) — em
// campo, o link pode ser acessado por IP puro (http://) antes de haver HTTPS
// configurado, então precisa de um substituto que funcione em qualquer origem.
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Distingue falha de rede/offline (fica pendente, tenta de novo sozinho quando a
// conexão voltar) de erro real do banco (RLS, constraint etc. — não vai se
// resolver sozinho, precisa de ação manual). Falha de rede tipicamente chega
// como TypeError (fetch nunca teve resposta HTTP); erro real chega como objeto
// estruturado do Postgrest (code/message de uma resposta HTTP de verdade).
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message?: unknown }).message ?? "").toLowerCase();
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("load failed")) return true;
  }
  return false;
}

export async function enqueue(payload: Record<string, any>): Promise<QueueItem> {
  const item: QueueItem = {
    id: generateId(),
    payload,
    status: "pendente",
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    erro: null,
    sincronizadoEm: null,
  };
  await queuePut(item);
  return item;
}

export async function listQueue(): Promise<QueueItem[]> {
  const items = await queueGetAll<QueueItem>();
  return items.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export async function pendingCount(): Promise<number> {
  const items = await queueGetAll<QueueItem>();
  return items.filter((i) => i.status === "pendente").length;
}

export async function retryOne(id: string): Promise<void> {
  const items = await queueGetAll<QueueItem>();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  await queuePut({ ...item, status: "pendente", erro: null });
}

export async function removeSynced(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const items = await queueGetAll<QueueItem>();
  const cutoff = Date.now() - olderThanMs;
  for (const item of items) {
    if (item.status === "sincronizado" && item.sincronizadoEm && new Date(item.sincronizadoEm).getTime() < cutoff) {
      await queueDelete(item.id);
    }
  }
}

export async function flushQueue(): Promise<FlushResult> {
  const items = await listQueue();
  const pendentes = items.filter((i) => i.status === "pendente");

  if (!navigator.onLine || pendentes.length === 0) {
    return { synced: 0, stillPending: pendentes.length, errored: 0 };
  }

  let synced = 0;
  let errored = 0;
  let stillPending = 0;

  for (const item of pendentes) {
    try {
      const { error } = await supabase.from("apontamentos_diarios").insert(item.payload);
      if (error) throw error;
      await queuePut({ ...item, status: "sincronizado", sincronizadoEm: new Date().toISOString(), erro: null });
      synced += 1;
    } catch (err) {
      if (isNetworkFailure(err)) {
        // Sem conexão de verdade — os próximos itens do lote falhariam pelo
        // mesmo motivo, então para o processamento aqui em vez de tentar cada
        // um e só acumular a mesma falha várias vezes.
        stillPending = pendentes.length - synced - errored;
        break;
      }
      const message = err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message)
        : "Erro desconhecido ao sincronizar";
      await queuePut({ ...item, status: "erro", erro: message, tentativas: item.tentativas + 1 });
      errored += 1;
    }
  }

  return { synced, stillPending, errored };
}
