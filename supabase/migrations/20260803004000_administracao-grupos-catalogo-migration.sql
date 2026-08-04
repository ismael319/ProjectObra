-- ============================================================
-- MIGRAÇÃO: GRUPO vira catálogo (não CHECK fixo)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS administracao-schema-migration.sql
-- ============================================================
-- A planilha real de Controle de Efetivo mostrou muito mais valores de GRUPO
-- do que os 3 previstos (Logística, Coordenação, Liderança, Gestão,
-- Segurança do Trabalho, Usina de Concreto, Almoxarife, Operacional...).
-- Troca o CHECK fixo em funcionarios.grupo e rh_cargos.grupo por um catálogo
-- por empresa, no mesmo padrão de rh_setores/rh_encarregados: controlado
-- (não é texto livre), mas aceita qualquer valor que a empresa cadastrar.
--
-- Seguro rodar agora porque funcionarios/rh_cargos ainda estão vazias
-- (nenhum import foi feito ainda) — não tem dado de "grupo" pra migrar.
-- ============================================================

-- ============ 1. CATÁLOGO rh_grupos (mesmo padrão de rh_setores) ============

CREATE TABLE IF NOT EXISTS public.rh_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rh_grupos_organizacao_idx ON public.rh_grupos (organizacao_id);

ALTER TABLE public.rh_grupos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_grupos TO authenticated;

DROP POLICY IF EXISTS "Leitura rh_grupos da propria empresa" ON public.rh_grupos;
CREATE POLICY "Leitura rh_grupos da propria empresa" ON public.rh_grupos
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia rh_grupos" ON public.rh_grupos;
CREATE POLICY "Edicao gerencia rh_grupos" ON public.rh_grupos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- ============ 2. FUNCIONARIOS: grupo (CHECK) -> grupo_id (FK) ============

ALTER TABLE public.funcionarios DROP COLUMN IF EXISTS grupo;
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.rh_grupos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS funcionarios_grupo_idx ON public.funcionarios (grupo_id);

-- ============ 3. RH_CARGOS: grupo (CHECK) -> grupo_id (FK) ============

ALTER TABLE public.rh_cargos DROP COLUMN IF EXISTS grupo;
ALTER TABLE public.rh_cargos ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.rh_grupos(id) ON DELETE SET NULL;
