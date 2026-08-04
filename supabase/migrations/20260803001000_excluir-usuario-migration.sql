-- ============================================================
-- MIGRAÇÃO: Exclusão de conta por gestor/super admin (admin)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- O QUE FAZ
-- RPC public.excluir_usuario(uuid): apaga DE VERDADE a conta de outro
-- usuário (auth.users + user_profiles + user_modulos_visiveis + sessões/
-- identidades do schema auth), usada pelo botão "Excluir" da tela
-- Gestão de Usuários (aba Histórico).
--
-- REGRAS DE SEGURANÇA
--  * Só autenticado pode chamar;
--  * Não pode excluir a própria conta;
--  * Super admin exclui qualquer um; gestor (papel 'edicao') exclui
--    usuários da MESMA organização;
--  * Só super admin exclui outro super admin;
--  * Não deixa excluir o último super admin ativo.
--
-- DADOS DE NEGÓCIO
-- Apontamentos, registros RDR, RH, projetos etc. são PRESERVADOS.
-- As colunas que apontavam para o usuário (criado_por, autor_id,
-- atualizado_por, etc. — todas anuláveis) recebem NULL. As que já eram
-- ON DELETE SET NULL ou CASCADE propagam sozinhas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.excluir_usuario(usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_org uuid;
  v_super boolean;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF usuario_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a sua própria conta';
  END IF;

  SELECT email, organizacao_id, is_super_admin
    INTO v_email, v_org, v_super
    FROM public.user_profiles
    WHERE id = usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  IF v_super AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas super administradores podem excluir outro super administrador';
  END IF;

  IF NOT (public.is_super_admin() OR (public.user_papel() = 'edicao' AND public.user_organizacao() = v_org)) THEN
    RAISE EXCEPTION 'Sem permissão para excluir este usuário';
  END IF;

  IF v_super AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE is_super_admin AND id <> usuario_id AND ativo IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'Não é possível excluir o último super administrador';
  END IF;

  -- Anula todas as FKs do schema public com ON DELETE NO ACTION/RESTRICT
  -- (e SET NULL) que apontam para auth.users. Lista descoberta via catálogo,
  -- então futuras tabelas também são cobertas.
  FOR r IN
    SELECT n.nspname AS schemaname, c.relname AS tablename, a.attname AS colname
    FROM pg_constraint f
    JOIN pg_class c ON c.oid = f.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = ANY(f.conkey)
    WHERE f.contype = 'f'
      AND f.confrelid = 'auth.users'::regclass
      AND f.confdeltype IN ('a', 'r', 'n')
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('UPDATE %I.%I SET %I = NULL WHERE %I = $1', r.schemaname, r.tablename, r.colname, r.colname)
      USING usuario_id;
  END LOOP;

  -- Convites ativos (não usados) para o email do usuário não fazem mais sentido.
  DELETE FROM public.convites
    WHERE lower(email) = lower(v_email) AND usado_em IS NULL;

  -- Apaga o usuário: cascata remove user_profiles, user_modulos_visiveis,
  -- auth.sessions, auth.identities, auth.mfa_factors etc.
  DELETE FROM auth.users WHERE id = usuario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_usuario(uuid) TO authenticated;
