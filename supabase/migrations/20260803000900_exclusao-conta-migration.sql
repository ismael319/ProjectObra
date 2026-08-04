-- ============================================================
-- MIGRAÇÃO: Solicitação de Exclusão de Conta (LGPD)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================

-- ============ 1. COLUNA PARA RASTREAR EXCLUSÃO ============

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS exclusao_solicitada_em timestamptz,
  ADD COLUMN IF NOT EXISTS exclusao_confirmada_em timestamptz,
  ADD COLUMN IF NOT EXISTS exclusao_motivo text;

-- ============ 2. FUNÇÃO PARA SOLICITAR EXCLUSÃO ============

CREATE OR REPLACE FUNCTION public.solicitar_exclusao_conta(motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles
  SET exclusao_solicitada_em = now(),
      exclusao_motivo = motivo,
      ativo = false
  WHERE id = auth.uid()
    AND exclusao_solicitada_em IS NULL
    AND exclusao_confirmada_em IS NULL;
END;
$$;

-- ============ 3. FUNÇÃO PARA CANCELAR SOLICITAÇÃO ============

CREATE OR REPLACE FUNCTION public.cancelar_exclusao_conta()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles
  SET exclusao_solicitada_em = NULL,
      exclusao_motivo = NULL,
      ativo = true
  WHERE id = auth.uid()
    AND exclusao_confirmada_em IS NULL;
END;
$$;

-- ============ 4. FUNÇÃO ADMIN PARA CONFIRMAR EXCLUSÃO ============

CREATE OR REPLACE FUNCTION public.confirmar_exclusao_conta(usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Só super admin pode confirmar exclusão
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'Apenas super administradores podem confirmar exclusão de contas';
  END IF;

  -- Marca como confirmada
  UPDATE public.user_profiles
  SET exclusao_confirmada_em = now(),
      papel = NULL,
      status_solicitacao = 'rejeitado'
  WHERE id = usuario_id
    AND exclusao_solicitada_em IS NOT NULL
    AND exclusao_confirmada_em IS NULL;

  -- Remove sessões ativas do usuário
  DELETE FROM auth.sessions WHERE user_id = usuario_id;
END;
$$;

-- ============ 5. VIEW PARA ADMIN ACOMPANHAR SOLICITAÇÕES ============

CREATE OR REPLACE VIEW public.solicitacoes_exclusao AS
SELECT
  up.id,
  up.email,
  up.exclusao_solicitada_em,
  up.exclusao_motivo,
  up.exclusao_confirmada_em,
  org.nome AS organizacao_nome
FROM public.user_profiles up
LEFT JOIN public.organizacoes org ON org.id = up.organizacao_id
WHERE up.exclusao_solicitada_em IS NOT NULL
ORDER BY up.exclusao_solicitada_em DESC;

-- ============ 6. GRANTS ============

GRANT EXECUTE ON FUNCTION public.solicitar_exclusao_conta TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_exclusao_conta TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_exclusao_conta TO authenticated;

-- ============ 7. FUNÇÃO PARA COLETAR DADOS DO USUÁRIO PARA EXPORTAÇÃO ============

CREATE OR REPLACE FUNCTION public.exportar_meus_dados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'exportado_em', now(),
    'perfil', row_to_json(up.*),
    'organizacao', (SELECT row_to_json(o.*) FROM public.organizacoes o WHERE o.id = up.organizacao_id),
    'modulos', (SELECT jsonb_agg(row_to_json(om.*)) FROM public.organizacao_modulos om WHERE om.organizacao_id = up.organizacao_id)
  ) INTO v_result
  FROM public.user_profiles up
  WHERE up.id = v_user_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.exportar_meus_dados TO authenticated;
