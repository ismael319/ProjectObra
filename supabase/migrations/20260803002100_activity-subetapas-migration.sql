-- ============================================================
-- MIGRAÇÃO: Sub-etapas de uma atividade da Programação
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS programacao-migration.sql
--
-- Uma atividade do dia (uma linha de `activities`) pode ser composta por
-- várias frentes menores executadas no mesmo dia (ex.: "Bypass" = Armação +
-- Concretagem + Bases + Montagem). Cada sub-etapa é marcada concluída ou
-- não individualmente; o status da atividade (concluida/parcial/
-- nao_concluida) passa a ser CALCULADO a partir delas quando existirem —
-- ver computeStatusFromSubetapas em programacao-db.ts. Atividades sem
-- nenhuma sub-etapa continuam com os 3 botões manuais de sempre.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_subetapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  nome text NOT NULL,
  concluida boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_subetapas_activity_idx ON public.activity_subetapas (activity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_subetapas TO authenticated;
GRANT ALL ON public.activity_subetapas TO service_role;
ALTER TABLE public.activity_subetapas ENABLE ROW LEVEL SECURITY;

-- Mesmos papéis já usados em `activities` (ver programacao-migration.sql).
DROP POLICY IF EXISTS "Leitura activity_subetapas" ON public.activity_subetapas;
CREATE POLICY "Leitura activity_subetapas" ON public.activity_subetapas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert activity_subetapas" ON public.activity_subetapas;
CREATE POLICY "Insert activity_subetapas" ON public.activity_subetapas
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor','engenheiro','campo'));

DROP POLICY IF EXISTS "Update activity_subetapas" ON public.activity_subetapas;
CREATE POLICY "Update activity_subetapas" ON public.activity_subetapas
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor','engenheiro','campo'))
  WITH CHECK (public.user_papel() IN ('admin','gestor','engenheiro','campo'));

DROP POLICY IF EXISTS "Delete activity_subetapas" ON public.activity_subetapas;
CREATE POLICY "Delete activity_subetapas" ON public.activity_subetapas
  FOR DELETE TO authenticated
  USING (public.user_papel() IN ('admin','gestor','engenheiro','campo'));
