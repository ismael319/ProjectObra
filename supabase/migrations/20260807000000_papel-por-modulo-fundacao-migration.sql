-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- FUNDAÇÃO pra permitir papel (edicao/visualizacao/insercao_pontual)
-- DIFERENTE por módulo pra um mesmo usuário — hoje user_profiles.papel é
-- uma coluna única, global, e vale igual em todos os módulos (211 usos de
-- user_papel() nas migrations existentes). Essa migration NÃO troca nenhuma
-- dessas 211 chamadas — cria só a estrutura nova, de forma aditiva:
--
-- user_profiles.papel continua sendo o "papel padrão". user_papel_modulos
-- guarda só as EXCEÇÕES (overrides) por usuário+módulo — ausência de linha
-- pra um usuário num módulo = usa o papel padrão dele, exatamente como hoje.
-- Zero migração de dado retroativa, zero mudança de comportamento pra quem
-- nunca tiver um override configurado.
--
-- Mesmo desenho de user_modulos_visiveis (20260803000300_modulos-visiveis-
-- migration.sql) — tabela aditiva + RLS leitura/escrita por organização.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. TABELA ============

CREATE TABLE IF NOT EXISTS public.user_papel_modulos (
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  modulo_key text NOT NULL REFERENCES public.modulos(key) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('edicao', 'visualizacao', 'insercao_pontual')),
  definido_por uuid REFERENCES auth.users(id),
  definido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, modulo_key)
);

ALTER TABLE public.user_papel_modulos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_papel_modulos TO authenticated;

-- Leitura: o próprio usuário vê seus overrides; edicao/Dono da mesma
-- empresa do usuário-alvo também vê (pra montar a tela de gestão).
DROP POLICY IF EXISTS "Leitura papel por modulo" ON public.user_papel_modulos;
CREATE POLICY "Leitura papel por modulo" ON public.user_papel_modulos
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = user_papel_modulos.user_id
        AND up.organizacao_id = public.user_organizacao()
        AND public.user_papel() = 'edicao'
    )
  );

-- Escrita: só edicao da mesma empresa do usuário-alvo, ou Dono da
-- Plataforma — nunca o próprio usuário-alvo (evita autoliberação de papel).
DROP POLICY IF EXISTS "Edicao gerencia papel por modulo" ON public.user_papel_modulos;
CREATE POLICY "Edicao gerencia papel por modulo" ON public.user_papel_modulos
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      user_papel_modulos.user_id <> auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = user_papel_modulos.user_id
          AND up.organizacao_id = public.user_organizacao()
          AND public.user_papel() = 'edicao'
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      user_papel_modulos.user_id <> auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = user_papel_modulos.user_id
          AND up.organizacao_id = public.user_organizacao()
          AND public.user_papel() = 'edicao'
      )
    )
  );

-- ============ 2. FUNÇÃO: papel efetivo do usuário logado NUM módulo ============
-- Override se existir (e o usuário estiver aprovado), senão cai no papel
-- global (user_papel() já checa status_solicitacao='aprovado' — não duplica
-- essa lógica aqui).

CREATE OR REPLACE FUNCTION public.user_papel_modulo(chave text)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (
      SELECT upm.papel FROM public.user_papel_modulos upm
      JOIN public.user_profiles up ON up.id = upm.user_id
      WHERE upm.user_id = auth.uid()
        AND upm.modulo_key = chave
        AND up.status_solicitacao = 'aprovado'
    ),
    public.user_papel()
  );
$$;

NOTIFY pgrst, 'reload schema';
