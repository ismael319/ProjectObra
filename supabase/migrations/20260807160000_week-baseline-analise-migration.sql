-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Migration: Baseline da programação semanal + Análise semanal
-- 1. Tabela week_baseline: snapshot das atividades no momento do bloqueio
-- 2. Coluna analise_semanal: campo de observações sobre a semana
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. Tabela week_baseline ============
-- Snapshot das atividades no momento em que a semana é bloqueada.
-- Usado para calcular a "Aderência do Cronograma" (plano original vs atual).

CREATE TABLE IF NOT EXISTS public.week_baseline (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL,
  name text NOT NULL,
  company text,
  discipline text,
  area text,
  stage text,
  foreman text,
  planned_date date NOT NULL,
  planned_pct numeric(5,2) DEFAULT 100,
  status text NOT NULL DEFAULT 'pendente',
  is_extra boolean NOT NULL DEFAULT false,
  source_cronograma text,
  task_uid text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_week_baseline_week ON public.week_baseline(week_id);
CREATE INDEX IF NOT EXISTS idx_week_baseline_org ON public.week_baseline(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_week_baseline_activity ON public.week_baseline(activity_id);

-- RLS: isolamento por organização
ALTER TABLE public.week_baseline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "week_baseline_select" ON public.week_baseline;
CREATE POLICY "week_baseline_select" ON public.week_baseline
  FOR SELECT USING (organizacao_id = (SELECT organizacao_id FROM public.user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "week_baseline_insert" ON public.week_baseline;
CREATE POLICY "week_baseline_insert" ON public.week_baseline
  FOR INSERT WITH CHECK (organizacao_id = (SELECT organizacao_id FROM public.user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "week_baseline_delete" ON public.week_baseline;
CREATE POLICY "week_baseline_delete" ON public.week_baseline
  FOR DELETE USING (organizacao_id = (SELECT organizacao_id FROM public.user_profiles WHERE id = auth.uid()));

-- ============ 2. Coluna analise_semanal ============
-- Campo de texto livre para observações sobre a semana
-- (itens não concluídos, reprogramações, etc.)

ALTER TABLE public.weeks
  ADD COLUMN IF NOT EXISTS analise_semanal text;

-- ============ 3. Função para salvar baseline ============
-- Copia todas as atividades da semana para week_baseline

CREATE OR REPLACE FUNCTION public.save_week_baseline(p_week_id uuid, p_organizacao_id uuid)
RETURNS void AS $$
BEGIN
  -- Limpa baseline anterior (se existir)
  DELETE FROM public.week_baseline
  WHERE week_id = p_week_id AND organizacao_id = p_organizacao_id;

  -- Copia atividades atuais
  INSERT INTO public.week_baseline (
    week_id, organizacao_id, activity_id, name, company, discipline,
    area, stage, foreman, planned_date, planned_pct, status,
    is_extra, source_cronograma, task_uid
  )
  SELECT
    p_week_id,
    p_organizacao_id,
    a.id,
    a.name,
    a.company,
    a.discipline,
    a.area,
    a.stage,
    a.foreman,
    a.planned_date,
    a.planned_pct,
    a.status,
    a.is_extra,
    a.source_cronograma,
    a.task_uid
  FROM public.activities a
  WHERE a.week_id = p_week_id
    AND a.organizacao_id = p_organizacao_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 4. Função para limpar baseline ============

CREATE OR REPLACE FUNCTION public.clear_week_baseline(p_week_id uuid, p_organizacao_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM public.week_baseline
  WHERE week_id = p_week_id AND organizacao_id = p_organizacao_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 5. Função para análise semanal ============
-- Retorna resumo: itens não concluídos, reprogramações, extras

CREATE OR REPLACE FUNCTION public.get_week_analysis(p_week_id uuid, p_organizacao_id uuid)
RETURNS TABLE (
  activity_id uuid,
  activity_name text,
  planned_date date,
  baseline_date date,
  baseline_status text,
  current_status text,
  is_extra boolean,
  was_reprogrammed boolean,
  was_added_after_lock boolean,
  was_removed_after_lock boolean
) AS $$
BEGIN
  RETURN QUERY
  -- Itens que existem no baseline E na programação atual
  SELECT
    COALESCE(b.activity_id, a.id) AS activity_id,
    COALESCE(b.name, a.name) AS activity_name,
    COALESCE(a.planned_date, b.planned_date) AS planned_date,
    b.planned_date AS baseline_date,
    b.status AS baseline_status,
    COALESCE(a.status, 'removida') AS current_status,
    COALESCE(a.is_extra, false) AS is_extra,
    (b.planned_date IS DISTINCT FROM a.planned_date) AS was_reprogrammed,
    (b.activity_id IS NULL) AS was_added_after_lock,
    (a.activity_id IS NULL) AS was_removed_after_lock
  FROM public.week_baseline b
  FULL OUTER JOIN public.activities a
    ON a.id = b.activity_id
    AND a.week_id = p_week_id
    AND a.organizacao_id = p_organizacao_id
  WHERE b.week_id = p_week_id
    AND b.organizacao_id = p_organizacao_id
  ORDER BY COALESCE(b.planned_date, a.planned_date), COALESCE(b.name, a.name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 6. Grants ============

GRANT SELECT ON public.week_baseline TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_week_baseline(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_week_baseline(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_week_analysis(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
