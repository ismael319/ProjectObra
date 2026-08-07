-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- DESACOPLA o Lançamento de Concreto dos catálogos GLOBAIS do Apontamento
-- (setores/areas/subareas). Desde 20260730135220_destinos_carga.sql, o
-- destino de uma carga apontava pros mesmos setores/áreas usados no
-- apontamento de distribuição de efetivo — na teoria correto, mas, com o
-- projeto em andamento, acabaram entrando setores/áreas com nomes errados no
-- catálogo compartilhado. Esta migration dá ao Concreto catálogos PRÓPRIOS,
-- por organização, no mesmo padrão de fornecedores_concreto/tracos_concreto/
-- etapas_concreto (ver 20260806010000_etapas-concreto-migration.sql):
--
--   1. cria `setores_concreto` e `areas_concreto` (catálogo por organização);
--   2. adiciona destinos_carga.setor_concreto_id / area_concreto_id;
--   3. copia os setores/áreas atuais do Apontamento pro catálogo novo (pra
--      manter todas as opções existentes) e RELIGA os lançamentos já feitos;
--   4. as colunas antigas (setor_id/area_id/subarea_id) são mantidas só pra
--      leitura histórica — não são mais usadas por lançamentos novos;
--   5. `seed_setores_areas_concreto_padrao(org)` permite copiar do
--      Apontamento sob demanda (botão "Copiar do Apontamento" no Cadastro).
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. Tabelas setores_concreto / areas_concreto ============

