-- Controle de acesso por obra.
--
-- Esta migration registra no Git o modelo que já existe em produção e reforça
-- seus vínculos. Um usuário pode acessar todas as obras da organização ou só
-- as obras explicitamente atribuídas a ele.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS escopo_projetos text NOT NULL DEFAULT 'todos';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_escopo_projetos_check'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_escopo_projetos_check
      CHECK (escopo_projetos IN ('todos', 'restrito'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projetos_id_organizacao_key'
  ) THEN
    ALTER TABLE public.projetos
      ADD CONSTRAINT projetos_id_organizacao_key UNIQUE (id, organizacao_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.projeto_usuarios (
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  atribuido_por uuid REFERENCES auth.users(id),
  atribuido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projeto_id, user_id)
);

CREATE INDEX IF NOT EXISTS projeto_usuarios_user_idx
  ON public.projeto_usuarios (user_id, projeto_id);

ALTER TABLE public.projeto_usuarios ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_ve_projeto(p_projeto_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.projetos p
      ON p.id = p_projeto_id
     AND p.organizacao_id = up.organizacao_id
    WHERE up.id = auth.uid()
      AND up.ativo
      AND up.status_solicitacao = 'aprovado'
      AND (
        up.escopo_projetos = 'todos'
        OR EXISTS (
          SELECT 1
          FROM public.projeto_usuarios pu
          WHERE pu.projeto_id = p_projeto_id
            AND pu.user_id = up.id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_ve_projeto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_ve_projeto(uuid) TO authenticated;

DROP POLICY IF EXISTS "Leitura projetos da organizacao" ON public.projetos;
CREATE POLICY "Leitura projetos da organizacao" ON public.projetos
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organizacao_id = public.user_organizacao()
      AND public.user_ve_projeto(id)
    )
  );

DROP POLICY IF EXISTS "Leitura cronogramas da organizacao" ON public.projeto_cronogramas;
CREATE POLICY "Leitura cronogramas da organizacao" ON public.projeto_cronogramas
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.projetos projeto
      WHERE projeto.id = projeto_cronogramas.projeto_id
        AND projeto.organizacao_id = public.user_organizacao()
        AND public.user_ve_projeto(projeto.id)
    )
  );

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
