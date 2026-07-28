-- ============================================================
-- MIGRAÇÃO: Tabelas de Programação Semanal
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================

-- ============ ENUMS ============

DO $$ BEGIN
  CREATE TYPE public.week_status AS ENUM ('rascunho', 'consolidado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_status AS ENUM ('pendente', 'concluida', 'parcial', 'nao_concluida');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ TABELA: weeks ============

CREATE TABLE IF NOT EXISTS public.weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_year integer NOT NULL,
  iso_week integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.week_status NOT NULL DEFAULT 'rascunho',
  consolidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (iso_year, iso_week)
);

GRANT SELECT, INSERT, UPDATE ON public.weeks TO authenticated;
GRANT ALL ON public.weeks TO service_role;
ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura weeks" ON public.weeks;
CREATE POLICY "Leitura weeks" ON public.weeks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert weeks" ON public.weeks;
CREATE POLICY "Insert weeks" ON public.weeks
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor','engenheiro'));

DROP POLICY IF EXISTS "Update weeks" ON public.weeks;
CREATE POLICY "Update weeks" ON public.weeks
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor','engenheiro'))
  WITH CHECK (public.user_papel() IN ('admin','gestor','engenheiro'));

-- ============ TABELA: activities ============

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  task_uid text,
  name text NOT NULL,
  company text,
  discipline text,
  area text,
  stage text,
  foreman text,
  planned_date date NOT NULL,
  planned_pct numeric(5,2) NOT NULL DEFAULT 100,
  status public.activity_status NOT NULL DEFAULT 'pendente',
  is_extra boolean NOT NULL DEFAULT false,
  observation text,
  actual_productivity text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura activities" ON public.activities;
CREATE POLICY "Leitura activities" ON public.activities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert activities" ON public.activities;
CREATE POLICY "Insert activities" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor','engenheiro','campo'));

DROP POLICY IF EXISTS "Update activities" ON public.activities;
CREATE POLICY "Update activities" ON public.activities
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor','engenheiro','campo'))
  WITH CHECK (public.user_papel() IN ('admin','gestor','engenheiro','campo'));

DROP POLICY IF EXISTS "Delete activities" ON public.activities;
CREATE POLICY "Delete activities" ON public.activities
  FOR DELETE TO authenticated
  USING (public.user_papel() IN ('admin','gestor','engenheiro'));

-- ============ TABELA: app_settings ============

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura app_settings" ON public.app_settings;
CREATE POLICY "Leitura app_settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin gerencia settings" ON public.app_settings;
CREATE POLICY "Admin gerencia settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.user_papel() = 'admin')
  WITH CHECK (public.user_papel() = 'admin');

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS idx_weeks_iso ON public.weeks(iso_year, iso_week);
CREATE INDEX IF NOT EXISTS idx_activities_week ON public.activities(week_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON public.activities(planned_date);
CREATE INDEX IF NOT EXISTS idx_activities_status ON public.activities(status);

-- ============ SEED: Peso parcial padrão ============

INSERT INTO public.app_settings (key, value)
VALUES ('partial_weight', '0.5'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============ TRIGGER: updated_at ============

CREATE OR REPLACE FUNCTION public.set_updated_at_programacao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_activities_upd ON public.activities;
CREATE TRIGGER trg_activities_upd
BEFORE UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_programacao();
