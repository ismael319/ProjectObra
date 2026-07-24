// Armazenamento chave/valor genérico em IndexedDB — usado para dados grandes
// (projetos e cronogramas com timephased) que estourariam a cota de localStorage
// (~5-10MB por origem). IndexedDB tipicamente permite centenas de MB a alguns GB,
// proporcional ao espaço livre em disco.

const DB_NAME = 'obracontrol_kv'
const DB_VERSION = 2
const STORE_NAME = 'kv'
// Fila de lançamentos pendentes de sincronização (tela de campo offline) e
// espelho local das listas de catálogo (empresa/liderança/etc.) — mesmo banco,
// stores separados, pra não precisar gerenciar uma segunda conexão IndexedDB.
const QUEUE_STORE_NAME = 'lancamentos_queue'
const CATALOG_CACHE_STORE_NAME = 'catalog_cache'

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
        const queueStore = db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'id' })
        queueStore.createIndex('status', 'status')
      }
      if (!db.objectStoreNames.contains(CATALOG_CACHE_STORE_NAME)) {
        db.createObjectStore(CATALOG_CACHE_STORE_NAME)
      }
    }
  })
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

export async function queuePut<T extends { id: string }>(item: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite')
    tx.objectStore(QUEUE_STORE_NAME).put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function queueGetAll<T>(): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readonly')
    const request = tx.objectStore(QUEUE_STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

export async function queueDelete(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite')
    tx.objectStore(QUEUE_STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function catalogCacheGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CATALOG_CACHE_STORE_NAME, 'readonly')
    const request = tx.objectStore(CATALOG_CACHE_STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function catalogCacheSet(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CATALOG_CACHE_STORE_NAME, 'readwrite')
    tx.objectStore(CATALOG_CACHE_STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
