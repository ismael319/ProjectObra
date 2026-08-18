-- FASE 2: Múltiplas organizações por usuário.
-- Cria tabela organization_memberships, migra dados existentes,
-- e modifica user_organizacao() para ler da sessão.

-- ============ 1. TABELA organization_memberships ============

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('edicao', 'visualizacao', 'insercao_pontual')),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organizacao_id)
);

CREATE INDEX idx_org_memberships_user ON public.organization_memberships (user_id) WHERE status = 'ativo';
CREATE INDEX idx_org_memberships_org ON public.organization_memberships (organizacao_id) WHERE status = 'ativo';

-- ============ 2. RLS PARA organization_memberships ============

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas seus próprios memberships
CREATE POLICY "Usuarios veem seus memberships"
  ON public.organization_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admin/gestor pode inserir memberships na própria organização
CREATE POLICY "Edicao gerencia memberships"
  ON public.organization_memberships FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organizacao_id = public.user_organizacao()
      AND public.user_papel_modulo('sistema') = 'edicao'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      organizacao_id = public.user_organizacao()
      AND public.user_papel_modulo('sistema') = 'edicao'
    )
  );

-- ============ 3. MIGRAR DADOS EXISTENTES ============

INSERT INTO public.organization_memberships (user_id, organizacao_id, papel, status)
SELECT id, organizacao_id, papel, CASE WHEN ativo THEN 'ativo' ELSE 'inativo' END
FROM public.user_profiles
WHERE organizacao_id IS NOT NULL
  AND status_solicitacao = 'aprovado'
  AND papel IS NOT NULL
ON CONFLICT (user_id, organizacao_id) DO NOTHING;

-- ============ 4. CRIAR VARIÁVEL DE SESSÃO app.current_org_id ============

