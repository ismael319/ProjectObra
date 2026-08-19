-- ============================================================
-- MIGRAÇÃO: Corrige RLS de escrita do módulo Pessoas (administracao)
-- para respeitar papel POR MÓDULO, não só o papel global
-- ============================================================
-- As políticas de escrita do módulo Pessoas foram criadas checando
-- `public.user_papel() = 'edicao'` (papel GLOBAL do usuário) em vez de
-- `public.user_papel_modulo('administracao') = 'edicao'` (papel efetivo
-- NESSE módulo, que respeita o override em user_papel_modulos).
--
-- Efeito prático: um usuário com papel global 'visualizacao' que um gestor
-- promoveu a 'edicao' só no módulo Pessoas (via "Papel por Módulo") consegue
-- ver a tela de edição no frontend, mas toda escrita no banco falha com 403
-- — porque a política ignora o override e olha só o papel global.
--
-- Reproduzido em documentos_funcionario (edição de validade de documento),
-- mas o mesmo bug afeta as outras 10 tabelas do módulo. Todas corrigidas
-- juntas aqui.
-- ============================================================

DROP POLICY IF EXISTS "Edicao gerencia rh_setores" ON public.rh_setores;
CREATE POLICY "Edicao gerencia rh_setores" ON public.rh_setores
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia rh_encarregados" ON public.rh_encarregados;
CREATE POLICY "Edicao gerencia rh_encarregados" ON public.rh_encarregados
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia rh_cargos" ON public.rh_cargos;
CREATE POLICY "Edicao gerencia rh_cargos" ON public.rh_cargos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia tipos_documento" ON public.tipos_documento;
CREATE POLICY "Edicao gerencia tipos_documento" ON public.tipos_documento
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia funcionarios" ON public.funcionarios;
CREATE POLICY "Edicao gerencia funcionarios" ON public.funcionarios
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia demissoes" ON public.demissoes;
CREATE POLICY "Edicao gerencia demissoes" ON public.demissoes
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia documentos_funcionario" ON public.documentos_funcionario;
CREATE POLICY "Edicao gerencia documentos_funcionario" ON public.documentos_funcionario
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia pontos_importados" ON public.pontos_importados;
CREATE POLICY "Edicao gerencia pontos_importados" ON public.pontos_importados
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia rh_efetivo_ponto_diario" ON public.rh_efetivo_ponto_diario;
CREATE POLICY "Edicao gerencia rh_efetivo_ponto_diario" ON public.rh_efetivo_ponto_diario
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao gerencia rh_grupos" ON public.rh_grupos;
CREATE POLICY "Edicao gerencia rh_grupos" ON public.rh_grupos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Edicao registra efetivo_importacoes" ON public.efetivo_importacoes;
CREATE POLICY "Edicao registra efetivo_importacoes" ON public.efetivo_importacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('administracao') = 'edicao'));

NOTIFY pgrst, 'reload schema';
