-- ============================================================
-- MIGRAÇÃO: vincula cada Liderança a uma Empresa (terceira)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Lideranças (mestres/contramestres/encarregados/auxiliares) passam a
-- pertencer a uma Empresa cadastrada — a tela de Cadastro > Lideranças
-- passa a ter uma subaba por Empresa. Nullable: lideranças já cadastradas
-- ficam sem empresa até serem editadas e associadas manualmente.
-- ============================================================

ALTER TABLE public.liderancas ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);

CREATE INDEX IF NOT EXISTS liderancas_empresa_id_idx ON public.liderancas (empresa_id);
