-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Formas e espaçamento na malha do módulo Gestão à Vista.
--
-- Até aqui a grade só sabia desenhar retângulos colados uns nos outros, o que
-- serve para piso (praça ao lado de praça) mas não para o resto da obra:
--
--   ESTACAS  são círculos espaçados. Entre uma e outra há vão, e o que se pinta
--            é a estaca, não o terreno entre elas.
--   BLOCOS   são retângulos espaçados, mesma lógica.
--
-- Por isso o TAMANHO do desenho e o PASSO entre elementos viram coisas
-- separadas. Numa planta, o eixo tem um passo (estaca a cada 3 m) e a estaca
-- tem um diâmetro (30 cm) — misturar os dois era o que obrigava a fingir que a
-- célula ocupava todo o vão.
--
-- Compatibilidade: passo recebe o valor do tamanho da célula nas grades que já
-- existem, o que reproduz exatamente o comportamento atual (células contíguas).
--
-- Idempotente — seguro rodar mais de uma vez.

ALTER TABLE public.mapa_grades
  ADD COLUMN IF NOT EXISTS forma text NOT NULL DEFAULT 'retangulo',
  ADD COLUMN IF NOT EXISTS passo_x numeric,
  ADD COLUMN IF NOT EXISTS passo_y numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mapa_grades_forma_check') THEN
    ALTER TABLE public.mapa_grades
      ADD CONSTRAINT mapa_grades_forma_check
      CHECK (forma IN ('retangulo', 'circulo'));
  END IF;
END $$;

-- Grades existentes: passo = tamanho, ou seja, coladas como estavam.
UPDATE public.mapa_grades SET passo_x = largura_celula WHERE passo_x IS NULL;
UPDATE public.mapa_grades SET passo_y = altura_celula WHERE passo_y IS NULL;

-- Só depois do backfill dá para exigir o valor.
ALTER TABLE public.mapa_grades ALTER COLUMN passo_x SET NOT NULL;
ALTER TABLE public.mapa_grades ALTER COLUMN passo_y SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mapa_grades_passo_positivo') THEN
    ALTER TABLE public.mapa_grades
      ADD CONSTRAINT mapa_grades_passo_positivo
      CHECK (passo_x > 0 AND passo_y > 0);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
