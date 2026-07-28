-- Migração: mantém os itens de origem ao mesclar (em vez de apagar) — ficam
-- inativos e guardados como referência visual abaixo do item resultante.
-- Execute estas queries no Supabase SQL Editor

ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS mesclado_em UUID REFERENCES public.setores(id);
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS mesclado_em UUID REFERENCES public.areas(id);
ALTER TABLE public.subareas ADD COLUMN IF NOT EXISTS mesclado_em UUID REFERENCES public.subareas(id);
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS mesclado_em UUID REFERENCES public.atividades(id);
