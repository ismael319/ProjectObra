-- ============================================================
-- MIGRAÇÃO: RDR — Integridade de autoria e acesso por usuário
-- Execute no SQL Editor do Supabase do ProjectObra
-- IMPORTANTE: rode DEPOIS de rdr-migration.sql e de
-- modulos-visiveis-migration.sql (que cria public.user_ve_modulo).
-- ============================================================
-- Objetivos:
--  1) Vínculo real de autoria: autor_id e criado_por passam a ser
--     preenchidos pelo próprio Supabase Auth (auth.uid()) em todo
--     INSERT — o formulário não pode mais "escolher" quem registrou.
--  2) autor_nome deixa de ser texto livre do cliente: um trigger
--     grava o nome/e-mail da conta logada, então Registros,
--     Dashboard, PDF e Excel sempre exibem a identidade real.
--  3) Acesso por usuário de verdade: a RESTRICTIVE policy deixa de
--     olhar só a empresa (user_tem_modulo) e passa a respeitar a
--     restrição individual de módulo (user_ve_modulo) definida em
--     Empresas Clientes → gerenciar → membros (user_modulos_visiveis).
-- ============================================================

-- ============ 1. DEFAULTS DE AUTORIA (Supabase Auth) ============

ALTER TABLE public.rdr_records
  ALTER COLUMN autor_id SET DEFAULT auth.uid();

ALTER TABLE public.rdr_records
  ALTER COLUMN criado_por SET DEFAULT auth.uid();

-- ============ 2. TRIGGER: autor_nome SEMPRE a conta logada ============
-- Garante que, mesmo que um cliente tente enviar um autor_nome
-- diferente, o banco grava o nome (ou e-mail) de quem está autenticado.
-- Sem sessão (ex.: migration via service role) mantém o valor recebido.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_rdr_autor_nome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nome_usuario text;
BEGIN
  SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'nome', ''), u.email)
    INTO nome_usuario
    FROM auth.users u
    WHERE u.id = auth.uid();

  NEW.autor_nome := COALESCE(nome_usuario, NEW.autor_nome, '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rdr_autor_nome ON public.rdr_records;
CREATE TRIGGER trg_rdr_autor_nome
  BEFORE INSERT OR UPDATE ON public.rdr_records
  FOR EACH ROW EXECUTE FUNCTION public.set_rdr_autor_nome();

-- ============ 3. RLS: RESTRICTIVE vira user_ve_modulo ============
-- user_ve_modulo = empresa tem o módulo E o usuário (sem restrição OU
-- com 'seguranca' marcado em user_modulos_visiveis). Quem não tem
-- Segurança marcado no perfil fica bloqueado no banco — não só na tela.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Restringe rdr_records pelo modulo seguranca" ON public.rdr_records;
CREATE POLICY "Restringe rdr_records pelo modulo seguranca"
  ON public.rdr_records AS RESTRICTIVE FOR ALL TO public
  USING (public.user_ve_modulo('seguranca'));

-- ============================================================
-- COMO CONFIGURAR O ACESSO (via tela, sem SQL):
-- Empresas Clientes → Empresa Piloto → gerenciar → membros:
--   * equipe de segurança  → mantenha 'seguranca' marcado;
--   * demais usuários      → desmarque 'seguranca' (sem linhas de
--     user_modulos_visiveis = vê tudo; com linhas = só o marcado).
-- ============================================================
