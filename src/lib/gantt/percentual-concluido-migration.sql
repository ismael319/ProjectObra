-- Migração: % de trabalho concluído por atividade no Gantt Livre.
-- Execute esta query no Supabase SQL Editor

ALTER TABLE atividades ADD COLUMN IF NOT EXISTS percentual_concluido NUMERIC NOT NULL DEFAULT 0;