CREATE TABLE IF NOT EXISTS public.setores_concreto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS setores_concreto_organizacao_idx ON public.setores_concreto (organizacao_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'setores_concreto_organizacao_id_nome_key'
  ) THEN
    ALTER TABLE public.setores_concreto
      ADD CONSTRAINT setores_concreto_organizacao_id_nome_key UNIQUE (organizacao_id, nome);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.areas_concreto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  setor_concreto_id uuid NOT NULL REFERENCES public.setores_concreto(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS areas_concreto_organizacao_idx ON public.areas_concreto (organizacao_id);
CREATE INDEX IF NOT EXISTS areas_concreto_setor_idx ON public.areas_concreto (setor_concreto_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'areas_concreto_org_setor_nome_key'
  ) THEN
    ALTER TABLE public.areas_concreto
      ADD CONSTRAINT areas_concreto_org_setor_nome_key UNIQUE (organizacao_id, setor_concreto_id, nome);
  END IF;
END $$;

-- ============ 2. RLS (mesmo padrão de etapas_concreto) ============

ALTER TABLE public.setores_concreto ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.setores_concreto TO authenticated;

DROP POLICY IF EXISTS "Leitura setores_concreto da propria empresa" ON public.setores_concreto;
CREATE POLICY "Leitura setores_concreto da propria empresa" ON public.setores_concreto
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia setores_concreto" ON public.setores_concreto;
CREATE POLICY "Edicao gerencia setores_concreto" ON public.setores_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

ALTER TABLE public.areas_concreto ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas_concreto TO authenticated;

DROP POLICY IF EXISTS "Leitura areas_concreto da propria empresa" ON public.areas_concreto;
CREATE POLICY "Leitura areas_concreto da propria empresa" ON public.areas_concreto
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia areas_concreto" ON public.areas_concreto;
CREATE POLICY "Edicao gerencia areas_concreto" ON public.areas_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- ============ 3. destinos_carga ganha as colunas do catálogo novo ============
-- setor_id deixa de ser NOT NULL: lançamentos novos só preenchem as colunas
-- _concreto; as antigas ficam para consulta do que já foi lançado.

ALTER TABLE public.destinos_carga
  ADD COLUMN IF NOT EXISTS setor_concreto_id uuid REFERENCES public.setores_concreto(id);

ALTER TABLE public.destinos_carga
  ADD COLUMN IF NOT EXISTS area_concreto_id uuid REFERENCES public.areas_concreto(id);

ALTER TABLE public.destinos_carga ALTER COLUMN setor_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS destinos_carga_setor_concreto_idx ON public.destinos_carga (setor_concreto_id);
CREATE INDEX IF NOT EXISTS destinos_carga_area_concreto_idx ON public.destinos_carga (area_concreto_id);

-- ============ 4. Copia o catálogo atual do Apontamento e religa o histórico ============
-- Copia TODOS os setores/áreas globais do Apontamento pro catálogo do Concreto
-- de cada organização (mantém "todas as opções existentes") e, depois, religa
-- cada destino já lançado casando setor/área antigos pelo nome com o catálogo
-- novo — o Concreto passa a não depender mais de setores/areas/subareas.

DO $$
DECLARE
  org public.organizacoes%ROWTYPE;
BEGIN
  FOR org IN SELECT * FROM public.organizacoes LOOP
    INSERT INTO public.setores_concreto (organizacao_id, nome)
    SELECT org.id, s.nome FROM public.setores s
    ON CONFLICT (organizacao_id, nome) DO NOTHING;

    INSERT INTO public.areas_concreto (organizacao_id, setor_concreto_id, nome)
    SELECT org.id, sc.id, a.nome
    FROM public.areas a
    JOIN public.setores s ON s.id = a.setor_id
    JOIN public.setores_concreto sc ON sc.organizacao_id = org.id AND sc.nome = s.nome
    ON CONFLICT (organizacao_id, setor_concreto_id, nome) DO NOTHING;
  END LOOP;
END $$;

-- Religação com Setor + Área (o caso comum: o destino tem os dois).
UPDATE public.destinos_carga dc
SET setor_concreto_id = sub.sc_id,
    area_concreto_id = sub.ac_id
FROM (
  SELECT DISTINCT ON (d.id)
    d.id AS d_id,
    sc.id AS sc_id,
    ac.id AS ac_id
  FROM public.destinos_carga d
  JOIN public.setores s ON s.id = d.setor_id
  JOIN public.areas a ON a.id = d.area_id
  JOIN public.setores_concreto sc ON sc.organizacao_id = d.organizacao_id AND sc.nome = s.nome
  JOIN public.areas_concreto ac ON ac.organizacao_id = d.organizacao_id AND ac.setor_concreto_id = sc.id AND ac.nome = a.nome
  WHERE d.area_concreto_id IS NULL AND d.setor_concreto_id IS NULL
) sub
WHERE dc.id = sub.d_id;

-- Religação de destinos que só têm Setor (área em branco).
UPDATE public.destinos_carga dc
SET setor_concreto_id = sub.sc_id
FROM (
  SELECT DISTINCT ON (d.id)
    d.id AS d_id,
    sc.id AS sc_id
  FROM public.destinos_carga d
  JOIN public.setores s ON s.id = d.setor_id
  JOIN public.setores_concreto sc ON sc.organizacao_id = d.organizacao_id AND sc.nome = s.nome
  WHERE d.area_id IS NULL AND d.setor_concreto_id IS NULL
) sub
WHERE dc.id = sub.d_id;

-- ============ 5. RPC pra copiar do Apontamento sob demanda ============
-- Mesmo espírito de seed_etapas_concreto_padrao: chamada pelo botão "Copiar
-- do Apontamento" no Cadastro > Setores do Concreto. Idempotente (ON CONFLICT
-- DO NOTHING) — não duplica nem sobrescreve edições já feitas.

CREATE OR REPLACE FUNCTION public.seed_setores_areas_concreto_padrao(p_organizacao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.setores_concreto (organizacao_id, nome)
  SELECT p_organizacao_id, s.nome FROM public.setores s
  ON CONFLICT (organizacao_id, nome) DO NOTHING;

  INSERT INTO public.areas_concreto (organizacao_id, setor_concreto_id, nome)
  SELECT p_organizacao_id, sc.id, a.nome
  FROM public.areas a
  JOIN public.setores s ON s.id = a.setor_id
  JOIN public.setores_concreto sc ON sc.organizacao_id = p_organizacao_id AND sc.nome = s.nome
  ON CONFLICT (organizacao_id, setor_concreto_id, nome) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_setores_areas_concreto_padrao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
