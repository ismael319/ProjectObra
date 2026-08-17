-- Hardening de acesso: fecha escalada de privilégios, convites e links públicos.
-- As operações sensíveis passam por RPCs estreitas; clientes autenticados não
-- recebem UPDATE direto em user_profiles nem acesso às funções de service role.

-- ============ 1. IDENTIDADE ATIVA E ORGANIZAÇÃO ATIVA ============

CREATE OR REPLACE FUNCTION public.user_papel()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT up.papel
  FROM public.user_profiles up
  JOIN public.organizacoes org ON org.id = up.organizacao_id
  WHERE up.id = auth.uid()
    AND up.status_solicitacao = 'aprovado'
    AND up.ativo
    AND up.termos_aceitos_em IS NOT NULL
    AND up.versao_termos = '1.0'
    AND org.ativo
    AND (NOT org.is_demo OR org.demo_expira_em IS NULL OR org.demo_expira_em > now());
$$;

CREATE OR REPLACE FUNCTION public.user_organizacao()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT up.organizacao_id
  FROM public.user_profiles up
  JOIN public.organizacoes org ON org.id = up.organizacao_id
  WHERE up.id = auth.uid()
    AND up.status_solicitacao = 'aprovado'
    AND up.ativo
    AND up.termos_aceitos_em IS NOT NULL
    AND up.versao_termos = '1.0'
    AND org.ativo
    AND (NOT org.is_demo OR org.demo_expira_em IS NULL OR org.demo_expira_em > now());
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT up.is_super_admin
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND up.status_solicitacao = 'aprovado'
      AND up.ativo
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.user_papel_modulo(chave text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT upm.papel
      FROM public.user_papel_modulos upm
      WHERE upm.user_id = auth.uid()
        AND upm.modulo_key = chave
        AND public.user_papel() IS NOT NULL
    ),
    public.user_papel()
  );
$$;

CREATE OR REPLACE FUNCTION public.aceitar_termos(versao text DEFAULT '1.0')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão ausente' USING ERRCODE = '28000'; END IF;
  IF versao <> '1.0' THEN RAISE EXCEPTION 'Versão de termos inválida' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('app.gestao_perfil_autorizada', 'on', true);
  UPDATE public.user_profiles SET termos_aceitos_em = now(), versao_termos = '1.0' WHERE id = auth.uid();
END;
$$;

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
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_exclusao_conta()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão ausente' USING ERRCODE = '28000'; END IF;
  PERFORM set_config('app.gestao_perfil_autorizada', 'on', true);
  UPDATE public.user_profiles
  SET exclusao_solicitada_em = NULL, exclusao_motivo = NULL, ativo = true
  WHERE id = auth.uid() AND exclusao_confirmada_em IS NULL;
END;
$$;

-- ============ 2. PERFIS: NENHUMA ESCRITA DIRETA PELO CLIENTE ============

REVOKE UPDATE ON public.user_profiles FROM authenticated;

CREATE OR REPLACE FUNCTION public.protege_campos_sensiveis_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.gestao_perfil_autorizada', true) = 'on' OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     OR NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id
     OR NEW.papel IS DISTINCT FROM OLD.papel
     OR NEW.status_solicitacao IS DISTINCT FROM OLD.status_solicitacao
     OR NEW.escopo_projetos IS DISTINCT FROM OLD.escopo_projetos
     OR NEW.ativo IS DISTINCT FROM OLD.ativo
     OR NEW.termos_aceitos_em IS DISTINCT FROM OLD.termos_aceitos_em
     OR NEW.versao_termos IS DISTINCT FROM OLD.versao_termos THEN
    RAISE EXCEPTION 'Campo de perfil protegido; use a operação autorizada.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protege_campos_sensiveis_usuario ON public.user_profiles;
CREATE TRIGGER trg_protege_campos_sensiveis_usuario
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protege_campos_sensiveis_usuario();

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
END;
$$;

