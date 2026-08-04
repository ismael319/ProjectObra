-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS histograma-mo-migration.sql
--
-- Remove a obrigatoriedade do campo "área" em histograma_cargos — por ora o
-- cadastro de cargo do Histograma não pede mais área (a coluna continua
-- existindo, só deixou de ser exigida, caso volte a fazer sentido depois).

ALTER TABLE public.histograma_cargos ALTER COLUMN area DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
