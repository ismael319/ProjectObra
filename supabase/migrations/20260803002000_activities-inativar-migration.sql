-- ============================================================
-- Inativar item da Programação (pra análise, quando não fica claro por que
-- não foi executado) — sai do cálculo de PPC/aderência enquanto estiver
-- inativo, mas continua visível na tela pra ser revisado depois.
-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Sem mudança de RLS: "Update activities" (acesso-3-niveis-migration.sql) já
-- é uma policy de linha (não por coluna), restrita a papel 'edicao' — cobre
-- essas colunas novas automaticamente.
-- ============================================================

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS inativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_inativacao text;
