-- ============================================================
-- MIGRAÇÃO: Configuração de layout da Visão Geral (modo edição)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS rls-migration.sql (função user_papel())
-- E APÓS multi-tenant-fase1-migration.sql (organizacoes,
-- user_organizacao(), is_super_admin())
-- ============================================================
-- Guarda, por empresa, quais blocos da tela "Visão Geral" ficam visíveis e
-- em que ordem — configurado por admin/gestor no "modo edição", visto por
-- todo mundo da mesma empresa em modo visualização.

CREATE TABLE IF NOT EXISTS public.dashboard_visao_geral_config (
  organizacao_id uuid PRIMARY KEY REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  -- Array ordenado tipo [{"id":"kpis","visible":true}, ...] — a ordem do
  -- array já É a ordem de exibição, sem precisar de coluna de ordem separada.
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id)
);

ALTER TABLE public.dashboard_visao_geral_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.dashboard_visao_geral_config TO authenticated;

-- Leitura ampla: qualquer usuário aprovado da própria empresa (ou super
-- admin) — todo mundo precisa ver o layout customizado, só não editar.
DROP POLICY IF EXISTS "Leitura config dashboard da propria empresa" ON public.dashboard_visao_geral_config;
CREATE POLICY "Leitura config dashboard da propria empresa" ON public.dashboard_visao_geral_config
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

-- Escrita restrita: só papel 'edicao' da própria empresa (ou super admin).
-- ('admin'/'gestor' não existem mais desde acesso-3-niveis-migration.sql.)
DROP POLICY IF EXISTS "Admin ou gestor edita config dashboard" ON public.dashboard_visao_geral_config;
CREATE POLICY "Admin ou gestor edita config dashboard" ON public.dashboard_visao_geral_config
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'));
