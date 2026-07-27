-- ============================================================
-- CONSOLIDADO: migrações pendentes (rodar tudo de uma vez)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: pressupõe que multi-tenant-fase1-migration.sql e
-- user-approval-migration.sql já foram executadas antes.
-- Idempotente — pode rodar de novo sem problema, mesmo repetindo pedaços
-- que já rodaram numa tentativa anterior.
-- ============================================================

-- ============ 1. projetos-grant-fix-migration.sql ============
-- Corrige "cronogramas não ficavam salvos": GRANT faltando nas tabelas
-- projetos/projeto_cronogramas (RLS sem GRANT nega a escrita antes de
-- avaliar a política).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_cronogramas TO authenticated;

-- ============ 2. gantt/migrations.sql (schema completo, corrigido) ============
-- Cria as tabelas do Gantt Livre do zero (scenarios, equipes, paradas) e uma
-- tabela de atividades chamada "gantt_atividades" — NÃO "atividades": esse
-- nome já é usado pela EAP (Apontamento), e Postgres só permite UMA tabela
-- "public.atividades". Numa tentativa anterior, o Gantt Livre tentava reusar
-- "atividades" (achando que era uma tabela antiga dele mesmo) e colava
-- colunas em cima da tabela da EAP — dava erro de tipo (id da EAP é UUID, o
-- Gantt esperava TEXT) e misturava duas features diferentes numa tabela só.
-- Já inclui as colunas parent_id (hierarquia) e percentual_concluido.

CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipes (
  id TEXT PRIMARY KEY,
  scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL,
  funcoes JSONB DEFAULT '[]',
  equipamentos JSONB DEFAULT '[]',
  funcao TEXT,
  quantidade_funcionarios INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gantt_atividades (
  id TEXT PRIMARY KEY,
  scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES gantt_atividades(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  equipes_alocadas TEXT[] DEFAULT '{}',
  cor TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  percentual_concluido NUMERIC NOT NULL DEFAULT 0,
  predecessoras JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS paradas (
  id TEXT PRIMARY KEY,
  scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  UNIQUE(scenario_id, data)
);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE paradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON scenarios;
CREATE POLICY "Allow all for authenticated" ON scenarios FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON equipes;
CREATE POLICY "Allow all for authenticated" ON equipes FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON gantt_atividades;
CREATE POLICY "Allow all for authenticated" ON gantt_atividades FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON paradas;
CREATE POLICY "Allow all for authenticated" ON paradas FOR ALL USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON scenarios TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gantt_atividades TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON paradas TO anon, authenticated;

ALTER TABLE gantt_atividades ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES gantt_atividades(id) ON DELETE CASCADE;
ALTER TABLE gantt_atividades ADD COLUMN IF NOT EXISTS percentual_concluido NUMERIC NOT NULL DEFAULT 0;

-- ============ 3. eap-mesclado-em-migration.sql ============
-- Ao mesclar itens na EAP, mantém os itens de origem (em vez de apagar) —
-- ficam inativos e guardados como referência visual abaixo do item resultante.

ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS mesclado_em UUID REFERENCES public.setores(id);
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS mesclado_em UUID REFERENCES public.areas(id);
ALTER TABLE public.subareas ADD COLUMN IF NOT EXISTS mesclado_em UUID REFERENCES public.subareas(id);
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS mesclado_em UUID REFERENCES public.atividades(id);

-- ============ 4. modulos-plataforma-migration.sql ============
-- Módulos por empresa (pacote contratado): Engenharia / Segurança. Substitui
-- o hack "libera pra empresa piloto" por um sistema de verdade, onde o Dono
-- da Plataforma decide quais módulos cada empresa tem.

-- 4.1 Catálogo de módulos
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

-- 4.2 Quais módulos cada empresa tem contratado
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

-- 4.3 Função auxiliar: minha empresa tem esse módulo ativo?
CREATE OR REPLACE FUNCTION public.user_tem_modulo(chave text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizacao_modulos
    WHERE organizacao_id = public.user_organizacao() AND modulo_key = chave AND ativo
  );
$$;

-- 4.4 Backfill: empresa piloto mantém acesso a tudo que já tinha
INSERT INTO public.organizacao_modulos (organizacao_id, modulo_key, ativo)
SELECT o.id, m.key, true
FROM public.organizacoes o
CROSS JOIN public.modulos m
WHERE o.is_piloto
ON CONFLICT (organizacao_id, modulo_key) DO NOTHING;

-- 4.5 Troca o gate das tabelas ainda não isoladas: piloto -> módulo
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
