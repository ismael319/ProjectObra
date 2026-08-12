import { vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}))
