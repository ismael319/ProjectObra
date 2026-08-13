-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS 20260813010000_dashboard-portfolio-fase-b-migration.sql
-- ============================================================
-- FASE C do Dashboard Macro / Modo Apresentação: KPIs agregados por projeto,
-- reaproveitando os mesmos cálculos/thresholds já usados nas telas
-- individuais (Curva S, PPC da Programação Semanal, RDR) — não inventa
-- critério novo.
--
-- ⚠️ PRÉ-REQUISITO MANUAL: a extensão pg_cron precisa estar habilitada
-- (Database → Extensions no painel do Supabase) ANTES de rodar esta
-- migration, senão o refresh agendado é pulado (com um NOTICE, não quebra o
-- resto) e só o refresh sob demanda (chamado pelo Modo Apresentação) mantém
-- o snapshot atualizado.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============ 1. projetos.percentual_planejado ============
-- Espelha percentual_avanco: calculado no navegador (EVM — Valor Planejado
-- ponderado por custo/duração de cada atividade, ver calcPlanejadoFromCronogramas
-- em src/lib/project-store.tsx) e persistido aqui porque o servidor não tem
-- como recalcular isso a partir do `dados` comprimido de cada cronograma.

ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS percentual_planejado numeric NOT NULL DEFAULT 0;

-- ============ 2. MATERIALIZED VIEW projeto_kpis_snapshot ============

DROP MATERIALIZED VIEW IF EXISTS public.projeto_kpis_snapshot;

CREATE MATERIALIZED VIEW public.projeto_kpis_snapshot AS
WITH ultima_semana AS (
  -- Última semana da Programação Semanal que já foi comprometida (ou
  -- fechada) de cada projeto — semana em rascunho não tem PPC (ver
  -- WeekStatus em programacao-db.ts).
  SELECT DISTINCT ON (w.projeto_id) w.id AS week_id, w.projeto_id
  FROM public.weeks w
  WHERE w.status <> 'rascunho'
  ORDER BY w.projeto_id, w.start_date DESC
),
ppc_calc AS (
  -- Mesma regra de computeIndicatorsComprometido (adherence.ts): o baseline
  -- define o CONJUNTO (não-extra), o status vem do estado ATUAL da
  -- atividade — e uma atividade do baseline que foi excluída depois conta
  -- como não concluída (LEFT JOIN + COALESCE), nunca some da conta.
  SELECT
    us.projeto_id,
    count(*) FILTER (WHERE NOT b.is_extra) AS base_total,
    count(*) FILTER (WHERE NOT b.is_extra AND COALESCE(a.status::text, 'nao_concluida') = 'concluida') AS base_concluidas,
    count(*) FILTER (WHERE NOT b.is_extra AND COALESCE(a.status::text, 'nao_concluida') IN ('pendente', 'nao_concluida')) AS restricoes_abertas
  FROM ultima_semana us
  JOIN public.week_baseline b ON b.week_id = us.week_id
  LEFT JOIN public.activities a ON a.id = b.activity_id
  GROUP BY us.projeto_id
),
efetivo_calc AS (
  SELECT f.projeto_id, count(*) AS efetivo_atual
  FROM public.funcionarios f
  WHERE f.ativo AND f.projeto_id IS NOT NULL
  GROUP BY f.projeto_id
),
rdr_calc AS (
  -- Mesmo critério de "aberto"/"vencido" já usado em RdrDashboard.tsx
  -- (concluido <> 'SIM' = aberto; + prazo vencido = crítico).
  SELECT
    r.projeto_id,
    count(*) FILTER (WHERE r.concluido IS DISTINCT FROM 'SIM') AS ocorrencias_abertas,
    count(*) FILTER (WHERE r.concluido IS DISTINCT FROM 'SIM' AND r.prazo IS NOT NULL AND r.prazo < CURRENT_DATE) AS ocorrencias_criticas
  FROM public.rdr_records r
  WHERE r.projeto_id IS NOT NULL
  GROUP BY r.projeto_id
),
base AS (
  SELECT
    p.id AS projeto_id,
    p.organizacao_id,
    now() AS data_snapshot,
    p.percentual_avanco AS avanco_fisico_pct,
    p.percentual_planejado AS avanco_planejado_pct,
    (p.percentual_avanco - p.percentual_planejado) AS desvio_pct,
    CASE WHEN COALESCE(pc.base_total, 0) > 0
      THEN round(100.0 * pc.base_concluidas / pc.base_total, 1)
      ELSE 0
    END AS ppc_ultima_semana,
    COALESCE(pc.restricoes_abertas, 0) AS restricoes_abertas,
    COALESCE(ec.efetivo_atual, 0) AS efetivo_atual,
    COALESCE(rc.ocorrencias_abertas, 0) AS ocorrencias_abertas,
    COALESCE(rc.ocorrencias_criticas, 0) AS ocorrencias_criticas
  FROM public.projetos p
  LEFT JOIN ppc_calc pc ON pc.projeto_id = p.id
  LEFT JOIN efetivo_calc ec ON ec.projeto_id = p.id
  LEFT JOIN rdr_calc rc ON rc.projeto_id = p.id
)
SELECT
  b.*,
  -- 3 níveis (pedido original), compostos a partir de 2 precedentes já
  -- existentes no app: getSPIColor/getCPIColor (project-calculations.ts —
  -- ≥1.0 verde/≥0.9 amarelo/<0.9 vermelho) e o statusGeral 0/1/2 do RDR
  -- (RdrDashboard.tsx — vencidos e reincidência forçam gravidade). Aqui:
  -- desvio físico×planejado + PPC da última semana + ocorrência crítica
  -- aberta força vermelho, mesmo padrão de "gravidade nunca cai por causa
  -- de um número bom sozinho" do RDR.
  CASE
    WHEN b.desvio_pct < -10
      OR (b.restricoes_abertas > 0 AND b.ppc_ultima_semana < 50)
      OR b.ocorrencias_criticas > 0
      THEN 'vermelho'
    WHEN b.desvio_pct < 0 OR b.ppc_ultima_semana < 70
      THEN 'amarelo'
    ELSE 'verde'
  END AS status_semaforo
