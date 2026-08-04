-- ============================================================
-- MIGRAÇÃO: Fluxo de aprovação de novos usuários
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS rls-migration.sql
-- ============================================================
-- Corrige o bug em que todo novo cadastro virava 'admin' automaticamente
-- (handle_new_user em rls-migration.sql). A partir de agora, todo novo
-- usuário nasce com status_solicitacao='pendente' e papel=NULL, e só ganha
-- um papel (admin/gestor/engenheiro/campo) quando um gestor ou admin
-- aprovar a solicitação manualmente pela tela de Gestão de Usuários.
-- ============================================================

-- ============ 0. LEVANTAMENTO (rodar e revisar ANTES de seguir) ============
-- Não altera nada — serve para você decidir manualmente quem fica admin de
-- verdade antes do backfill da seção 2 aprovar todo mundo que já tinha papel.
--
-- SELECT id, papel, criado_em FROM public.user_profiles WHERE papel = 'admin';

-- ============ 1. ALTERAR TABELA user_profiles ============

ALTER TABLE public.user_profiles ALTER COLUMN papel DROP NOT NULL;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS status_solicitacao text NOT NULL DEFAULT 'pendente'
    CHECK (status_solicitacao IN ('pendente','aprovado','rejeitado'));

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS decidido_por uuid REFERENCES auth.users(id);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS decidido_em timestamptz;

-- ============ 2. BACKFILL (roda ANTES da constraint de coerência) ============
-- Todo usuário que já tinha um papel válido é considerado já aprovado —
-- senão a constraint da seção 3 quebraria para todo mundo que já usa o sistema.

UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id AND up.email IS NULL;

UPDATE public.user_profiles
SET status_solicitacao = 'aprovado'
WHERE papel IS NOT NULL;

-- ============ 3. COERÊNCIA papel <-> status (só depois do backfill acima) ============

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS papel_coerente_com_status;
ALTER TABLE public.user_profiles ADD CONSTRAINT papel_coerente_com_status CHECK (
  (status_solicitacao = 'aprovado' AND papel IS NOT NULL)
  OR (status_solicitacao IN ('pendente','rejeitado') AND papel IS NULL)
);

-- ============ 4. TRIGGER DE SIGNUP: cria solicitação pendente (sem papel) ============

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, papel, status_solicitacao)
  VALUES (new.id, new.email, NULL, 'pendente');
  RETURN new;
END;
$$;
-- O trigger on_auth_user_created já existe (criado em rls-migration.sql) e
-- reaproveita esta mesma função — não precisa recriar o trigger em si.

-- ============ 5. TRIGGER DE DECISÃO: carimba auditoria e bloqueia burla ============

CREATE OR REPLACE FUNCTION public.handle_user_profile_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ator_papel text;
BEGIN
  IF (new.papel IS DISTINCT FROM old.papel)
     OR (new.status_solicitacao IS DISTINCT FROM old.status_solicitacao) THEN

    new.decidido_por := auth.uid();
    new.decidido_em := now();

    ator_papel := public.user_papel();

    -- Só um admin pode conceder o papel admin (segunda camada além da RLS).
    IF new.papel = 'admin' AND ator_papel IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Somente administradores podem conceder o papel admin';
    END IF;

    -- Ninguém decide sobre a própria solicitação, nem admin.
    IF new.id = auth.uid() THEN
      RAISE EXCEPTION 'Não é permitido decidir sobre a própria solicitação';
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_user_profile_decision ON public.user_profiles;
CREATE TRIGGER on_user_profile_decision
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_profile_decision();

-- ============ 6. user_papel(): só considera quem está aprovado ============
-- Todas as policies de outras tabelas (empresas, atividades, apontamentos...)
-- dependem desta função — ao redefini-la, a proteção se propaga sozinha.

CREATE OR REPLACE FUNCTION public.user_papel()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT papel FROM public.user_profiles
  WHERE id = auth.uid() AND status_solicitacao = 'aprovado';
$$;

-- ============ 7. POLICIES DE user_profiles ============

-- Fecha a brecha de auto-escalação: usuário comum não dá mais UPDATE na
-- própria linha (nenhum código do frontend depende disso hoje).
DROP POLICY IF EXISTS "Update propio perfil" ON public.user_profiles;

DROP POLICY IF EXISTS "Leitura propio perfil" ON public.user_profiles;
CREATE POLICY "Leitura propio perfil" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Gestor le solicitacoes" ON public.user_profiles;
CREATE POLICY "Gestor le solicitacoes" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Gestor decide solicitacoes" ON public.user_profiles;
CREATE POLICY "Gestor decide solicitacoes" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (public.user_papel() = 'gestor' AND status_solicitacao = 'pendente')
  WITH CHECK (
    public.user_papel() = 'gestor'
    AND papel IN ('gestor','engenheiro','campo')
    AND status_solicitacao IN ('aprovado','rejeitado')
  );

DROP POLICY IF EXISTS "Admin gerencia perfis" ON public.user_profiles;
CREATE POLICY "Admin gerencia perfis" ON public.user_profiles
  FOR ALL TO authenticated
  USING (public.user_papel() = 'admin')
  WITH CHECK (public.user_papel() = 'admin');

-- ============ 8. CORREÇÃO MANUAL DOS ADMINS INDEVIDOS ============
-- Rode isto depois de revisar a seção 0. A role de owner do banco ignora
-- RLS, mas o trigger da seção 5 continua ativo (bloqueia auto-decisão e
-- concessão de admin por não-admin) — por isso, para corrigir o primeiro
-- admin (ou a si mesmo), desabilite o trigger antes e reabilite depois:
--
-- ALTER TABLE public.user_profiles DISABLE TRIGGER on_user_profile_decision;
-- UPDATE public.user_profiles SET papel = 'gestor' WHERE id = '<uuid-do-usuario-indevido>';
-- -- (repita para cada usuário indevido, definindo o papel correto)
-- ALTER TABLE public.user_profiles ENABLE TRIGGER on_user_profile_decision;
