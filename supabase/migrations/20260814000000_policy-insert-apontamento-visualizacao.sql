-- O pessoal de campo (papel visualizacao) lança apontamentos de efetivo.
-- A migration 20260813040000_ativa-rls-legado-por-obra.sql recriou a policy
-- "Insercao apontamentos da obra" permitindo apenas edicao/insercao_pontual,
-- regredindo o comportamento da 20260807090000 (que já incluia visualizacao).
-- Aqui restaura-se visualizacao no INSERT — UPDATE/DELETE continuam so edicao.

DROP POLICY IF EXISTS "Insercao apontamentos da obra" ON public.apontamentos_diarios;
CREATE POLICY "Insercao apontamentos da obra" ON public.apontamentos_diarios
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (
    organizacao_id = public.user_organizacao()
    AND public.user_ve_projeto(projeto_id)
    AND public.user_ve_modulo('engenharia')
    AND public.user_papel_modulo('engenharia') IN ('edicao','insercao_pontual','visualizacao')
  ));

NOTIFY pgrst, 'reload schema';
