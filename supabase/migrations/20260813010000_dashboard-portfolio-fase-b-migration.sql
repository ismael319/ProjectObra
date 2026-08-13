-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS 20260813000000_dashboard-portfolio-fase-a-migration.sql
-- e APÓS 20260811040000_programacao-plano-comprometido-migration.sql (já rodada)
-- ============================================================
-- FASE B do Dashboard Macro / Modo Apresentação: projeto_id em Programação
-- Semanal (weeks/activities/activity_subetapas/week_baseline) e em RDR
-- (rdr_records).
--
-- Hoje essas tabelas são isoladas só por organizacao_id — 1 conjunto de
-- dados por EMPRESA, não por OBRA (ver 20260807030000_programacao-
-- isolamento-org-migration.sql e 20260803004100_rdr-migration.sql). Sem
-- projeto_id aqui não dá pra alimentar PPC/restrições/ocorrências por
-- projeto no Dashboard Macro.
--
-- PREMISSA DO BACKFILL (confirmada com o usuário em 2026-08-13): toda
-- empresa no banco tem hoje EXATAMENTE 1 projeto cadastrado — por isso o
-- backfill abaixo aponta cada linha existente pro único projeto da empresa
-- dela, sem ambiguidade. A seção 0 verifica essa premissa e ABORTA a
-- migration inteira (RAISE EXCEPTION) se encontrar uma empresa com
-- Programação/RDR e não exatamente 1 projeto — não assume silenciosamente.
--
-- Idempotente — seguro rodar mais de uma vez (a seção 0 só barra a primeira
-- vez, antes do backfill; depois disso projeto_id já não é mais nulo).
-- ============================================================

-- ============ 1. COLUNA projeto_id (nullable por enquanto) ============
-- Precisa vir ANTES da verificação da seção 0 — o SELECT dela lê w.projeto_id
-- e r.projeto_id, que só existem depois destes ALTER TABLE.

ALTER TABLE public.weeks ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE;
ALTER TABLE public.activity_subetapas ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE;
ALTER TABLE public.week_baseline ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE;
-- rdr_records fica nullable pra sempre: existe ocorrência que não é de
-- nenhuma obra específica (ex.: administrativa) — o Dashboard Macro só soma
-- as que têm projeto_id.
ALTER TABLE public.rdr_records ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL;

-- ============ 0. VERIFICAÇÃO DA PREMISSA (aborta se não bater) ============

DO $$
DECLARE
  problematicas text;
BEGIN
  SELECT string_agg(o.nome, ', ') INTO problematicas
  FROM public.organizacoes o
  WHERE (SELECT count(*) FROM public.projetos p WHERE p.organizacao_id = o.id) <> 1
    AND (
      EXISTS (SELECT 1 FROM public.weeks w WHERE w.organizacao_id = o.id AND w.projeto_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.rdr_records r WHERE r.organizacao_id = o.id AND r.projeto_id IS NULL)
    );
  IF problematicas IS NOT NULL THEN
    RAISE EXCEPTION 'Empresas com Programação/RDR mas sem exatamente 1 projeto: %. O backfill automático desta migration assume 1 projeto por empresa — resolva manualmente (cadastre ou remova projetos) antes de rodar de novo.', problematicas;
  END IF;
END $$;

-- ============ 2. BACKFILL ============
-- weeks/rdr_records: direto do único projeto da empresa (garantido pela
-- seção 0). activities/activity_subetapas/week_baseline: herdam de weeks
-- via week_id, não recalculam — assim ficam corretas mesmo se uma empresa
-- só tiver projeto cadastrado DEPOIS de já ter semanas (o projeto de
-- weeks.projeto_id já resolvido é a fonte, não a organização de novo).

UPDATE public.weeks w
SET projeto_id = (SELECT p.id FROM public.projetos p WHERE p.organizacao_id = w.organizacao_id LIMIT 1)
WHERE w.projeto_id IS NULL;

UPDATE public.activities a
SET projeto_id = w.projeto_id
FROM public.weeks w
WHERE w.id = a.week_id AND a.projeto_id IS NULL;

UPDATE public.activity_subetapas s
SET projeto_id = a.projeto_id
FROM public.activities a
WHERE a.id = s.activity_id AND s.projeto_id IS NULL;

