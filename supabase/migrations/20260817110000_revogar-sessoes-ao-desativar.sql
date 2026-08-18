-- Revoga sessões ativas ao desativar usuário (rejeição ou auto-exclusão).
-- Fecha o gap onde o JWT continuava válido até expirar naturalmente.

-- 1. gerenciar_usuario: revoga sessões ao rejeitar/desativar
CREATE OR REPLACE FUNCTION public.gerenciar_usuario(
  p_usuario_id uuid,
  p_status text,
  p_papel text DEFAULT NULL,
  p_nome text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  -- Fecha sessões ativas imediatamente ao rejeitar/desativar
  IF p_status = 'rejeitado' THEN
    DELETE FROM auth.sessions WHERE user_id = p_usuario_id;
  END IF;
END;
$$;

-- 2. solicitar_exclusao_conta: revoga sessões ao auto-desativar
CREATE OR REPLACE FUNCTION public.solicitar_exclusao_conta(motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão ausente' USING ERRCODE = '28000'; END IF;
  PERFORM set_config('app.gestao_perfil_autorizada', 'on', true);
  UPDATE public.user_profiles
  SET exclusao_solicitada_em = now(), exclusao_motivo = motivo, ativo = false
  WHERE id = auth.uid() AND exclusao_solicitada_em IS NULL AND exclusao_confirmada_em IS NULL;

  -- Fecha sessões ativas imediatamente ao solicitar exclusão
  DELETE FROM auth.sessions WHERE user_id = auth.uid();
END;
$$;

NOTIFY pgrst, 'reload schema';
