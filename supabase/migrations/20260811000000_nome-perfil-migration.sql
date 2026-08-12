-- ============================================================
-- MIGRAÇÃO: Nome de perfil do usuário
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: rode APÓS todas as migrations de RDR e autenticação
-- ============================================================
-- Motivo: o nome do usuário vivia apenas em auth.users.raw_user_meta_data.
-- Quando o usuário não tinha nome no metadata, o trigger set_rdr_autor_nome
-- gravava o EMAIL em rdr_records.autor_nome — exibindo emails no dashboard
-- RDR ("RDR por Responsável").
-- Esta migration cria a coluna oficial `nome` em user_profiles (padrão do
-- campo `funcao`), faz backfill a partir do metadata, ajusta o trigger do
-- RDR para usar essa coluna como fonte primária, corrige registros antigos
-- que gravaram email e cria o RPC seguro de autoatualização.
-- ============================================================

-- ============ 1. COLUNA nome EM user_profiles ============

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS nome text;

-- ============ 2. BACKFILL a partir do metadata do Auth ============

UPDATE public.user_profiles up
SET nome = u.raw_user_meta_data->>'nome'
FROM auth.users u
WHERE u.id = up.id
  AND (up.nome IS NULL OR up.nome = '')
  AND NULLIF(u.raw_user_meta_data->>'nome', '') IS NOT NULL;

-- ============ 3. SIGNUP: gravar nome em user_profiles ============
-- Ajusta handle_new_user() para persistir o nome recebido no metadata
-- (frontend envia user_metadata.nome no supabase.auth.signUp).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  convite_id uuid := NULL;
  convite_papel text;
  convite_org uuid;
  novo_nome text := NULLIF(trim(new.raw_user_meta_data->>'nome'), '');
BEGIN
  IF to_regclass('public.convites') IS NOT NULL THEN
    SELECT id, papel_convidado, organizacao_id
      INTO convite_id, convite_papel, convite_org
      FROM public.convites
      WHERE lower(email) = lower(new.email) AND usado_em IS NULL
      ORDER BY criado_em DESC LIMIT 1;
  END IF;

  IF convite_id IS NOT NULL THEN
    INSERT INTO public.user_profiles (id, email, nome, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, novo_nome, convite_papel, 'aprovado', convite_org);
    UPDATE public.convites SET usado_em = now() WHERE id = convite_id;
  ELSE
    INSERT INTO public.user_profiles (id, email, nome, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, novo_nome, NULL, 'pendente', NULL);
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ 4. TRIGGER RDR: nome vem de user_profiles ============
-- Fonte primária: user_profiles.nome. Fallback: metadata do Auth. Último
-- recurso: email. Continua preservando o autor original no UPDATE.

CREATE OR REPLACE FUNCTION public.set_rdr_autor_nome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nome_usuario text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(NULLIF(up.nome, ''), NULLIF(u.raw_user_meta_data->>'nome', ''), u.email)
      INTO nome_usuario
      FROM auth.users u
      LEFT JOIN public.user_profiles up ON up.id = u.id
      WHERE u.id = auth.uid();

    NEW.autor_nome := COALESCE(nome_usuario, NEW.autor_nome, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rdr_autor_nome ON public.rdr_records;
CREATE TRIGGER trg_rdr_autor_nome
  BEFORE INSERT OR UPDATE ON public.rdr_records
  FOR EACH ROW EXECUTE FUNCTION public.set_rdr_autor_nome();

-- ============ 5. CORRIGIR RDRs ANTIGOS ============
-- Registros cujo autor_nome parece um email (contém '@') são atualizados
-- com o nome oficial do perfil quando existir.

UPDATE public.rdr_records r
SET autor_nome = up.nome
FROM public.user_profiles up
WHERE up.id = r.autor_id
  AND r.autor_nome LIKE '%@%'
  AND NULLIF(up.nome, '') IS NOT NULL;

-- ============ 6. AUTOSSULTUACAO SEGURA DO NOME ============
-- Mesmo padrão de atualizar_minha_funcao: SECURITY DEFINER contorna a RLS
-- por dentro, mas o escopo é fixo (só a coluna nome, só a própria linha) —
-- não há como escalar nada por aqui.

CREATE OR REPLACE FUNCTION public.atualizar_meu_nome(novo_nome text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.user_profiles SET nome = nullif(trim(novo_nome), '') WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_meu_nome(text) TO authenticated;
