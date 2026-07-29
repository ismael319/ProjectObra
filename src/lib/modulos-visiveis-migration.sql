-- ============================================================
-- MIGRAÇÃO: Visibilidade de módulo por usuário (além do contrato da empresa)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS acesso-3-niveis-migration.sql
-- ============================================================
-- organizacao_modulos já controla quais módulos uma EMPRESA contratou.
-- Isso aqui adiciona uma segunda camada, por USUÁRIO: dentro dos módulos que
-- a empresa já tem, um usuário específico pode ser restringido a só ver
-- alguns. Ausência de qualquer linha pra um usuário = sem restrição (vê
-- tudo que a empresa contratou, inclusive módulos novos que ela contratar
-- depois) — compatível com o comportamento de hoje. Só aditivo: nenhuma
-- tabela/coluna/constraint existente é alterada aqui, então dá pra testar
-- e reverter (DROP TABLE / DROP FUNCTION) isolado do resto.
-- ============================================================

-- ============ 1. TABELA ============

CREATE TABLE IF NOT EXISTS public.user_modulos_visiveis (
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  modulo_key text NOT NULL REFERENCES public.modulos(key) ON DELETE CASCADE,
  restringido_por uuid REFERENCES auth.users(id),
  restringido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, modulo_key)
);

ALTER TABLE public.user_modulos_visiveis ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_modulos_visiveis TO authenticated;

-- Leitura: o próprio usuário vê suas restrições; edicao/Dono da mesma
-- empresa do usuário-alvo também vê (pra montar a tela de gestão).
DROP POLICY IF EXISTS "Leitura modulos visiveis" ON public.user_modulos_visiveis;
CREATE POLICY "Leitura modulos visiveis" ON public.user_modulos_visiveis
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = user_modulos_visiveis.user_id
        AND up.organizacao_id = public.user_organizacao()
        AND public.user_papel() = 'edicao'
    )
  );

-- Escrita: só edicao da mesma empresa do usuário-alvo, ou Dono da Plataforma
-- — nunca o próprio usuário-alvo (evita autoliberação).
DROP POLICY IF EXISTS "Edicao gerencia modulos visiveis" ON public.user_modulos_visiveis;
CREATE POLICY "Edicao gerencia modulos visiveis" ON public.user_modulos_visiveis
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = user_modulos_visiveis.user_id
        AND up.organizacao_id = public.user_organizacao()
        AND public.user_papel() = 'edicao'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = user_modulos_visiveis.user_id
        AND up.organizacao_id = public.user_organizacao()
        AND public.user_papel() = 'edicao'
    )
  );

-- ============ 2. FUNÇÃO: minha empresa TEM o módulo E eu, individualmente, VEJO ele? ============

CREATE OR REPLACE FUNCTION public.user_ve_modulo(chave text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.user_tem_modulo(chave) AND (
    NOT EXISTS (SELECT 1 FROM public.user_modulos_visiveis WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_modulos_visiveis WHERE user_id = auth.uid() AND modulo_key = chave)
  );
$$;

-- ============ 3. RETARGET: bloqueio de verdade passa a checar por usuário também ============
-- Mesmas tabelas de modulos-plataforma-migration.sql seção 5 — só troca
-- user_tem_modulo (só empresa) por user_ve_modulo (empresa E usuário), pra
-- restrição por usuário valer de verdade no banco, não só esconder na tela.

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'scenarios','equipes','gantt_atividades','paradas',
    'empresas','liderancas','setores','areas','subareas','atividades',
    'apontamentos_diarios','dias_trabalho','eap_modelos',
    'activities','app_settings','mapa_chuvas'
  ]
  LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Restringe pelo modulo engenharia', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO public USING (public.user_ve_modulo(''engenharia''));',
      'Restringe pelo modulo engenharia', tabela
    );
  END LOOP;
END $$;

-- RDR/Segurança ainda não tem tabelas próprias no Supabase — quando ganhar,
-- aplique o mesmo padrão trocando 'engenharia' por 'seguranca'.
