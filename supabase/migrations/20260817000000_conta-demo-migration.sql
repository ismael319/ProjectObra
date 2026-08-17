-- ============================================================
-- MIGRAÇÃO: Conta demo (link provisório gerado pela administração)
-- ============================================================
-- O Dono da Plataforma gera, em /admin, um link de acesso demo pra uma
-- empresa prospect (tabela acessos_demo). Quem abre esse link entra com
-- sign-in anônimo do Supabase (auth.uid() de verdade, role authenticated —
-- RLS funciona normal) e chama resgatar_acesso_demo(), que monta (no
-- primeiro resgate) uma organização isolada e descartável pra aquela
-- empresa, já aprovada e com todos os módulos liberados, mais uma obra vazia
-- pronta pra uso. Resgates seguintes do MESMO link (outra pessoa da mesma
-- empresa) caem na mesma organização. Organizações demo expiradas são
-- limpas por um job horário (pg_cron), sem depender de ninguém lembrar de
-- apagar.
-- ============================================================

-- ============ 1. MARCAÇÃO DE ORGANIZAÇÃO DEMO ============

ALTER TABLE public.organizacoes
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expira_em timestamptz;

CREATE INDEX IF NOT EXISTS organizacoes_demo_expira_em_idx
  ON public.organizacoes (demo_expira_em) WHERE is_demo;

-- ============ 2. LINKS DE ACESSO DEMO (gerados pelo Dono da Plataforma) ============

CREATE TABLE IF NOT EXISTS public.acessos_demo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_empresa text NOT NULL,
  organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  link_expira_em timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  ativado_em timestamptz,
  revogado_em timestamptz
);

ALTER TABLE public.acessos_demo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.acessos_demo TO authenticated;

-- Só o Dono da Plataforma gerencia os links — quem resgata passa pela RPC
-- SECURITY DEFINER abaixo, nunca lê/escreve a tabela diretamente (mesmo
-- padrão de "convites" e do comentário em ApresentacaoPublica.tsx: acesso
-- anônimo só passa por RPC estreita, nunca por RLS aberta numa tabela real).
DROP POLICY IF EXISTS "Dono gerencia acessos demo" ON public.acessos_demo;
CREATE POLICY "Dono gerencia acessos demo" ON public.acessos_demo
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 3. RPC: RESGATA O LINK PRA QUEM CHAMOU ============

CREATE OR REPLACE FUNCTION public.resgatar_acesso_demo(p_id uuid)
RETURNS TABLE (organizacao_id uuid, projeto_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
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

  -- Idempotente por sessão: se essa sessão anônima já resgatou (dupla
  -- chamada, re-render etc.), devolve o que já existe em vez de duplicar.
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

GRANT EXECUTE ON FUNCTION public.resgatar_acesso_demo(uuid) TO authenticated;

-- ============ 4. LIMPEZA AGENDADA DAS ORGANIZAÇÕES DEMO EXPIRADAS ============
-- Duas referências SEM ON DELETE CASCADE cruzam esse grafo e forçam uma
-- ordem específica: user_profiles.organizacao_id -> organizacoes(id), e
-- projetos.criado_por -> auth.users(id) (só projetos.organizacao_id ->
-- organizacoes(id) tem CASCADE). Sem isso, apagar organizacoes ou auth.users
-- na ordem errada esbarra em violação de FK. Por isso os ids são capturados
-- ANTES de qualquer DELETE (senão perde-se o mapeamento org -> usuário no
-- meio do caminho). acessos_demo.organizacao_id tem ON DELETE SET NULL, então
-- o histórico do link fica (nome da empresa, quando foi ativado), só perde a
-- referência pra organização já apagada.
CREATE OR REPLACE FUNCTION public.limpar_contas_demo_expiradas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_ids uuid[];
  v_user_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_org_ids
  FROM public.organizacoes
  WHERE is_demo AND demo_expira_em < now();

  IF v_org_ids IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(id) INTO v_user_ids
  FROM public.user_profiles
  WHERE organizacao_id = ANY(v_org_ids);

  -- Libera projetos.criado_por (sem CASCADE) pra poder apagar os usuários depois.
  UPDATE public.projetos SET criado_por = NULL WHERE organizacao_id = ANY(v_org_ids);

  -- Libera user_profiles.organizacao_id (sem CASCADE) pra poder apagar a organização.
  DELETE FROM public.user_profiles WHERE id = ANY(v_user_ids);

  -- Cascateia projetos -> cronogramas e tabelas legadas por obra, organizacao_modulos etc.
  DELETE FROM public.organizacoes WHERE id = ANY(v_org_ids);

  -- Por fim, os próprios usuários anônimos.
  DELETE FROM auth.users WHERE id = ANY(v_user_ids);
END;
$$;

SELECT cron.unschedule('limpar-contas-demo-expiradas')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'limpar-contas-demo-expiradas'
);

SELECT cron.schedule(
  'limpar-contas-demo-expiradas',
  '0 * * * *',
  $cron$SELECT public.limpar_contas_demo_expiradas()$cron$
);
