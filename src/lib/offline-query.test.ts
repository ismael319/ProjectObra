import { beforeEach, describe, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => new Map<string, unknown>())

vi.mock('./idb-kv', () => ({
  idbGet: vi.fn(async (key: string) => cache.get(key)),
  idbSet: vi.fn(async (key: string, value: unknown) => { cache.set(key, value) }),
  idbDelete: vi.fn(async (key: string) => { cache.delete(key) }),
}))

import { fetchWithOfflineCacheDetailed } from './offline-query'

describe('fetchWithOfflineCacheDetailed', () => {
  beforeEach(() => {
    cache.clear()
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('salva e identifica uma resposta da rede', async () => {
    const result = await fetchWithOfflineCacheDetailed('test:network', async () => ({
      data: ['novo'],
      error: null,
      status: 200,
    }))

    expect(result.data).toEqual(['novo'])
    expect(result.source).toBe('network')
    expect(cache.has('test:network')).toBe(true)
  })

  it('usa a última resposta salva quando a rede falha', async () => {
    cache.set('test:cache', { data: ['salvo'], cachedAt: 123 })

    const result = await fetchWithOfflineCacheDetailed('test:cache', async () => ({
      data: null,
      error: { code: '' },
      status: 0,
    }))

    expect(result).toEqual({ data: ['salvo'], source: 'cache', cachedAt: 123 })
  })

  it('não esconde erros reais do banco com dados antigos', async () => {
    cache.set('test:database', { data: ['salvo'], cachedAt: Date.now() })
    const databaseError = { code: '42501', message: 'Acesso negado' }

    await expect(fetchWithOfflineCacheDetailed('test:database', async () => ({
      data: null,
      error: databaseError,
      status: 403,
    }))).rejects.toBe(databaseError)
  })

  it('remove cache expirado em vez de apresentar dado como atual', async () => {
    cache.set('test:expired', { data: ['antigo'], cachedAt: 100 })
    const networkError = { code: '' }

    await expect(fetchWithOfflineCacheDetailed('test:expired', async () => ({
      data: null,
      error: networkError,
      status: 0,
    }), { maxAgeMs: 1 })).rejects.toBe(networkError)
    expect(cache.has('test:expired')).toBe(false)
  })
})
