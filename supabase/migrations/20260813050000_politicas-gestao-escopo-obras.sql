-- A administração do escopo de obras segue a mesma permissão efetiva do
-- módulo Sistema usada pela tela Gestão de Usuários.

DROP POLICY IF EXISTS "Leitura projeto_usuarios" ON public.projeto_usuarios;
CREATE POLICY "Leitura projeto_usuarios" ON public.projeto_usuarios
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles alvo
      JOIN public.projetos projeto ON projeto.id = projeto_usuarios.projeto_id
      WHERE alvo.id = projeto_usuarios.user_id
        AND alvo.organizacao_id = public.user_organizacao()
        AND projeto.organizacao_id = public.user_organizacao()
        AND public.user_papel_modulo('sistema') = 'edicao'
    )
  );

DROP POLICY IF EXISTS "Edicao gerencia projeto_usuarios" ON public.projeto_usuarios;
CREATE POLICY "Edicao gerencia projeto_usuarios" ON public.projeto_usuarios
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles alvo
      JOIN public.projetos projeto ON projeto.id = projeto_usuarios.projeto_id
      WHERE alvo.id = projeto_usuarios.user_id
        AND alvo.organizacao_id = public.user_organizacao()
        AND projeto.organizacao_id = public.user_organizacao()
        AND public.user_papel_modulo('sistema') = 'edicao'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles alvo
      JOIN public.projetos projeto ON projeto.id = projeto_usuarios.projeto_id
      WHERE alvo.id = projeto_usuarios.user_id
        AND alvo.organizacao_id = public.user_organizacao()
        AND projeto.organizacao_id = public.user_organizacao()
        AND public.user_papel_modulo('sistema') = 'edicao'
    )
  );

NOTIFY pgrst, 'reload schema';
