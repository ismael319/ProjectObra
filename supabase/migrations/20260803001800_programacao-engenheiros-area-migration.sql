-- ============================================================
-- MIGRAÇÃO: Engenheiro responsável por Área (nível 2 da EDT), por projeto
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: usa user_organizacao()/is_super_admin()/user_papel(), já
-- criadas em multi-tenant-fase1-migration.sql
--
-- Em vez de digitar o Engenheiro atividade por atividade toda semana na
-- importação, o usuário cadastra 1x qual engenheiro responde por cada área
-- do cronograma (mesmo nível 2 da EDT já usado como "Área" na importação) —
-- a 2ª etapa da importação passa a sugerir esse valor automaticamente
-- (ainda editável por atividade).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.programacao_engenheiros_area (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  area_nome text NOT NULL,
  engenheiro text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projeto_id, area_nome)
);

CREATE INDEX IF NOT EXISTS programacao_engenheiros_area_projeto_idx ON public.programacao_engenheiros_area (projeto_id);

ALTER TABLE public.programacao_engenheiros_area ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programacao_engenheiros_area TO authenticated;

DROP POLICY IF EXISTS "Leitura engenheiros_area da organizacao" ON public.programacao_engenheiros_area;
CREATE POLICY "Leitura engenheiros_area da organizacao" ON public.programacao_engenheiros_area
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao())
  );

DROP POLICY IF EXISTS "Edicao gerencia engenheiros_area" ON public.programacao_engenheiros_area;
CREATE POLICY "Edicao gerencia engenheiros_area" ON public.programacao_engenheiros_area
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.user_papel() = 'edicao'
      AND EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao())
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.user_papel() = 'edicao'
      AND EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao())
    )
  );
