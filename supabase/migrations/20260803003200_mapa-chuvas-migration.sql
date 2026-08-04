-- Migração: Mapa de Chuvas
-- Execute estas queries no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS mapa_chuvas (
  data DATE PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('sem_chuva', 'parcial', 'constante')),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mapa_chuvas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON mapa_chuvas;
CREATE POLICY "Allow all for authenticated" ON mapa_chuvas FOR ALL USING (true);

-- GRANT — sem isso o PostgREST nega o acesso antes mesmo de avaliar a política de RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON mapa_chuvas TO anon, authenticated;
