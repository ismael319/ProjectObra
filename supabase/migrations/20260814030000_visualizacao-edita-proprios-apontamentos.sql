-- Usuários com papel visualizacao (ou insercao_pontual) devem conseguir
-- editar e apagar apenas os apontamentos que ELES criaram. Papel edicao
-- mantém acesso total a todos os registros da obra.

DROP POLICY IF EXISTS "Edicao apontamentos da obra" ON public.apontamentos_diarios;
CREATE POLICY "Edicao apontamentos da obra" ON public.apontamentos_diarios
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organizacao_id = public.user_organizacao()
      AND public.user_ve_projeto(projeto_id)
      AND (
        public.user_papel_modulo('engenharia') = 'edicao'
        OR criado_por = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      organizacao_id = public.user_organizacao()
      AND public.user_ve_projeto(projeto_id)
      AND (
        public.user_papel_modulo('engenharia') = 'edicao'
        OR criado_por = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Exclusao apontamentos da obra" ON public.apontamentos_diarios;
CREATE POLICY "Exclusao apontamentos da obra" ON public.apontamentos_diarios
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organizacao_id = public.user_organizacao()
      AND public.user_ve_projeto(projeto_id)
      AND (
        public.user_papel_modulo('engenharia') = 'edicao'
        OR criado_por = auth.uid()
      )
    )
  );

NOTIFY pgrst, 'reload schema';
