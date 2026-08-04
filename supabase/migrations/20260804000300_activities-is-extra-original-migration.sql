-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- "Aderência do Cronograma" x "Aderência Ajustada" (ver src/lib/adherence.ts,
-- computeIndicatorsCronograma x computeIndicators): pra saber se os engenheiros
-- estão reprogramando a semana com coerência, precisamos comparar o plano
-- ORIGINAL (como a atividade entrou na semana) com o estado atual dela (depois de
-- qualquer Extra/Inativa/reprogramação feita ao longo da semana). Isso exige
-- guardar um retrato de is_extra no momento da criação da linha, já que hoje
-- setActivityExtra sobrescreve is_extra direto, sem histórico.
--
-- Backfill: linhas existentes não têm como recuperar o is_extra "de verdade" no
-- momento da criação — usamos o valor atual como aproximação (assume que ninguém
-- mudou o status de Extra dessas atividades ainda).

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS is_extra_original boolean NOT NULL DEFAULT false;

UPDATE public.activities
  SET is_extra_original = is_extra
  WHERE is_extra_original IS DISTINCT FROM is_extra;

NOTIFY pgrst, 'reload schema';
