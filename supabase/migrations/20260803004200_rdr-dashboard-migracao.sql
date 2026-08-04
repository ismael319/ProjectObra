-- ============================================================
-- MIGRAÇÃO: RDR — Dashboard (prazo de conclusão + meta mensal)
-- Execute no SQL Editor do Supabase do ProjectObra
-- IMPORTANTE: rode DEPOIS de rdr-migration.sql e de
-- rdr-integridade-migration.sql (que criam a base do RDR).
-- ============================================================
-- Objetivos:
--  1) Adiciona rdr_records.concluido_em: data/hora em que o registro
--     foi marcado como concluído (SIM), permitindo calcular a taxa de
--     conclusão dentro do prazo e o prazo médio de atendimento.
--  2) Cria rdr_config: chave/valor por organização para guardar
--     preferências do módulo (ex.: meta mensal de desvios), com RLS
--     no mesmo padrão das demais tabelas RDR.
-- ============================================================

-- ============ 1. COLUNA concluido_em ============
-- Backfill: registros já concluídos assumem a última atualização como
-- data de conclusão aproximada (sem isso, ficam fora do cálculo).
-- ----------------------------------------------------------------------------
ALTER TABLE public.rdr_records
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz;

UPDATE public.rdr_records
  SET concluido_em = atualizado_em
  WHERE concluido = 'SIM' AND concluido_em IS NULL;

-- ============ 2. TABELA rdr_config ============
-- chave: ex. 'meta_mensal_desvios'; valor: texto (parseado no app).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rdr_config (
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  chave text NOT NULL,
  valor text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id),
  PRIMARY KEY (organizacao_id, chave)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rdr_config TO authenticated;
GRANT ALL ON public.rdr_config TO service_role;

ALTER TABLE public.rdr_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restringe rdr_config pelo modulo seguranca" ON public.rdr_config;
CREATE POLICY "Restringe rdr_config pelo modulo seguranca"
  ON public.rdr_config AS RESTRICTIVE FOR ALL TO public
  USING (public.user_ve_modulo('seguranca'));

DROP POLICY IF EXISTS "Acesso rdr_config da organizacao" ON public.rdr_config;
CREATE POLICY "Acesso rdr_config da organizacao"
  ON public.rdr_config FOR ALL TO authenticated
  USING (organizacao_id = public.user_organizacao())
  WITH CHECK (organizacao_id = public.user_organizacao());
