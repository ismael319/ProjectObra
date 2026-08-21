-- Migrações SQL para o Gantt Livre
-- Execute estas queries no Supabase SQL Editor
--
-- ATENÇÃO: este script cria as políticas de RLS originais ("Allow all for
-- authenticated" — sem nenhum isolamento por obra). Se as tabelas já
-- existirem, rode também supabase/migrations/20260821000000_gantt-livre-
-- isolamento-por-obra-migration.sql em seguida (ou em vez deste, numa
-- instalação nova) — sem ela, todo cenário do Gantt Livre fica visível e
-- editável por qualquer obra de qualquer organização.

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

-- Tabela de atividades do Gantt Livre — chamada "gantt_atividades", NÃO
-- "atividades": esse nome já é usado pela EAP (Apontamento), e Postgres só
-- permite UMA tabela "public.atividades". Numa tentativa anterior, o
-- CREATE TABLE IF NOT EXISTS "atividades" do Gantt Livre acabava sendo um
-- no-op (a tabela da EAP já existia) e os ALTER TABLE seguintes tentavam
-- colar colunas do Gantt em cima da tabela da EAP — dava erro de tipo (id
-- da EAP é UUID, o Gantt esperava TEXT) e, mesmo quando não dava erro,
-- misturava duas features completamente diferentes na mesma tabela.
CREATE TABLE IF NOT EXISTS gantt_atividades (
  id TEXT PRIMARY KEY,
  scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
  -- Pai na hierarquia (ex.: uma linha "resumo" importada do WBS do
  -- cronograma) — null = item de nível raiz.
  parent_id TEXT REFERENCES gantt_atividades(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  equipes_alocadas TEXT[] DEFAULT '{}',
  cor TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  percentual_concluido NUMERIC NOT NULL DEFAULT 0,
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
ALTER TABLE gantt_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE paradas ENABLE ROW LEVEL SECURITY;

-- Políticas (permitir tudo para authenticated) — DROP+CREATE em vez de
-- EXCEPTION WHEN duplicate_object, que pode mascarar falha silenciosa.
DROP POLICY IF EXISTS "Allow all for authenticated" ON scenarios;
CREATE POLICY "Allow all for authenticated" ON scenarios FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON equipes;
CREATE POLICY "Allow all for authenticated" ON equipes FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON gantt_atividades;
CREATE POLICY "Allow all for authenticated" ON gantt_atividades FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON paradas;
CREATE POLICY "Allow all for authenticated" ON paradas FOR ALL USING (true);

-- GRANTs — sem isso o Postgres nega o acesso ANTES de avaliar a política de
-- RLS acima. As políticas "USING (true)" sozinhas não bastam; precisam de um
-- GRANT de tabela pra cada papel.
GRANT SELECT, INSERT, UPDATE, DELETE ON scenarios TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gantt_atividades TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON paradas TO anon, authenticated;

-- Idempotente: caso "gantt_atividades" já exista de uma tentativa anterior
-- sem essas colunas, garante que elas existem.
ALTER TABLE gantt_atividades ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES gantt_atividades(id) ON DELETE CASCADE;
ALTER TABLE gantt_atividades ADD COLUMN IF NOT EXISTS percentual_concluido NUMERIC NOT NULL DEFAULT 0;
