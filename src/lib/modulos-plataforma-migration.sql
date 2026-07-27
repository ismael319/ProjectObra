-- ============================================================
-- MIGRAÇÃO: Módulos por empresa (pacote contratado)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS multi-tenant-fase1-migration.sql
-- ============================================================
-- Hoje as telas ainda não isoladas por empresa (Gantt Livre, Apontamento/EAP,
-- Programação semanal, Mapa de Chuvas, RDR) liberam pra QUALQUER usuário da
-- "empresa piloto" — um hack temporário. Isso substitui esse hack por um
-- sistema de verdade: cada empresa contrata um pacote de módulos (hoje
-- "Engenharia" e "Segurança", as seções da barra lateral), e só o Dono da
-- Plataforma decide quais módulos cada empresa tem.
-- ============================================================

-- ============ 1. CATÁLOGO DE MÓDULOS ============

CREATE TABLE IF NOT EXISTS public.modulos (
  key text PRIMARY KEY,
  nome text NOT NULL,
  descricao text
);

INSERT INTO public.modulos (key, nome, descricao) VALUES
  ('engenharia', 'Engenharia', 'Planejamento, Gantt Livre, Distribuição de Efetivo/EAP, Mapa de Chuvas'),
  ('seguranca', 'Segurança', 'RDR e demais telas de segurança do trabalho')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.modulos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.modulos TO authenticated;
DROP POLICY IF EXISTS "Leitura modulos catalogo" ON public.modulos;
CREATE POLICY "Leitura modulos catalogo" ON public.modulos FOR SELECT TO authenticated USING (true);

-- ============ 2. QUAIS MÓDULOS CADA EMPRESA TEM CONTRATADO ============

CREATE TABLE IF NOT EXISTS public.organizacao_modulos (
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  modulo_key text NOT NULL REFERENCES public.modulos(key) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  liberado_por uuid REFERENCES auth.users(id),
  liberado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organizacao_id, modulo_key)
);

ALTER TABLE public.organizacao_modulos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizacao_modulos TO authenticated;

DROP POLICY IF EXISTS "Leitura modulos da propria empresa" ON public.organizacao_modulos;
CREATE POLICY "Leitura modulos da propria empresa" ON public.organizacao_modulos
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Dono gerencia modulos" ON public.organizacao_modulos;
CREATE POLICY "Dono gerencia modulos" ON public.organizacao_modulos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 3. FUNÇÃO AUXILIAR: minha empresa tem esse módulo ativo? ============

CREATE OR REPLACE FUNCTION public.user_tem_modulo(chave text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizacao_modulos
    WHERE organizacao_id = public.user_organizacao() AND modulo_key = chave AND ativo
  );
$$;

-- ============ 4. BACKFILL: empresa piloto mantém acesso a tudo que já tinha ============

INSERT INTO public.organizacao_modulos (organizacao_id, modulo_key, ativo)
SELECT o.id, m.key, true
FROM public.organizacoes o
CROSS JOIN public.modulos m
WHERE o.is_piloto
ON CONFLICT (organizacao_id, modulo_key) DO NOTHING;

-- ============ 5. TROCA O GATE DAS TABELAS AINDA NÃO ISOLADAS: piloto -> módulo ============
-- Mesmas tabelas de multi-tenant-fase1-migration.sql passo 10 — só troca a
-- condição da RESTRICTIVE policy (deixa de ser "é da empresa piloto" e passa
-- a ser "minha empresa tem o módulo Engenharia contratado").

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'scenarios','equipes','atividades','paradas',
    'empresas','liderancas','setores','areas','subareas',
    'apontamentos_diarios','dias_trabalho','eap_modelos',
    'activities','app_settings','mapa_chuvas'
  ]
  LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Restringe a organizacao piloto', tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'Restringe pelo modulo engenharia', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO public USING (public.user_tem_modulo(''engenharia''));',
      'Restringe pelo modulo engenharia', tabela
    );
  END LOOP;
END $$;

-- RDR ainda não tem tabelas próprias no Supabase (as telas de Segurança são só
-- front-end por enquanto) — quando ganhar tabelas, aplique o mesmo padrão
-- acima trocando 'engenharia' por 'seguranca'.
