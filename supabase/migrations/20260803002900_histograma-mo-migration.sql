-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Módulo "Histograma Planejado x Real": cadastro de cargos por projeto,
-- baselines versionadas (LB0, LB1, ...) com o planejado mensal por cargo,
-- e o apontamento real semanal (quintas-feiras) usado para comparar com o
-- planejado. Mesmo padrão de RLS multi-tenant já usado no resto do app
-- (org-scoped via projetos.organizacao_id, ver
-- programacao-engenheiros-area-migration.sql).

-- ============ 1. CARGOS ============
-- Catálogo de cargos/itens do histograma, por projeto (ex.: pedreiro,
-- servente, carpinteiro, ou até equipamentos).

CREATE TABLE IF NOT EXISTS public.histograma_cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  area text NOT NULL,
  tipo text NOT NULL DEFAULT 'MO' CHECK (tipo IN ('MO', 'EQUIPAMENTO')),
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_histograma_cargos_projeto ON public.histograma_cargos(projeto_id);

-- ============ 2. BASELINES ============
-- Revisões do planejado (LB0, LB1, ...). Só uma pode estar ativa por
-- projeto — o trigger abaixo desativa as demais automaticamente.

CREATE TABLE IF NOT EXISTS public.histograma_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  versao text NOT NULL,
  descricao text,
  motivo text,
  data_aprovacao date,
  aprovado_por text,
  ativa boolean NOT NULL DEFAULT false,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projeto_id, versao)
);

CREATE INDEX IF NOT EXISTS idx_histograma_baselines_projeto ON public.histograma_baselines(projeto_id);

CREATE OR REPLACE FUNCTION public.fn_histograma_unica_baseline_ativa()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ativa THEN
    UPDATE public.histograma_baselines
       SET ativa = false
     WHERE projeto_id = NEW.projeto_id
       AND id <> NEW.id
       AND ativa = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_histograma_unica_baseline_ativa ON public.histograma_baselines;
CREATE TRIGGER trg_histograma_unica_baseline_ativa
BEFORE INSERT OR UPDATE ON public.histograma_baselines
FOR EACH ROW EXECUTE FUNCTION public.fn_histograma_unica_baseline_ativa();

-- ============ 3. PLANEJADO (por baseline, cargo e mês) ============

CREATE TABLE IF NOT EXISTS public.histograma_planejado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES public.histograma_baselines(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.histograma_cargos(id) ON DELETE CASCADE,
  mes date NOT NULL,
  qtd_planejada numeric NOT NULL DEFAULT 0,
  UNIQUE (baseline_id, cargo_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_histograma_planejado_baseline ON public.histograma_planejado(baseline_id);

-- ============ 4. REAL SEMANAL (apontamento, quintas-feiras) ============

CREATE TABLE IF NOT EXISTS public.histograma_real_semanal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.histograma_cargos(id) ON DELETE CASCADE,
  semana_ref date NOT NULL,
  qtd_real numeric NOT NULL DEFAULT 0,
  registrado_por uuid REFERENCES auth.users(id),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cargo_id, semana_ref)
);

CREATE INDEX IF NOT EXISTS idx_histograma_real_semanal_projeto ON public.histograma_real_semanal(projeto_id);

-- ============ 5. RLS ============
-- Leitura: qualquer papel da organização dona do projeto (edicao,
-- visualizacao, insercao_pontual) — mesmo padrão de leitura ampla usado em
-- programacao_engenheiros_area/apontamentos_diarios.
--
-- Escrita de cargos/baselines/planejado (o "plano"): só Edição, igual ao
-- resto do módulo de Engenharia.
--
-- Escrita do real semanal (o "apontamento"): Edição e Inserção Pontual
-- podem INSERT e UPDATE (decisão confirmada com o usuário — diferente do
-- padrão padrão de apontamentos_diarios, que é INSERT-only pra Inserção
-- Pontual, porque aqui a pessoa também precisa corrigir um valor já
-- lançado). DELETE continua só Edição.

ALTER TABLE public.histograma_cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.histograma_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.histograma_planejado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.histograma_real_semanal ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.histograma_cargos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.histograma_baselines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.histograma_planejado TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.histograma_real_semanal TO authenticated;

-- 5.1 histograma_cargos
DROP POLICY IF EXISTS "Leitura histograma_cargos da organizacao" ON public.histograma_cargos;
CREATE POLICY "Leitura histograma_cargos da organizacao" ON public.histograma_cargos
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  ));

DROP POLICY IF EXISTS "Edicao gerencia histograma_cargos" ON public.histograma_cargos;
CREATE POLICY "Edicao gerencia histograma_cargos" ON public.histograma_cargos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  )))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  )));

-- 5.2 histograma_baselines
DROP POLICY IF EXISTS "Leitura histograma_baselines da organizacao" ON public.histograma_baselines;
CREATE POLICY "Leitura histograma_baselines da organizacao" ON public.histograma_baselines
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  ));

DROP POLICY IF EXISTS "Edicao gerencia histograma_baselines" ON public.histograma_baselines;
CREATE POLICY "Edicao gerencia histograma_baselines" ON public.histograma_baselines
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  )))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  )));

-- 5.3 histograma_planejado (projeto_id vem via baseline_id)
DROP POLICY IF EXISTS "Leitura histograma_planejado da organizacao" ON public.histograma_planejado;
CREATE POLICY "Leitura histograma_planejado da organizacao" ON public.histograma_planejado
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.histograma_baselines b
    JOIN public.projetos p ON p.id = b.projeto_id
    WHERE b.id = baseline_id AND p.organizacao_id = public.user_organizacao()
  ));

DROP POLICY IF EXISTS "Edicao gerencia histograma_planejado" ON public.histograma_planejado;
CREATE POLICY "Edicao gerencia histograma_planejado" ON public.histograma_planejado
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND EXISTS (
    SELECT 1 FROM public.histograma_baselines b
    JOIN public.projetos p ON p.id = b.projeto_id
    WHERE b.id = baseline_id AND p.organizacao_id = public.user_organizacao()
  )))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND EXISTS (
    SELECT 1 FROM public.histograma_baselines b
    JOIN public.projetos p ON p.id = b.projeto_id
    WHERE b.id = baseline_id AND p.organizacao_id = public.user_organizacao()
  )));

-- 5.4 histograma_real_semanal
DROP POLICY IF EXISTS "Leitura histograma_real_semanal da organizacao" ON public.histograma_real_semanal;
CREATE POLICY "Leitura histograma_real_semanal da organizacao" ON public.histograma_real_semanal
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  ));

DROP POLICY IF EXISTS "Insert histograma_real_semanal" ON public.histograma_real_semanal;
CREATE POLICY "Insert histograma_real_semanal" ON public.histograma_real_semanal
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (public.user_papel() IN ('edicao', 'insercao_pontual') AND EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  )));

DROP POLICY IF EXISTS "Update histograma_real_semanal" ON public.histograma_real_semanal;
CREATE POLICY "Update histograma_real_semanal" ON public.histograma_real_semanal
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() IN ('edicao', 'insercao_pontual') AND EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  )))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() IN ('edicao', 'insercao_pontual') AND EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  )));

DROP POLICY IF EXISTS "Delete histograma_real_semanal" ON public.histograma_real_semanal;
CREATE POLICY "Delete histograma_real_semanal" ON public.histograma_real_semanal
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND EXISTS (
    SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao()
  )));

-- Depois de rodar, lembrar de:
NOTIFY pgrst, 'reload schema';
