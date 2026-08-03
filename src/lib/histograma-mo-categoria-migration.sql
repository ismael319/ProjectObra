-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS histograma-mo-migration.sql
--
-- Adiciona a distinção Direta (MOD) / Indireta (MOI) em histograma_cargos —
-- mesmo domínio ('D'/'I') já usado em rh_cargos/funcionarios no módulo
-- Administração. Nullable: cargos existentes continuam válidos sem
-- categoria definida.

ALTER TABLE public.histograma_cargos
  ADD COLUMN IF NOT EXISTS categoria text CHECK (categoria IN ('D', 'I'));

NOTIFY pgrst, 'reload schema';
