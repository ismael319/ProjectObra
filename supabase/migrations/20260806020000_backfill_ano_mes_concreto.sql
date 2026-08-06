-- ============================================================
-- MÓDULO "Qualidade" — Concreto
-- Backfill de ano_mes / ano_semana
-- ============================================================
-- As colunas ano_mes/ano_semana foram adicionadas por
-- 20260730144733_cargas_concreto_ajustes.sql SEM backfill — cargas
-- registradas antes dela (lançamento manual ou importação) ficaram com as
-- colunas NULL, e o Dashboard de Concreto soma/agrupa por ano_mes (e quebra
-- se ele vier nulo). Esta migration preenche o que estiver NULL derivando da
-- coluna `data`, com o MESMO algoritmo de src/pages/qualidade/concreto/lib/
-- concreto-utils.ts:
--   ano_mes    = "YYYY-MM"   -> to_char(data, 'YYYY-MM')
--   ano_semana = "YYYY-WW"   -> ISO 8601, to_char(data, 'IYYY') || '-' ||
--                               to_char(data, 'IW') (equivalente ao isoWeek()
--                               usado no JS, semana ISO 01-53)
-- Idempotente — só toca linhas onde alguma das colunas está NULL OU vazia
-- (linhas antigas podem ter '' em vez de NULL, dependendo de como entraram).
-- ============================================================

UPDATE public.cargas_concreto
SET
  ano_mes = to_char(data, 'YYYY-MM'),
  ano_semana = to_char(data, 'IYYY') || '-' || to_char(data, 'IW')
WHERE ano_mes IS NULL OR ano_mes = ''
   OR ano_semana IS NULL OR ano_semana = '';
