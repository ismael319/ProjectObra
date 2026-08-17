-- ============================================================
-- MIGRAÇÃO: Conta demo — corrige "column reference is ambiguous"
-- ============================================================
-- RETURNS TABLE (organizacao_id uuid, projeto_id uuid) cria, por baixo dos
-- panos, variáveis PL/pgSQL com esses nomes exatos, acessíveis em toda a
-- função. Como várias tabelas usadas aqui dentro (organizacoes, projetos,
-- user_profiles, acessos_demo, organizacao_modulos) têm uma coluna chamada
-- organizacao_id, o Postgres não consegue decidir, em alguns pontos da
-- função, se "organizacao_id" é a variável de saída ou a coluna da tabela —
-- e recusa com "column reference organizacao_id is ambiguous" em vez de
-- adivinhar (comportamento padrão do plpgsql.variable_conflict = error).
-- Corrige renomeando as colunas de saída pra nomes que nunca colidem com
-- coluna nenhuma. Só muda o nome das colunas de retorno da RPC — quem chama
-- (a Edge Function) não lê o `data`, só o `error`, então não quebra nada.
-- ============================================================

-- Mudar o nome das colunas de saída conta como "tipo de retorno diferente"
-- pro Postgres — CREATE OR REPLACE sozinho não permite, precisa apagar a
-- versão antiga primeiro.
DROP FUNCTION IF EXISTS public.resgatar_acesso_demo(uuid, uuid);

CREATE OR REPLACE FUNCTION public.resgatar_acesso_demo(p_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS TABLE (out_organizacao_id uuid, out_projeto_id uuid)
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
  -- re-render etc.) e já está numa organização de verdade, devolve o que já
  -- existe em vez de duplicar. Um usuário recém-criado pelo
  -- handle_new_user() sempre cai aqui com organizacao_id NULL (linha
  -- "pendente" automática) — por isso a condição olha organizacao_id, não só
  -- a existência da linha.
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

  -- Upsert: handle_new_user() já inseriu uma linha "pendente" pra esse
  -- auth.uid() no instante em que a Edge Function criou o usuário — aqui só
  -- sobrescreve com os dados de verdade da conta demo.
  INSERT INTO public.user_profiles (
    id, papel, status_solicitacao, organizacao_id,
    nome, funcao, termos_aceitos_em
  ) VALUES (
    v_uid, 'edicao', 'aprovado', v_org_id,
    'Visitante Demo', 'Demonstração', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    papel = EXCLUDED.papel,
    status_solicitacao = EXCLUDED.status_solicitacao,
    organizacao_id = EXCLUDED.organizacao_id,
    nome = EXCLUDED.nome,
    funcao = EXCLUDED.funcao,
    termos_aceitos_em = EXCLUDED.termos_aceitos_em;

  RETURN QUERY SELECT v_org_id, v_projeto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resgatar_acesso_demo(uuid, uuid) TO authenticated;
