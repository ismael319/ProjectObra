-- ============================================================
-- MIGRAÇÃO: Correção do 500 no cadastro (auth/v1/signup)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- PROBLEMA
-- O signup de novas contas retorna "500 (Internal Server Error)".
-- Causa: a versão de handle_new_user() do consentimento-lgpd-migration.sql
-- insere (id, papel 'edicao', status_solicitacao 'pendente', ...), o que
-- viola a constraint papel_coerente_com_status criada em
-- user-approval-migration.sql (pendente/rejeitado exige papel NULL).
-- Toda exceção dentro do trigger on_auth_user_created aborta a criação
-- do usuário com 500.
--
-- SOLUÇÃO
-- Reunifica handle_new_user() na versão definitiva (multi-tenant + LGPD):
--   * com convite ativo: conta nasce aprovada, com papel e organização
--     do convite (respeita aprovado_tem_organizacao e
--     papel_coerente_com_status);
--   * sem convite: conta nasce pendente, papel NULL, sem organização.
-- Também garante que o trigger on_auth_user_created exista apontando
-- para esta função.
-- ============================================================

-- ============ DIAGNÓSTICO (rodar ANTES, se quiser confirmar) ============
-- SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'public.user_profiles'::regclass;

-- ============ 1. FUNÇÃO DEFINITIVA DE SIGNUP ============

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  convite record;
BEGIN
  IF to_regclass('public.convites') IS NOT NULL THEN
    SELECT * INTO convite FROM public.convites
    WHERE lower(email) = lower(new.email) AND usado_em IS NULL
    ORDER BY criado_em DESC LIMIT 1;
  END IF;

  IF convite IS NOT NULL THEN
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, convite.papel_convidado, 'aprovado', convite.organizacao_id);
    UPDATE public.convites SET usado_em = now() WHERE id = convite.id;
  ELSE
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, NULL, 'pendente', NULL);
  END IF;

  RETURN new;
END;
$$;

-- ============ 2. GARANTIR O TRIGGER ============

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CONFERÊNCIA (rodar DEPOIS) ============
-- SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass;