UPDATE public.week_baseline b
SET projeto_id = w.projeto_id
FROM public.weeks w
WHERE w.id = b.week_id AND b.projeto_id IS NULL;

UPDATE public.rdr_records r
SET projeto_id = (SELECT p.id FROM public.projetos p WHERE p.organizacao_id = r.organizacao_id LIMIT 1)
WHERE r.projeto_id IS NULL;

-- ============ 3. NOT NULL onde faz sentido (não em rdr_records) ============

ALTER TABLE public.weeks ALTER COLUMN projeto_id SET NOT NULL;
ALTER TABLE public.activities ALTER COLUMN projeto_id SET NOT NULL;
ALTER TABLE public.activity_subetapas ALTER COLUMN projeto_id SET NOT NULL;
ALTER TABLE public.week_baseline ALTER COLUMN projeto_id SET NOT NULL;

-- ============ 4. UNIQUE + ÍNDICES ============
-- Semana única por PROJETO agora, não só por empresa — cada obra tem seu
-- próprio calendário de semanas.

ALTER TABLE public.weeks DROP CONSTRAINT IF EXISTS weeks_org_iso_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weeks_org_projeto_iso_unique'
  ) THEN
    ALTER TABLE public.weeks ADD CONSTRAINT weeks_org_projeto_iso_unique UNIQUE (organizacao_id, projeto_id, iso_year, iso_week);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_weeks_projeto ON public.weeks(projeto_id);
CREATE INDEX IF NOT EXISTS idx_activities_projeto ON public.activities(projeto_id);
CREATE INDEX IF NOT EXISTS idx_activity_subetapas_projeto ON public.activity_subetapas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_week_baseline_projeto ON public.week_baseline(projeto_id);
CREATE INDEX IF NOT EXISTS idx_rdr_records_projeto ON public.rdr_records(projeto_id);

-- ============ 5. POLICIES: weeks/activities/activity_subetapas ============
-- Mesmo texto exato de 20260807030000 (is_super_admin() OR (organizacao_id
-- = user_organizacao() AND user_ve_modulo('engenharia') AND
-- user_papel_modulo('engenharia') = ...)), só com "AND user_ve_projeto(...)"
-- empilhado — não reinvento a regra de módulo/papel, só acrescento a de
-- projeto (ver Fase A: user_ve_projeto, 20260813000000).

DROP POLICY IF EXISTS "Leitura weeks" ON public.weeks;
DROP POLICY IF EXISTS "Insert weeks" ON public.weeks;
DROP POLICY IF EXISTS "Update weeks" ON public.weeks;

CREATE POLICY "Leitura weeks" ON public.weeks
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_ve_projeto(projeto_id)));

CREATE POLICY "Insert weeks" ON public.weeks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)));

CREATE POLICY "Update weeks" ON public.weeks
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)));

DROP POLICY IF EXISTS "Leitura activities" ON public.activities;
DROP POLICY IF EXISTS "Insert activities" ON public.activities;
DROP POLICY IF EXISTS "Update activities" ON public.activities;
DROP POLICY IF EXISTS "Delete activities" ON public.activities;

CREATE POLICY "Leitura activities" ON public.activities
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_ve_projeto(projeto_id)));

CREATE POLICY "Insert activities" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') IN ('edicao', 'insercao_pontual') AND public.user_ve_projeto(projeto_id)));

CREATE POLICY "Update activities" ON public.activities
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)));

CREATE POLICY "Delete activities" ON public.activities
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)));

DROP POLICY IF EXISTS "Leitura activity_subetapas" ON public.activity_subetapas;
DROP POLICY IF EXISTS "Insert activity_subetapas" ON public.activity_subetapas;
DROP POLICY IF EXISTS "Update activity_subetapas" ON public.activity_subetapas;
DROP POLICY IF EXISTS "Delete activity_subetapas" ON public.activity_subetapas;

CREATE POLICY "Leitura activity_subetapas" ON public.activity_subetapas
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_ve_projeto(projeto_id)));

CREATE POLICY "Insert activity_subetapas" ON public.activity_subetapas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') IN ('edicao', 'insercao_pontual') AND public.user_ve_projeto(projeto_id)));

CREATE POLICY "Update activity_subetapas" ON public.activity_subetapas
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)));

