-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Muda o Planejado do Histograma MO de MENSAL (1 valor pro mês inteiro,
-- repetido em todas as semanas dele) pra SEMANAL (1 valor por semana, igual
-- o Real já funciona) — decisão tomada depois de um caso real: uma planilha
-- importada trazia Planejado diferente por semana dentro do mesmo mês (ex.:
-- 1, 1, 2, 2 em julho), mas como só cabia 1 valor por mês na tabela, cada
-- semana processada ia sobrescrevendo a anterior e todo o mês ficava com o
-- valor da última semana lida.
--
-- Backfill: cada linha existente (1 valor pro mês inteiro) vira uma linha
-- por sexta-feira (weekStartDay) daquele mês, todas com o mesmo valor —
-- preserva o comportamento visual atual (mesmo número em toda semana do
-- mês) até alguém reeditar semana a semana.
--
-- IDEMPOTENTE — seguro rodar mais de uma vez. Cada etapa checa se já foi
-- aplicada antes de agir (coluna já renomeada? constraint já existe?), e o
-- backfill só roda na primeira vez (a coluna "mes" só existe antes da 1ª
-- execução) — rodar o backfill de novo sobre dados já semanais trataria cada
-- semana como se fosse um mês inteiro e explodiria tudo de novo, duplicando.

DO $$
DECLARE
  coluna_antiga_existe boolean;
  ids_originais uuid[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'histograma_planejado' AND column_name = 'mes'
  ) INTO coluna_antiga_existe;

  IF coluna_antiga_existe THEN
    ALTER TABLE public.histograma_planejado RENAME COLUMN mes TO semana_ref;
  END IF;

  ALTER TABLE public.histograma_planejado
    DROP CONSTRAINT IF EXISTS histograma_planejado_baseline_id_cargo_id_mes_key;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'histograma_planejado_baseline_id_cargo_id_semana_ref_key'
  ) THEN
    ALTER TABLE public.histograma_planejado
      ADD CONSTRAINT histograma_planejado_baseline_id_cargo_id_semana_ref_key
      UNIQUE (baseline_id, cargo_id, semana_ref);
  END IF;

  IF coluna_antiga_existe THEN
    -- Guarda os ids das linhas mensais originais ANTES de inserir qualquer coisa —
    -- assim a exclusão no final apaga exatamente essas linhas, nunca as semanais
    -- novas (mesmo que uma delas caia coincidentemente no dia 1 de um mês).
    SELECT array_agg(id) INTO ids_originais FROM public.histograma_planejado;

    -- extract(dow from data) segue a mesma convenção 0=Dom..6=Sáb usada em todo o
    -- app (ver iso-week.ts), então "5" é sempre sexta-feira independente do mês.
    INSERT INTO public.histograma_planejado (baseline_id, cargo_id, semana_ref, qtd_planejada)
    SELECT
      p.baseline_id,
      p.cargo_id,
      sexta::date,
      p.qtd_planejada
    FROM public.histograma_planejado p
    CROSS JOIN LATERAL generate_series(
      date_trunc('month', p.semana_ref)::date
        + (((5 - extract(dow FROM date_trunc('month', p.semana_ref))::int) + 7) % 7),
      (date_trunc('month', p.semana_ref) + interval '1 month' - interval '1 day')::date,
      interval '7 days'
    ) AS sexta
    WHERE p.id = ANY(ids_originais)
    ON CONFLICT (baseline_id, cargo_id, semana_ref) DO UPDATE SET qtd_planejada = EXCLUDED.qtd_planejada;

    DELETE FROM public.histograma_planejado WHERE id = ANY(ids_originais);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
