-- Agenda o refresh do materialized view projeto_kpis_snapshot a cada 5 minutos.
--
-- A migration 20260813020000_dashboard-portfolio-fase-c só agenda o job se a
-- extensão pg_cron estiver habilitada no momento da execução. Em produção ela
-- rodou ANTES da extensão ser habilitada, então o agendamento nunca foi criado
-- (o snapshot continuou sendo atualizado sob demanda via
-- refresh_projeto_kpis_sob_demanda). Este arquivo liga o job agora, de forma
-- idempotente: remove o job se já existir e recria com o mesmo schedule.

SELECT cron.unschedule('refresh-projeto-kpis-snapshot')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-projeto-kpis-snapshot'
);

SELECT cron.schedule(
  'refresh-projeto-kpis-snapshot',
  '*/5 * * * *',
  $cron$REFRESH MATERIALIZED VIEW CONCURRENTLY public.projeto_kpis_snapshot$cron$
);
