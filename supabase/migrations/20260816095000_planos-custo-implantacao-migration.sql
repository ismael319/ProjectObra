-- ============================================================
-- MIGRAÇÃO: Custo único de implantação por plano (Fase F)
-- Execute este SQL no Supabase SQL Editor do ProjectObra, APÓS
-- catalogo-comercial-leitura-publica-migration.sql
-- ============================================================
-- Taxa única (não recorrente) de cadastro + treinamento, cobrada só no
-- primeiro mês. Por plano (não fixa) porque Enterprise é negociado — mesmo
-- padrão de preco_base_mensal (NULL = "sob consulta").

ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS custo_implantacao numeric(10, 2);

UPDATE public.planos SET custo_implantacao = 1000.00 WHERE codigo IN ('ESSENCIAL', 'PROFISSIONAL');

NOTIFY pgrst, 'reload schema';
