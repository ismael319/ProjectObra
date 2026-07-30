// Armazenamento chave/valor genérico em IndexedDB — usado para dados grandes
// (projetos e cronogramas com timephased) que estourariam a cota de localStorage
// (~5-10MB por origem). IndexedDB tipicamente permite centenas de MB a alguns GB,
// proporcional ao espaço livre em disco.

const DB_NAME = 'obracontrol_kv'
const DB_VERSION = 3
const STORE_NAME = 'kv'
// Fila de apontamentos capturados offline, aguardando envio ao Supabase.
// Store separado (em vez de uma chave só no `kv`) para poder ler/gravar/
// remover item a item sem reescrever um array inteiro a cada mutação.
export const QUEUE_STORE_NAME = 'apontamentos_queue'
// Mesma ideia, store próprio pra fila de cargas de concreto capturadas
// offline (módulo Qualidade) — não reaproveita QUEUE_STORE_NAME porque o
// formato do payload é outro (cargas_concreto + destinos, não apontamentos).
export const CONCRETO_QUEUE_STORE_NAME = 'cargas_concreto_queue'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(CONCRETO_QUEUE_STORE_NAME)) {
        db.createObjectStore(CONCRETO_QUEUE_STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const request = fn(store)
    tx.onerror = () => reject(tx.error)
    if (request) {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    } else {
      tx.oncomplete = () => resolve(undefined as T)
    }
  })
}

export async function withQueueStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return withStore<T>(QUEUE_STORE_NAME, mode, fn)
}

export async function withConcretoQueueStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return withStore<T>(CONCRETO_QUEUE_STORE_NAME, mode, fn)
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