CREATE POLICY "Delete activity_subetapas" ON public.activity_subetapas
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') = 'edicao' AND public.user_ve_projeto(projeto_id)));

-- ============ 6. POLICIES: week_baseline ============
-- Mesmo formato simples de 20260807160000 (subquery direta em user_profiles,
-- sem módulo/papel — baseline só é gravado via save_week_baseline, que já é
-- SECURITY DEFINER), só acrescentando o projeto.

DROP POLICY IF EXISTS "week_baseline_select" ON public.week_baseline;
CREATE POLICY "week_baseline_select" ON public.week_baseline
  FOR SELECT USING (
    organizacao_id = (SELECT organizacao_id FROM public.user_profiles WHERE id = auth.uid())
    AND public.user_ve_projeto(projeto_id)
  );

DROP POLICY IF EXISTS "week_baseline_insert" ON public.week_baseline;
CREATE POLICY "week_baseline_insert" ON public.week_baseline
  FOR INSERT WITH CHECK (
    organizacao_id = (SELECT organizacao_id FROM public.user_profiles WHERE id = auth.uid())
    AND public.user_ve_projeto(projeto_id)
  );

DROP POLICY IF EXISTS "week_baseline_delete" ON public.week_baseline;
CREATE POLICY "week_baseline_delete" ON public.week_baseline
  FOR DELETE USING (
    organizacao_id = (SELECT organizacao_id FROM public.user_profiles WHERE id = auth.uid())
    AND public.user_ve_projeto(projeto_id)
  );

-- ============ 7. POLICIES: rdr_records ============
-- projeto_id NULL = ocorrência sem obra vinculada, continua visível pra
-- quem já vê a empresa (não é restrita a projeto nenhum).

DROP POLICY IF EXISTS "Leitura rdr_records da organizacao" ON public.rdr_records;
CREATE POLICY "Leitura rdr_records da organizacao" ON public.rdr_records
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND (projeto_id IS NULL OR public.user_ve_projeto(projeto_id))));

DROP POLICY IF EXISTS "Insert rdr_records" ON public.rdr_records;
CREATE POLICY "Insert rdr_records" ON public.rdr_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() IN ('edicao', 'insercao_pontual', 'visualizacao') AND (projeto_id IS NULL OR public.user_ve_projeto(projeto_id))));

DROP POLICY IF EXISTS "Update rdr_records" ON public.rdr_records;
CREATE POLICY "Update rdr_records" ON public.rdr_records
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao() AND (projeto_id IS NULL OR public.user_ve_projeto(projeto_id))))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao() AND (projeto_id IS NULL OR public.user_ve_projeto(projeto_id))));

DROP POLICY IF EXISTS "Delete rdr_records" ON public.rdr_records;
CREATE POLICY "Delete rdr_records" ON public.rdr_records
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao() AND (projeto_id IS NULL OR public.user_ve_projeto(projeto_id))));

-- ============ 8. FUNÇÕES DE BASELINE/ANÁLISE PASSAM O PROJETO ADIANTE =====
-- save_week_baseline (Fase 2 da aderência, 20260811040000) grava o baseline
-- puxando de `activities` — já vai trazer o projeto certo automaticamente
-- por causa da FK, mas a coluna projeto_id do INSERT precisa ser listada
-- explicitamente pra não ficar NULL nas linhas novas.

CREATE OR REPLACE FUNCTION public.save_week_baseline(p_week_id uuid, p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.week_baseline
  WHERE week_id = p_week_id AND organizacao_id = p_organizacao_id;

  INSERT INTO public.week_baseline (
    week_id, organizacao_id, projeto_id, activity_id, name, company, discipline, area,
    stage, foreman, planned_date, planned_pct, status, is_extra,
    source_cronograma, task_uid, inativa, is_extra_original
  )
  SELECT
    a.week_id, a.organizacao_id, a.projeto_id, a.id, a.name, a.company, a.discipline, a.area,
    a.stage, a.foreman, a.planned_date, a.planned_pct, a.status, a.is_extra,
    a.source_cronograma, a.task_uid, a.inativa,
    COALESCE(a.is_extra_original, a.is_extra)
  FROM public.activities a
  WHERE a.week_id = p_week_id
    AND a.organizacao_id = p_organizacao_id
    AND a.fora_do_plano = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_week_baseline(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
