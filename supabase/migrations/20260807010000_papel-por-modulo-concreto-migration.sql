-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Piloto de "papel por módulo" (ver 20260807000000_papel-por-modulo-
-- fundacao-migration.sql) no módulo Concreto: troca user_papel() por
-- user_papel_modulo('qualidade') nas políticas de escrita das 5 tabelas do
-- módulo. Comportamento pra quem NUNCA teve um override configurado é
-- idêntico a hoje (user_papel_modulo cai automaticamente no papel global
-- quando não há override) — só muda pra quem um admin configurar
-- explicitamente um papel diferente em Concreto via a tela "Papéis por
-- módulo" (Gestão de Usuários).
--
-- DROP POLICY + recriar com o mesmo texto (só troca a função de papel) —
-- reversível trocando de volta pra user_papel().
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ fornecedores_concreto ============

DROP POLICY IF EXISTS "Edicao gerencia fornecedores_concreto" ON public.fornecedores_concreto;
CREATE POLICY "Edicao gerencia fornecedores_concreto" ON public.fornecedores_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- ============ tracos_concreto ============

DROP POLICY IF EXISTS "Edicao gerencia tracos_concreto" ON public.tracos_concreto;
CREATE POLICY "Edicao gerencia tracos_concreto" ON public.tracos_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- ============ etapas_concreto ============

DROP POLICY IF EXISTS "Edicao gerencia etapas_concreto" ON public.etapas_concreto;
CREATE POLICY "Edicao gerencia etapas_concreto" ON public.etapas_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- ============ cargas_concreto ============
-- INSERT libera edicao + insercao_pontual (usuário de campo lançando carga);
-- UPDATE/DELETE continuam só edicao — mesmo split de cargas_concreto_ajustes.sql.

DROP POLICY IF EXISTS "Insercao cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Insercao cargas_concreto" ON public.cargas_concreto
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') IN ('edicao', 'insercao_pontual')));

DROP POLICY IF EXISTS "Edicao atualiza cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Edicao atualiza cargas_concreto" ON public.cargas_concreto
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

DROP POLICY IF EXISTS "Edicao exclui cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Edicao exclui cargas_concreto" ON public.cargas_concreto
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- ============ destinos_carga ============

DROP POLICY IF EXISTS "Insercao destinos_carga" ON public.destinos_carga;
CREATE POLICY "Insercao destinos_carga" ON public.destinos_carga
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') IN ('edicao', 'insercao_pontual')));

DROP POLICY IF EXISTS "Edicao atualiza destinos_carga" ON public.destinos_carga;
CREATE POLICY "Edicao atualiza destinos_carga" ON public.destinos_carga
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

DROP POLICY IF EXISTS "Edicao exclui destinos_carga" ON public.destinos_carga;
CREATE POLICY "Edicao exclui destinos_carga" ON public.destinos_carga
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

NOTIFY pgrst, 'reload schema';
