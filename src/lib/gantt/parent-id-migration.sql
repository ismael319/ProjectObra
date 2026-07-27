-- Migração: hierarquia no Gantt Livre (pai/filho), pra suportar importar a
-- estrutura completa do cronograma (resumos + tarefas) com indentação.
-- Execute esta query no Supabase SQL Editor

ALTER TABLE atividades ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES atividades(id) ON DELETE CASCADE;