FROM base b;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projeto_kpis_snapshot_projeto ON public.projeto_kpis_snapshot (projeto_id);
CREATE INDEX IF NOT EXISTS idx_projeto_kpis_snapshot_org ON public.projeto_kpis_snapshot (organizacao_id);

-- ============ 3. RLS por reexposição — não pela matview direto ============
-- Postgres não tem RLS em materialized view. Padrão Supabase: a matview não
-- recebe GRANT nenhum pra authenticated/anon; uma view comum por cima faz
-- JOIN com `projetos` (que já tem RLS por organizacao_id + user_ve_projeto)
-- — o filtro de RLS se aplica no join independente de quem é dono da view,
-- porque as policies de `projetos` chamam auth.uid() (função de sessão, não
-- checagem de privilégio do dono do objeto).

REVOKE ALL ON public.projeto_kpis_snapshot FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE VIEW public.vw_projeto_kpis AS
SELECT k.*
FROM public.projeto_kpis_snapshot k
JOIN public.projetos p ON p.id = k.projeto_id;

GRANT SELECT ON public.vw_projeto_kpis TO authenticated;

-- ============ 4. REFRESH: agendado (pg_cron) + sob demanda (RPC) ============
-- Agendado a cada 5 min cobre o uso normal do Dashboard Macro. Trigger por
-- escrita NÃO é usado de propósito: activities/apontamentos_diarios recebem
-- escrita o dia inteiro (apontamento diário) e REFRESH MATERIALIZED VIEW a
-- cada uma dessas escritas seria pesado demais pra tabela errada disparar
-- isso. O refresh sob demanda existe só pro Modo Apresentação (Fase D),
-- chamado antes de mostrar o slide de dashboard_macro, com um guard de 30s
-- pra não martelar o banco se a playlist girar rápido.

CREATE OR REPLACE FUNCTION public.refresh_projeto_kpis_sob_demanda()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ultimo timestamptz;
BEGIN
  SELECT max(data_snapshot) INTO ultimo FROM public.projeto_kpis_snapshot;
  IF ultimo IS NULL OR ultimo < now() - interval '30 seconds' THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.projeto_kpis_snapshot;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_projeto_kpis_sob_demanda() TO authenticated, anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'refresh-projeto-kpis-snapshot',
      '*/5 * * * *',
      $cron$REFRESH MATERIALIZED VIEW CONCURRENTLY public.projeto_kpis_snapshot$cron$
    );
  ELSE
    RAISE NOTICE 'Extensão pg_cron não habilitada — refresh agendado do Dashboard Macro não foi configurado (o snapshot ainda atualiza sob demanda, via refresh_projeto_kpis_sob_demanda). Habilite pg_cron em Database > Extensions e rode esta migration de novo pra ligar o agendamento.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
