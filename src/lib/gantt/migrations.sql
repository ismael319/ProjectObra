-- Migrações SQL para o Gantt Livre
-- Execute estas queries no Supabase SQL Editor

-- Tabela de cenários
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de equipes
CREATE TABLE IF NOT EXISTS equipes (
  id TEXT PRIMARY KEY,
  scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL,
  funcoes JSONB DEFAULT '[]',
  equipamentos JSONB DEFAULT '[]',
  funcao TEXT,
  quantidade_funcionarios INTEGER DEFAULT 0
);

-- Tabela de atividades
CREATE TABLE IF NOT EXISTS atividades (
  id TEXT PRIMARY KEY,
  scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  equipes_alocadas TEXT[] DEFAULT '{}',
  cor TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  predecessoras JSONB DEFAULT '[]'
);

-- Tabela de paradas
CREATE TABLE IF NOT EXISTS paradas (
  id TEXT PRIMARY KEY,
  scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  UNIQUE(scenario_id, data)
);

-- RLS (Row Level Security)
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE paradas ENABLE ROW LEVEL SECURITY;

-- Políticas (permitir tudo para authenticated)
DO $$ BEGIN
  CREATE POLICY "Allow all for authenticated" ON scenarios FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all for authenticated" ON equipes FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all for authenticated" ON atividades FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all for authenticated" ON paradas FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- GRANTs — sem isso o Postgres nega o acesso ANTES de avaliar a política de RLS
-- acima. As políticas "USING (true)" sozinhas não bastam; precisam de um GRANT de
-- tabela pra cada papel. Faltava especificamente em "atividades" (causa do Gantt
-- Livre "não funcionar": criar atividade parecia dar certo na tela, mas o insert
-- falhava silenciosamente e nada era salvo — ao recarregar a página, sumia).
GRANT SELECT, INSERT, UPDATE, DELETE ON scenarios TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON atividades TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON paradas TO anon, authenticated;

-- ============ CORREÇÃO: "atividades" existia com um schema antigo ============
-- A tabela já existia (criada antes com só id+nome), então o CREATE TABLE IF NOT
-- EXISTS lá em cima não fez nada — faltavam as colunas abaixo. Idempotente: rodar
-- de novo não tem efeito colateral.
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE;
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS data_inicio DATE;
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS data_fim DATE;
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS equipes_alocadas TEXT[] DEFAULT '{}';
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS cor TEXT;
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS predecessoras JSONB DEFAULT '[]';

-- Reforça GRANT + policy de "atividades" com DROP+CREATE (em vez do
-- EXCEPTION WHEN duplicate_object de cima, que pode ter mascarado uma falha
-- silenciosa na primeira tentativa) — garante que aplica de fato desta vez.
DROP POLICY IF EXISTS "Allow all for authenticated" ON atividades;
CREATE POLICY "Allow all for authenticated" ON atividades FOR ALL USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON atividades TO anon, authenticated;
