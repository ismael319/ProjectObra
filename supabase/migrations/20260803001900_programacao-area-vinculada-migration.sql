-- ============================================================
-- MIGRAÇÃO: liga a Área da Programação ao cadastro real de Áreas
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS programacao-engenheiros-area-migration.sql
--
-- Hoje a Área da Programação é só texto solto tirado do nível 2 da EDT do
-- cronograma (coluna `area`/`areaPath` em activities). Mesmo espírito do que
-- foi feito com Liderança→Empresa: a tela "Engenheiros por Área" passa a
-- também vincular cada área do cronograma a uma Área de verdade do cadastro
-- Setor→Área→Etapa (setores/areas/subareas) já usado no resto da
-- plataforma — escolhida manualmente 1x por área, sem criar área nova
-- sozinha (evita ambiguidade de "em qual Setor" nasce a área nova).
-- ============================================================

ALTER TABLE public.programacao_engenheiros_area ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.areas(id);

-- Uma linha agora pode existir só com área vinculada (engenheiro ainda não
-- preenchido) ou só com engenheiro (área ainda não vinculada).
ALTER TABLE public.programacao_engenheiros_area ALTER COLUMN engenheiro DROP NOT NULL;

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.areas(id);

CREATE INDEX IF NOT EXISTS activities_area_id_idx ON public.activities (area_id);
