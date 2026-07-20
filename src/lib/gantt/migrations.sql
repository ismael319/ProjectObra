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
