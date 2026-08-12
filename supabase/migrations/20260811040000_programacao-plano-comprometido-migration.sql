-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Migration: Plano comprometido da programação semanal
--
-- Hoje o baseline da semana é tirado no FECHAMENTO (lockWeekWithBaseline chama
-- save_week_baseline na sexta), copiando status já preenchidos. O snapshot não é
-- o plano de segunda, é uma fotocópia do resultado — e por isso o delta da
-- Análise Semanal (aderência atual − aderência do baseline) dá sempre ~zero.
--
-- Esta migration prepara o banco para o baseline ser tirado no INÍCIO da semana:
-- 1. Estado 'comprometida' entre rascunho e consolidado
-- 2. activities.fora_do_plano — atividade que veio do cronograma por data mas
--    não entra no plano desta semana
-- 3. week_baseline ganha as colunas que o cálculo passa a usar
-- 4. GRANT INSERT/DELETE em week_baseline (nunca foi concedido)
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. Novo estado 'comprometida' ============
-- IMPORTANTE: rode este bloco SOZINHO primeiro se o SQL Editor reclamar de
-- "unsafe use of new value of enum type". No PostgreSQL o valor novo de um enum
-- não pode ser USADO na mesma transação em que foi criado. Nada mais neste
-- arquivo escreve o literal 'comprometida', então rodar tudo de uma vez costuma
-- funcionar — mas se falhar, rode este ALTER TYPE isolado e depois o resto.

ALTER TYPE public.week_status ADD VALUE IF NOT EXISTS 'comprometida' AFTER 'rascunho';

-- ============ 2. activities.fora_do_plano ============
-- findActivitiesWithWorkInWeek traz do cronograma tudo que atravessa a semana por
-- data, inclusive atividade em andamento que o engenheiro já sabe que estará
-- pausada. Até agora a única saída era marcá-la Inativa depois — e é exatamente
-- esse uso que o alerta de "reprogramação incoerente" (delta >= 10pp no WeekBar)
-- sinaliza como maquiagem. O mecanismo necessário era lido como fraude.
--
-- Diferença para `inativa`:
--   fora_do_plano -> decidido ANTES de comprometer; a atividade nunca fez parte
--                    do plano da semana, então não entra no baseline.
--   inativa       -> imprevisto no MEIO da semana; já estava comprometida e
--                    travou, continua no baseline e precisa de análise.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS fora_do_plano boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_fora text;

COMMENT ON COLUMN public.activities.fora_do_plano IS
  'Veio do cronograma por data mas não entra no plano desta semana (decidido antes de comprometer). Fica fora do baseline e do denominador do PPC.';

-- Filtro mais comum da tela da semana: "as que entram no plano".
CREATE INDEX IF NOT EXISTS idx_activities_week_fora_plano
  ON public.activities(week_id) WHERE fora_do_plano;

-- ============ 3. week_baseline vira o PLANO, não o resultado ============
-- Com o snapshot no início da semana, todos os status nele são 'pendente' — ele
-- define o CONJUNTO comprometido, e o resultado vem do status ATUAL da atividade
-- (ver computeIndicatorsBaseline). Para isso o baseline precisa carregar as
-- mesmas flags que o cálculo usa.

ALTER TABLE public.week_baseline
  ADD COLUMN IF NOT EXISTS inativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_extra_original boolean NOT NULL DEFAULT false;

-- ============ 4. GRANT que faltava em week_baseline ============
-- A migration 20260807160000 criou as policies de INSERT e DELETE mas concedeu
-- só SELECT (linha 151). saveWeekBaseline/clearWeekBaseline inserem e apagam
-- direto via PostgREST — sem estes GRANTs, a policy nunca chega a ser avaliada.

GRANT INSERT, DELETE ON public.week_baseline TO authenticated;

-- ============ 5. save_week_baseline: exclui fora_do_plano, leva as flags ======
-- Substitui a versão de 20260808000000 (que já tinha o search_path fixado).
-- Mudanças: WHERE fora_do_plano = false, e as duas colunas novas no INSERT.

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
    week_id, organizacao_id, activity_id, name, company, discipline, area,
    stage, foreman, planned_date, planned_pct, status, is_extra,
    source_cronograma, task_uid, inativa, is_extra_original
  )
  SELECT
    a.week_id, a.organizacao_id, a.id, a.name, a.company, a.discipline, a.area,
    a.stage, a.foreman, a.planned_date, a.planned_pct, a.status, a.is_extra,
    a.source_cronograma, a.task_uid, a.inativa,
    COALESCE(a.is_extra_original, a.is_extra)
  FROM public.activities a
  WHERE a.week_id = p_week_id
    AND a.organizacao_id = p_organizacao_id
    -- O que tira a atividade pausada do denominador sem ela precisar virar Inativa.
    AND a.fora_do_plano = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_week_baseline(uuid, uuid) TO authenticated;

-- ============ 6. get_week_analysis: consertar o FULL OUTER JOIN ============
-- A versão anterior filtrava `WHERE b.week_id = ... AND b.organizacao_id = ...`
-- DEPOIS do FULL OUTER JOIN. Como as linhas do lado direito (atividade sem
-- baseline) vêm com b.* nulo, o WHERE descartava todas — was_added_after_lock
-- nunca era true e o bloco "Extras Adicionados" do ModalAnaliseSemana ficava
-- sempre vazio, sem erro nenhum. Os filtros passam para dentro de CTEs, antes do
-- join, que é onde deveriam estar.
--
-- Também passa a ignorar fora_do_plano: essas atividades não fazem parte do
-- plano, então não são "extra adicionado depois".

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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.week_baseline
    WHERE week_id = p_week_id AND organizacao_id = p_organizacao_id
  ),
  atual AS (
    SELECT * FROM public.activities
    WHERE week_id = p_week_id
      AND organizacao_id = p_organizacao_id
      AND fora_do_plano = false
  )
  SELECT
    COALESCE(b.activity_id, a.id) AS activity_id,
    COALESCE(b.name, a.name) AS activity_name,
    COALESCE(a.planned_date, b.planned_date) AS planned_date,
    b.planned_date AS baseline_date,
    b.status AS baseline_status,
    COALESCE(a.status::text, 'removida') AS current_status,
    COALESCE(a.is_extra, b.is_extra, false) AS is_extra,
    -- Só é reprogramação se o item existe dos dois lados; senão o IS DISTINCT
    -- FROM contra NULL marcava todo item removido/adicionado como reprogramado.
    (b.activity_id IS NOT NULL AND a.id IS NOT NULL
      AND b.planned_date IS DISTINCT FROM a.planned_date) AS was_reprogrammed,
    (b.activity_id IS NULL) AS was_added_after_lock,
    (a.id IS NULL) AS was_removed_after_lock
  FROM base b
  FULL OUTER JOIN atual a ON a.id = b.activity_id
  ORDER BY COALESCE(b.planned_date, a.planned_date), COALESCE(b.name, a.name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_week_analysis(uuid, uuid) TO authenticated;
