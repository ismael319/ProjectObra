-- ============================================================
-- MIGRAÇÃO: Conta demo — resgate via Edge Function (Service Role)
-- ============================================================
-- A v1 desse recurso dependia de supabase.auth.signInAnonymously() no
-- front pra dar uma sessão ao visitante antes de chamar resgatar_acesso_demo().
-- O toggle "Anonymous Sign-Ins" ficou indisponível no painel do projeto, então
-- a sessão passa a ser criada do lado do servidor: a Edge Function
-- resgatar-acesso-demo cria um usuário de verdade (email descartável) via
-- Admin API e devolve um magic-link token; o front troca esse token por uma
-- sessão de verdade com supabase.auth.verifyOtp(). Essa migration só ajusta a
-- RPC pra aceitar o id desse usuário como parâmetro (em vez de depender só de
-- auth.uid(), que é NULL quando quem chama é o client de service role).
-- ============================================================

DROP FUNCTION IF EXISTS public.resgatar_acesso_demo(uuid);

CREATE OR REPLACE FUNCTION public.resgatar_acesso_demo(p_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS TABLE (organizacao_id uuid, projeto_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_acesso record;
  v_org_id uuid;
  v_projeto_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão ausente' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_acesso FROM public.acessos_demo WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link de acesso demo inválido' USING ERRCODE = 'P0002';
  END IF;
  IF v_acesso.revogado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Link de acesso demo revogado' USING ERRCODE = '28000';
  END IF;
  IF v_acesso.link_expira_em < now() THEN
    RAISE EXCEPTION 'Link de acesso demo expirado' USING ERRCODE = '28000';
  END IF;

  -- Idempotente por usuário: se esse auth.uid() já resgatou (dupla chamada,
  -- re-render etc.), devolve o que já existe em vez de duplicar.
  SELECT up.organizacao_id, p.id INTO v_org_id, v_projeto_id
  FROM public.user_profiles up
  LEFT JOIN public.projetos p ON p.organizacao_id = up.organizacao_id
  WHERE up.id = v_uid
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN QUERY SELECT v_org_id, v_projeto_id;
    RETURN;
  END IF;

  IF v_acesso.organizacao_id IS NULL THEN
    -- Primeiro resgate desse link: cria a organização da empresa prospect.
    INSERT INTO public.organizacoes (nome, is_demo, demo_expira_em)
    VALUES (v_acesso.nome_empresa, true, now() + interval '72 hours')
    RETURNING id INTO v_org_id;

    INSERT INTO public.organizacao_modulos (organizacao_id, modulo_key, ativo)
    SELECT v_org_id, m.key, true FROM public.modulos m;

    INSERT INTO public.projetos (organizacao_id, nome, status, criado_por)
    VALUES (v_org_id, v_acesso.nome_empresa, 'ativo', v_uid)
    RETURNING id INTO v_projeto_id;

    UPDATE public.acessos_demo SET organizacao_id = v_org_id, ativado_em = now() WHERE id = p_id;
  ELSE
    -- Link já ativado por outra pessoa da mesma empresa: reaproveita a org.
    v_org_id := v_acesso.organizacao_id;

    IF NOT EXISTS (SELECT 1 FROM public.organizacoes WHERE id = v_org_id) THEN
      RAISE EXCEPTION 'Este acesso demo já expirou' USING ERRCODE = '28000';
    END IF;

    SELECT id INTO v_projeto_id FROM public.projetos WHERE organizacao_id = v_org_id LIMIT 1;
  END IF;

  INSERT INTO public.user_profiles (
    id, papel, status_solicitacao, organizacao_id,
    nome, funcao, termos_aceitos_em
  ) VALUES (
    v_uid, 'edicao', 'aprovado', v_org_id,
    'Visitante Demo', 'Demonstração', now()
  );

  RETURN QUERY SELECT v_org_id, v_projeto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resgatar_acesso_demo(uuid, uuid) TO authenticated;