-- Função para trocar de organização
CREATE OR REPLACE FUNCTION public.trocar_organizacao(p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão ausente' USING ERRCODE = '28000';
  END IF;

  -- Verificar se o usuário tem membership ativo nesta organização
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = auth.uid()
      AND organizacao_id = p_organizacao_id
      AND status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Você não pertence a esta organização' USING ERRCODE = '42501';
  END IF;

  -- Verificar se a organização está ativa
  IF NOT EXISTS (
    SELECT 1 FROM public.organizacoes
    WHERE id = p_organizacao_id AND ativo
  ) THEN
    RAISE EXCEPTION 'Organização inativa' USING ERRCODE = '42501';
  END IF;

  -- Seta a variável de sessão
  PERFORM set_config('app.current_org_id', p_organizacao_id::text, false);
END;
$$;

-- Função para listar organizações do usuário
CREATE OR REPLACE FUNCTION public.listar_minhas_organizacoes()
RETURNS TABLE (
  organizacao_id uuid,
  nome text,
  papel text,
  is_demo boolean,
  demo_expira_em timestamptz,
  is_piloto boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT om.organizacao_id, o.nome, om.papel, o.is_demo, o.demo_expira_em, o.is_piloto
  FROM public.organization_memberships om
  JOIN public.organizacoes o ON o.id = om.organizacao_id
  WHERE om.user_id = auth.uid()
    AND om.status = 'ativo'
    AND o.ativo
  ORDER BY o.nome;
$$;

-- ============ 5. MODIFICAR user_organizacao() ============

-- Agora lê da variável de sessão, com fallback para user_profiles
CREATE OR REPLACE FUNCTION public.user_organizacao()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- 1. Tentar ler da variável de sessão (setada por trocar_organizacao)
  v_org_id := nullif(current_setting('app.current_org_id', true), '')::uuid;

  IF v_org_id IS NOT NULL THEN
    -- Validar que o usuário tem membership ativo nesta org
    IF EXISTS (
      SELECT 1 FROM public.organization_memberships om
      JOIN public.organizacoes o ON o.id = om.organizacao_id
      WHERE om.user_id = auth.uid()
        AND om.organizacao_id = v_org_id
        AND om.status = 'ativo'
        AND o.ativo
        AND (NOT o.is_demo OR o.demo_expira_em IS NULL OR o.demo_expira_em > now())
    ) THEN
      RETURN v_org_id;
    END IF;
  END IF;

  -- 2. Fallback: usar user_profiles.organizacao_id (compatibilidade)
  SELECT up.organizacao_id INTO v_org_id
  FROM public.user_profiles up
  JOIN public.organizacoes org ON org.id = up.organizacao_id
  WHERE up.id = auth.uid()
    AND up.status_solicitacao = 'aprovado'
    AND up.ativo
    AND up.termos_aceitos_em IS NOT NULL
    AND up.versao_termos = '1.0'
    AND org.ativo
    AND (NOT org.is_demo OR org.demo_expira_em IS NULL OR org.demo_expira_em > now());

  -- 3. Se encontrou, setar na sessão para próximas chamadas
  IF v_org_id IS NOT NULL THEN
    PERFORM set_config('app.current_org_id', v_org_id::text, true);
  END IF;

  RETURN v_org_id;
END;
$$;

-- ============ 6. ATUALIZAR GERENCIAR_USUARIO ============

-- Agora cria membership ao aprovar usuário
CREATE OR REPLACE FUNCTION public.gerenciar_usuario(
  p_usuario_id uuid,
  p_status text,
  p_papel text DEFAULT NULL,
  p_nome text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', pg_temp
AS $$
DECLARE
  v_alvo public.user_profiles%ROWTYPE;
  v_org_ator uuid := public.user_organizacao();
  v_pode_gerenciar boolean := public.is_super_admin() OR public.user_papel_modulo('sistema') = 'edicao';
BEGIN
  IF auth.uid() IS NULL OR NOT v_pode_gerenciar THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar usuários' USING ERRCODE = '42501';
  END IF;
  IF p_usuario_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é permitido alterar o próprio acesso' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('aprovado', 'rejeitado') THEN
    RAISE EXCEPTION 'Status inválido' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'aprovado' AND p_papel NOT IN ('edicao', 'visualizacao', 'insercao_pontual') THEN
    RAISE EXCEPTION 'Papel inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_alvo FROM public.user_profiles WHERE id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_super_admin()
     AND NOT (v_alvo.organizacao_id = v_org_ator OR (v_alvo.organizacao_id IS NULL AND v_org_ator = public.organizacao_piloto_id())) THEN
    RAISE EXCEPTION 'Usuário fora da sua organização' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.gestao_perfil_autorizada', 'on', true);
  UPDATE public.user_profiles
  SET status_solicitacao = p_status,
      papel = CASE WHEN p_status = 'aprovado' THEN p_papel ELSE NULL END,
      organizacao_id = CASE WHEN p_status = 'aprovado' AND v_alvo.organizacao_id IS NULL THEN v_org_ator ELSE v_alvo.organizacao_id END,
      nome = COALESCE(NULLIF(trim(p_nome), ''), v_alvo.nome)
  WHERE id = p_usuario_id;

  -- Criar membership ao aprovar
  IF p_status = 'aprovado' THEN
    INSERT INTO public.organization_memberships (user_id, organizacao_id, papel, status)
    VALUES (p_usuario_id, COALESCE(v_alvo.organizacao_id, v_org_ator), p_papel, 'ativo')
    ON CONFLICT (user_id, organizacao_id) DO UPDATE
    SET papel = p_papel, status = 'ativo';
  END IF;

  -- Revogar sessões ao rejeitar
  IF p_status = 'rejeitado' THEN
    DELETE FROM auth.sessions WHERE user_id = p_usuario_id;
    -- Inativar memberships
    UPDATE public.organization_memberships
    SET status = 'inativo'
    WHERE user_id = p_usuario_id AND status = 'ativo';
  END IF;
END;
$$;

-- ============ 7. ATUALIZAR CRIAR_CONVITE ============

-- Criar_convite não muda (ainda cria convite para 1 org).
-- O membership será criado quando o usuário aceitar o convite.

-- ============ 8. ATUALIZAR HANDLE_NEW_USER ============

-- Quando usuário aceita convite, criar membership
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_convite public.convites%ROWTYPE;
  v_token text := new.raw_user_meta_data ->> 'invite_token';
BEGIN
  IF v_token IS NOT NULL THEN
    SELECT * INTO v_convite
    FROM public.convites
    WHERE token_hash = encode(digest(v_token, 'sha256'), 'hex')
      AND lower(email) = lower(new.email)
      AND usado_em IS NULL
      AND revogado_em IS NULL
      AND expira_em > now()
    FOR UPDATE;
  END IF;

  IF FOUND THEN
    UPDATE public.convites SET usado_em = now(), usado_por = new.id WHERE id = v_convite.id;
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, v_convite.papel_convidado, 'aprovado', v_convite.organizacao_id);
    -- Criar membership
    INSERT INTO public.organization_memberships (user_id, organizacao_id, papel, status)
    VALUES (new.id, v_convite.organizacao_id, v_convite.papel_convidado, 'ativo');
  ELSE
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, NULL, 'pendente', NULL);
  END IF;
  RETURN new;
END;
$$;

-- ============ 9. RESTRINIR ACESSO ============

REVOKE ALL ON FUNCTION public.trocar_organizacao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_minhas_organizacoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trocar_organizacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_minhas_organizacoes() TO authenticated;

NOTIFY pgrst, 'reload schema';
