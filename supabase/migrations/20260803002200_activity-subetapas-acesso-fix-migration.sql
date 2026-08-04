-- ============================================================
-- CORREÇÃO: activity_subetapas usava o modelo de papel antigo
-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- activity-subetapas-migration.sql criou as policies checando
-- user_papel() IN ('admin','gestor','engenheiro','campo') — o modelo de
-- ANTES de acesso-3-niveis-migration.sql. Como esses valores não existem
-- mais (a constraint de user_profiles.papel só aceita
-- edicao/visualizacao/insercao_pontual hoje), a checagem nunca batia com
-- ninguém e todo INSERT/UPDATE/DELETE em activity_subetapas dava 403 de
-- RLS. Aqui alinha com o mesmo padrão já usado em `activities`
-- (acesso-3-niveis-migration.sql): insercao_pontual só insere, edicao
-- insere/atualiza/exclui.
-- ============================================================

DROP POLICY IF EXISTS "Insert activity_subetapas" ON public.activity_subetapas;
CREATE POLICY "Insert activity_subetapas" ON public.activity_subetapas
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('edicao', 'insercao_pontual'));

DROP POLICY IF EXISTS "Update activity_subetapas" ON public.activity_subetapas;
CREATE POLICY "Update activity_subetapas" ON public.activity_subetapas
  FOR UPDATE TO authenticated
  USING (public.user_papel() = 'edicao')
  WITH CHECK (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Delete activity_subetapas" ON public.activity_subetapas;
CREATE POLICY "Delete activity_subetapas" ON public.activity_subetapas
  FOR DELETE TO authenticated
  USING (public.user_papel() = 'edicao');