CREATE OR REPLACE FUNCTION public.alterar_papel_usuario(p_usuario_id uuid, p_papel text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.gerenciar_usuario(p_usuario_id, 'aprovado', p_papel, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_escopo_projetos(p_usuario_id uuid, p_escopo text, p_projeto_ids uuid[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.user_organizacao();
  v_alvo_org uuid;
BEGIN
  IF auth.uid() IS NULL OR (NOT public.is_super_admin() AND public.user_papel_modulo('sistema') <> 'edicao') THEN
    RAISE EXCEPTION 'Sem permissão para definir escopo de obras' USING ERRCODE = '42501';
  END IF;
  IF p_usuario_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é permitido ampliar o próprio acesso' USING ERRCODE = '42501';
  END IF;
  IF p_escopo NOT IN ('todos', 'vinculados') THEN
    RAISE EXCEPTION 'Escopo inválido' USING ERRCODE = '22023';
  END IF;
  SELECT organizacao_id INTO v_alvo_org FROM public.user_profiles WHERE id = p_usuario_id FOR UPDATE;
  IF v_alvo_org IS NULL OR (NOT public.is_super_admin() AND v_alvo_org <> v_org) THEN
    RAISE EXCEPTION 'Usuário fora da sua organização' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(p_projeto_ids) AS selecionado(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = selecionado.id AND p.organizacao_id = v_alvo_org)
  ) THEN
    RAISE EXCEPTION 'Uma ou mais obras não pertencem à organização do usuário' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.gestao_perfil_autorizada', 'on', true);
  UPDATE public.user_profiles SET escopo_projetos = p_escopo WHERE id = p_usuario_id;
  DELETE FROM public.projeto_usuarios WHERE user_id = p_usuario_id;
  IF p_escopo = 'vinculados' THEN
    INSERT INTO public.projeto_usuarios (projeto_id, user_id, atribuido_por)
    SELECT selecionado.id, p_usuario_id, auth.uid() FROM unnest(p_projeto_ids) AS selecionado(id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_super_admin(p_usuario_id uuid, p_valor boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() OR p_usuario_id = auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão para alterar Dono da Plataforma' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.gestao_perfil_autorizada', 'on', true);
  UPDATE public.user_profiles SET is_super_admin = p_valor WHERE id = p_usuario_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE = 'P0002'; END IF;
END;
$$;

-- ============ 3. CONVITES DE USO ÚNICO, COM TOKEN E EXPIRAÇÃO ============

ALTER TABLE public.convites
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS revogado_em timestamptz,
  ADD COLUMN IF NOT EXISTS revogado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS usado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS enviado_em timestamptz;

UPDATE public.convites
SET expira_em = criado_em + interval '7 days'
WHERE expira_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS convites_token_hash_uidx ON public.convites (token_hash) WHERE token_hash IS NOT NULL;
DROP INDEX IF EXISTS public.convites_email_pendente_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS convites_organizacao_email_pendente_uidx
  ON public.convites (organizacao_id, lower(email))
  WHERE usado_em IS NULL AND revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS convites_organizacao_pendente_idx ON public.convites (organizacao_id, criado_em DESC) WHERE usado_em IS NULL AND revogado_em IS NULL;

REVOKE INSERT, UPDATE, DELETE ON public.convites FROM authenticated;

CREATE OR REPLACE FUNCTION public.criar_convite(p_email text, p_papel text, p_organizacao_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := COALESCE(p_organizacao_id, public.user_organizacao());
  v_token text := encode(gen_random_bytes(32), 'hex');
BEGIN
  IF auth.uid() IS NULL OR (NOT public.is_super_admin() AND public.user_papel_modulo('sistema') <> 'edicao') THEN
    RAISE EXCEPTION 'Sem permissão para criar convite' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin() AND v_org <> public.user_organizacao() THEN
    RAISE EXCEPTION 'Organização inválida' USING ERRCODE = '42501';
  END IF;
  IF p_papel NOT IN ('edicao', 'visualizacao', 'insercao_pontual') OR p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Dados de convite inválidos' USING ERRCODE = '22023';
  END IF;
  UPDATE public.convites
  SET revogado_em = now(), revogado_por = auth.uid()
  WHERE organizacao_id = v_org
    AND lower(email) = lower(trim(p_email))
    AND usado_em IS NULL
    AND revogado_em IS NULL;
  RETURN QUERY
  INSERT INTO public.convites (organizacao_id, email, papel_convidado, criado_por, token_hash, expira_em)
  VALUES (v_org, lower(trim(p_email)), p_papel, auth.uid(), encode(digest(v_token, 'sha256'), 'hex'), now() + interval '7 days')
  RETURNING convites.id, v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.revogar_convite(p_convite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.convites c
  SET revogado_em = now(), revogado_por = auth.uid()
  WHERE c.id = p_convite_id
    AND c.usado_em IS NULL
    AND c.revogado_em IS NULL
    AND (public.is_super_admin() OR (c.organizacao_id = public.user_organizacao() AND public.user_papel_modulo('sistema') = 'edicao'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite não encontrado ou sem permissão' USING ERRCODE = '42501'; END IF;
END;
$$;

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
  ELSE
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, NULL, 'pendente', NULL);
  END IF;
  RETURN new;
END;
$$;

-- ============ 4. DEMO: SOMENTE A EDGE FUNCTION DE SERVIÇO PROVISIONA ============

CREATE OR REPLACE FUNCTION public.validar_acesso_demo_para_provisionamento(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acessos_demo d
    WHERE d.id = p_id
      AND d.revogado_em IS NULL
      AND d.link_expira_em > now()
  );
$$;

DROP FUNCTION IF EXISTS public.resgatar_acesso_demo(uuid, uuid);
CREATE OR REPLACE FUNCTION public.resgatar_acesso_demo(p_id uuid, p_user_id uuid)
RETURNS TABLE (out_organizacao_id uuid, out_projeto_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acesso public.acessos_demo%ROWTYPE;
  v_org_id uuid;
  v_projeto_id uuid;
  v_perfil public.user_profiles%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Operação de provisionamento não autorizada' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_acesso FROM public.acessos_demo WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_acesso.revogado_em IS NOT NULL OR v_acesso.link_expira_em <= now() THEN
    RAISE EXCEPTION 'Link de acesso demo indisponível' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_perfil FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_perfil.organizacao_id IS NOT NULL THEN
    RAISE EXCEPTION 'Usuário demo inválido' USING ERRCODE = '42501';
  END IF;

  IF v_acesso.organizacao_id IS NULL THEN
    INSERT INTO public.organizacoes (nome, is_demo, demo_expira_em)
    VALUES (v_acesso.nome_empresa, true, now() + interval '72 hours')
    RETURNING id INTO v_org_id;
    INSERT INTO public.organizacao_modulos (organizacao_id, modulo_key, ativo)
    SELECT v_org_id, m.key, true FROM public.modulos m;
    INSERT INTO public.projetos (organizacao_id, nome, status, criado_por)
    VALUES (v_org_id, v_acesso.nome_empresa, 'ativo', p_user_id)
    RETURNING id INTO v_projeto_id;
    UPDATE public.acessos_demo SET organizacao_id = v_org_id, ativado_em = now() WHERE id = p_id;
  ELSE
    SELECT org.id INTO v_org_id
    FROM public.organizacoes org
    WHERE org.id = v_acesso.organizacao_id
      AND org.ativo
      AND (org.demo_expira_em IS NULL OR org.demo_expira_em > now());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Link de acesso demo indisponível' USING ERRCODE = '28000'; END IF;
    SELECT id INTO v_projeto_id FROM public.projetos WHERE organizacao_id = v_org_id ORDER BY criado_em LIMIT 1;
  END IF;

  PERFORM set_config('app.gestao_perfil_autorizada', 'on', true);
  UPDATE public.user_profiles
  SET papel = 'edicao', status_solicitacao = 'aprovado', organizacao_id = v_org_id,
      nome = 'Visitante Demo', funcao = 'Demonstração', termos_aceitos_em = now()
  WHERE id = p_user_id;
  RETURN QUERY SELECT v_org_id, v_projeto_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_acesso_demo_para_provisionamento(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resgatar_acesso_demo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_acesso_demo_para_provisionamento(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resgatar_acesso_demo(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.revogar_acesso_demo(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Sem permissão para revogar demo' USING ERRCODE = '42501'; END IF;
  UPDATE public.acessos_demo
  SET revogado_em = COALESCE(revogado_em, now())
  WHERE id = p_id
  RETURNING organizacao_id INTO v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso demo não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_org IS NOT NULL THEN
    UPDATE public.organizacoes SET ativo = false, demo_expira_em = now() WHERE id = v_org AND is_demo;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revogar_acesso_demo(uuid) TO authenticated;

-- ============ 5. APRESENTAÇÕES: TOKEN SÓ MUDA POR RPC AUTORIZADA ============

CREATE OR REPLACE FUNCTION public.protege_token_apresentacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.token_acesso_publico IS DISTINCT FROM OLD.token_acesso_publico OR NEW.token_revogado_em IS DISTINCT FROM OLD.token_revogado_em)
     AND current_setting('app.gestao_token_apresentacao', true) <> 'on'
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Use a operação autorizada para alterar token público' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protege_token_apresentacao ON public.apresentacao_playlists;
CREATE TRIGGER trg_protege_token_apresentacao
  BEFORE UPDATE ON public.apresentacao_playlists
  FOR EACH ROW EXECUTE FUNCTION public.protege_token_apresentacao();

CREATE OR REPLACE FUNCTION public.pode_gerenciar_apresentacao(p_playlist_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.apresentacao_playlists pl
    WHERE pl.id = p_playlist_id
      AND pl.organizacao_id = public.user_organizacao()
      AND public.user_papel() = 'edicao'
      AND (pl.projeto_id IS NULL OR public.user_ve_projeto(pl.projeto_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.apresentacao_revogar_token(p_playlist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.pode_gerenciar_apresentacao(p_playlist_id) THEN RAISE EXCEPTION 'Sem permissão para esta apresentação' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('app.gestao_token_apresentacao', 'on', true);
  UPDATE public.apresentacao_playlists SET token_revogado_em = now() WHERE id = p_playlist_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apresentacao_regenerar_token(p_playlist_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_token text := encode(gen_random_bytes(24), 'hex');
BEGIN
  IF NOT public.pode_gerenciar_apresentacao(p_playlist_id) THEN RAISE EXCEPTION 'Sem permissão para esta apresentação' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('app.gestao_token_apresentacao', 'on', true);
  UPDATE public.apresentacao_playlists SET token_acesso_publico = v_token, token_revogado_em = NULL WHERE id = p_playlist_id;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.apresentacao_revogar_token(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apresentacao_regenerar_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apresentacao_revogar_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apresentacao_regenerar_token(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.refresh_projeto_kpis_sob_demanda() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_projeto_kpis_sob_demanda() TO authenticated;

-- Explicitamente limita funções novas e alteradas aos papéis corretos.
REVOKE ALL ON FUNCTION public.gerenciar_usuario(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.alterar_papel_usuario(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_escopo_projetos(uuid, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_super_admin(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_convite(text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revogar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_usuario(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_papel_usuario(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_escopo_projetos(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_super_admin(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_convite(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_convite(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
