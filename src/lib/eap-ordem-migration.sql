-- Migração: ordem manual dos itens da EAP (pra "mover pra cima/baixo")
-- Execute estas queries no Supabase SQL Editor

ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS ordem INTEGER;
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS ordem INTEGER;
ALTER TABLE public.subareas ADD COLUMN IF NOT EXISTS ordem INTEGER;
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS ordem INTEGER;

-- Preenche a ordem inicial (por grupo de irmãos) com base na ordem alfabética atual
-- — só pra quem ainda não tem ordem definida (idempotente).
UPDATE public.setores s SET ordem = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY nome) AS rn FROM public.setores
) sub WHERE s.id = sub.id AND s.ordem IS NULL;

UPDATE public.areas a SET ordem = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY setor_id ORDER BY nome) AS rn FROM public.areas
) sub WHERE a.id = sub.id AND a.ordem IS NULL;

UPDATE public.subareas sa SET ordem = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY area_id ORDER BY nome) AS rn FROM public.subareas
) sub WHERE sa.id = sub.id AND sa.ordem IS NULL;

UPDATE public.atividades at SET ordem = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY subarea_id ORDER BY nome) AS rn FROM public.atividades
) sub WHERE at.id = sub.id AND at.ordem IS NULL;
