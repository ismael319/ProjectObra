-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS 20260807020000_modulo-sistema-migration.sql
--
-- ISOLAMENTO POR ORGANIZAÇÃO das tabelas de Programação Semanal
-- (weeks, activities, activity_subetapas).
--
-- Motivo (item crítico da auditoria): weeks/activities/activity_subetapas não
-- tinham organizacao_id — semanas, atividades e sub-etapas de uma empresa
-- eram acessíveis por outra empresa no mesmo banco:
--   * weeks: SELECT USING(true) e UNIQUE(iso_year, iso_week) GLOBAL — duas
--     empresas na mesma semana ISO colidiam no mesmo registro, e qualquer um
--     lia a semana de qualquer empresa.
--   * activities: SELECT USING(true) (e só era "protegida" de cross-tenant por
--     acaso, pela policy RESTRICTIVE "Restringe a organizacao piloto" de
--     multi-tenant-fase1, que limita TUDO à org piloto e impede o uso
--     multi-tenant legítimo).
--   * activity_subetapas: policies de escrita por user_papel() global, sem
--     organização.
--
-- O que esta migration faz:
--   1. Adiciona organizacao_id (uuid NOT NULL REFERENCES organizacoes) nas 3
--      tabelas e faz backfill pra organizacao_piloto_id() — os dados legados
--      são todos de uma única empresa (a piloto).
--   2. Troca a UNIQUE global de weeks por UNIQUE(organizacao_id, iso_year,
--      iso_week) — cada empresa volta a ter sua própria semana por ISO.
--   3. Derruba TODAS as policies atuais (incluindo as RESTRICTIVE "Restringe
--      a organizacao piloto" e "Restringe pelo modulo engenharia") e recria
--      no mesmo padrão do módulo Concreto (20260807010000):
--      is_super_admin() OR (organizacao_id = user_organizacao() AND
--      user_ve_modulo('engenharia') [AND user_papel_modulo('engenharia') ...]).
--      semanas/atividades deixam de ser lidas por todos: ficam isoladas por
--      empresa e restritas ao módulo de engenharia. O papel "de campo"
--      (insercao_pontual) continua podendo inserir atividades/sub-etapas, mas
--      só na própria empresa.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. COLUNA organizacao_id ============

ALTER TABLE public.weeks
  ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE CASCADE;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE CASCADE;

ALTER TABLE public.activity_subetapas
  ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE CASCADE;

-- ============ 2. BACKFILL ============
-- Dados legados = tudo da empresa piloto (única empresa no banco até hoje).
-- activities/herda a org da semana; sub-etapas herdam a org da atividade;
-- fallback final pra piloto cobre dados órfãos impossíveis de rastrear.

UPDATE public.weeks SET organizacao_id = public.organizacao_piloto_id() WHERE organizacao_id IS NULL;

UPDATE public.activities a
SET organizacao_id = COALESCE(
  (SELECT w.organizacao_id FROM public.weeks w WHERE w.id = a.week_id),
  public.organizacao_piloto_id()
)
WHERE organizacao_id IS NULL;

UPDATE public.activity_subetapas s
SET organizacao_id = COALESCE(
  (SELECT a.organizacao_id FROM public.activities a WHERE a.id = s.activity_id),
  public.organizacao_piloto_id()
)
WHERE organizacao_id IS NULL;

-- ============ 3. NOT NULL ============

ALTER TABLE public.weeks ALTER COLUMN organizacao_id SET NOT NULL;
ALTER TABLE public.activities ALTER COLUMN organizacao_id SET NOT NULL;
ALTER TABLE public.activity_subetapas ALTER COLUMN organizacao_id SET NOT NULL;

-- ============ 4. UNIQUE + ÍNDICES ============
-- Semana única POR ORGANIZAÇÃO (não mais global).

ALTER TABLE public.weeks DROP CONSTRAINT IF EXISTS weeks_iso_year_iso_week_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weeks_org_iso_unique'
  ) THEN
    ALTER TABLE public.weeks ADD CONSTRAINT weeks_org_iso_unique UNIQUE (organizacao_id, iso_year, iso_week);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_weeks_org_iso ON public.weeks(organizacao_id, iso_year, iso_week);
CREATE INDEX IF NOT EXISTS idx_activities_org_week ON public.activities(organizacao_id, week_id);
CREATE INDEX IF NOT EXISTS idx_activities_org_date ON public.activities(organizacao_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_activity_subetapas_org ON public.activity_subetapas(organizacao_id);

-- ============ 5. POLICIES: weeks ============
-- Semanas não têm DELETE no app — só leitura/inserção/atualização, isoladas
-- por organização e restritas ao módulo de engenharia.

DROP POLICY IF EXISTS "Leitura weeks" ON public.weeks;
DROP POLICY IF EXISTS "Insert weeks" ON public.weeks;
DROP POLICY IF EXISTS "Update weeks" ON public.weeks;
DROP POLICY IF EXISTS "Restringe pelo modulo engenharia" ON public.weeks;
DROP POLICY IF EXISTS "Restringe a organizacao piloto" ON public.weeks;

CREATE POLICY "Leitura weeks" ON public.weeks
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia')));

CREATE POLICY "Insert weeks" ON public.weeks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'));

CREATE POLICY "Update weeks" ON public.weeks
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'));

-- ============ 6. POLICIES: activities ============
-- Mesmo split de activities hoje (insercao_pontual insere, só edicao
-- atualiza/exclui) — agora restrito à própria organização + módulo.

DROP POLICY IF EXISTS "Leitura activities" ON public.activities;
DROP POLICY IF EXISTS "Insert activities" ON public.activities;
DROP POLICY IF EXISTS "Update activities" ON public.activities;
DROP POLICY IF EXISTS "Delete activities" ON public.activities;
DROP POLICY IF EXISTS "Restringe pelo modulo engenharia" ON public.activities;
DROP POLICY IF EXISTS "Restringe a organizacao piloto" ON public.activities;

CREATE POLICY "Leitura activities" ON public.activities
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia')));

CREATE POLICY "Insert activities" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') IN ('edicao', 'insercao_pontual')));

CREATE POLICY "Update activities" ON public.activities
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'));

CREATE POLICY "Delete activities" ON public.activities
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'));

-- ============ 7. POLICIES: activity_subetapas ============
-- Mesmo split de activities, isolado por organização + módulo.

DROP POLICY IF EXISTS "Leitura activity_subetapas" ON public.activity_subetapas;
DROP POLICY IF EXISTS "Insert activity_subetapas" ON public.activity_subetapas;
DROP POLICY IF EXISTS "Update activity_subetapas" ON public.activity_subetapas;
DROP POLICY IF EXISTS "Delete activity_subetapas" ON public.activity_subetapas;

CREATE POLICY "Leitura activity_subetapas" ON public.activity_subetapas
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia')));

CREATE POLICY "Insert activity_subetapas" ON public.activity_subetapas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') IN ('edicao', 'insercao_pontual')));

CREATE POLICY "Update activity_subetapas" ON public.activity_subetapas
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'));

CREATE POLICY "Delete activity_subetapas" ON public.activity_subetapas
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao'));

NOTIFY pgrst, 'reload schema';
