-- ============================================================
-- MIGRAÇÃO: Consentimento LGPD - Termos de Uso e Privacidade
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================

-- ============ 1. ADICIONAR COLUNAS DE CONSENTIMENTO ============

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS termos_aceitos_em timestamptz,
  ADD COLUMN IF NOT EXISTS versao_termos text DEFAULT '1.0';

-- Índice para consultar usuários que ainda não aceitaram
CREATE INDEX IF NOT EXISTS idx_user_profiles_termos_aceitos
  ON public.user_profiles (termos_aceitos_em)
  WHERE termos_aceitos_em IS NULL;

-- ============ 2. FUNÇÃO PARA REGISTRAR ACEITE ============

CREATE OR REPLACE FUNCTION public.aceitar_termos(versao text DEFAULT '1.0')
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.user_profiles
  SET termos_aceitos_em = now(),
      versao_termos = versao
  WHERE id = auth.uid();
$$;

-- ============ 3. FUNÇÃO PARA VERIFICAR SE USUÁRIO ACEITOU ============

CREATE OR REPLACE FUNCTION public.usuario_aceitou_termos(versao text DEFAULT '1.0')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND termos_aceitos_em IS NOT NULL
      AND versao_termos = versao
  );
$$;

-- ============ 4. GRANT DE EXECUÇÃO ============

GRANT EXECUTE ON FUNCTION public.aceitar_termos TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_aceitou_termos TO authenticated;

-- ============ 5. ATUALIZAR TRIGGER DE NOVO USUÁRIO ============

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, papel, status_solicitacao, termos_aceitos_em)
  VALUES (new.id, 'edicao', 'pendente', now());
  RETURN new;
END;
$$;

-- ============ 6. ATUALIZAR POLÍTICA user_papel ============

-- A função user_papel() agora também verifica se o usuário aceitou os termos
-- (apenas para acesso a dados de negócio — login ainda funciona sem aceite)
CREATE OR REPLACE FUNCTION public.user_papel()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT papel FROM public.user_profiles
  WHERE id = auth.uid()
    AND status_solicitacao = 'aprovado'
    AND termos_aceitos_em IS NOT NULL;
$$;
