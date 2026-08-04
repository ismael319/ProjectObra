-- ============================================================
-- Move todas as Lideranças cadastradas para a Empresa "BDR"
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS liderancas-empresa-migration.sql
--
-- Idempotente: cria a Empresa "BDR" se ainda não existir, depois associa
-- TODAS as lideranças (independente de já terem empresa ou não) a ela.
-- ============================================================

INSERT INTO public.empresas (nome, ativo)
SELECT 'BDR', true
WHERE NOT EXISTS (SELECT 1 FROM public.empresas WHERE nome = 'BDR');

UPDATE public.liderancas
SET empresa_id = (SELECT id FROM public.empresas WHERE nome = 'BDR' LIMIT 1);
