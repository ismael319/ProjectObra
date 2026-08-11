-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- FUNDAÇÃO do módulo Gestão à Vista (mapas de avanço).
--
-- Hoje os auxiliares de campo redesenham a planta no AutoCAD todo dia e pintam
-- à mão as áreas concluídas, mantendo a contagem numa legenda manual
-- ("139/480 un — 29%"). Este módulo troca isso por uma grade de células
-- clicáveis sobre a planta original: calibra-se uma vez, e o apontamento diário
-- vira clicar/arrastar, com o percentual saindo sozinho.
--
-- Cinco tabelas, na ordem em que dependem umas das outras:
--
--   mapa_plantas   a imagem de fundo + o recorte (crop), calibrada UMA vez e
--                  reaproveitada por todas as grades daquela planta
--   mapa_grupos    junta N grades num indicador consolidado (ex.: "Cobertura"
--                  agregando Telhas + Terças); grade sem grupo é isolada
--   mapa_grades    a malha em si (posição, tamanho de célula, colunas, linhas).
--                  Várias grades por planta, cada disciplina com sua
--                  granularidade — dutos são pontuais, piso é por praça
--   mapa_status    catálogo POR GRADE: "telha" usa pendente/concluído e "piso"
--                  usa não iniciado/concretado/curado/desativada. Um enum fixo
--                  não daria conta
--   mapa_celulas   só as células marcadas. Ausência de linha = primeiro status
--                  do catálogo (ordem 0), mesmo comportamento do protótipo, que
--                  só guarda o que foi clicado. Materializar 624 células por
--                  grade × N grades × N plantas inflaria a tabela sem ganho
--
-- Duas métricas convivem em mapa_status, por decisão de projeto:
--   `ordem` >= 1 gera um indicador ACUMULATIVO por etapa — é o que reproduz a
--   legenda do AutoCAD ("76% lançado / 41% liberado", onde tudo que está curado
--   também foi concretado). `peso` gera um número único ponderado, usado no
--   consolidado de grupo e na futura ligação com a Curva S.
--   `conta_no_calculo = false` (a praça hachurada, que não recebe piso) sai do
--   denominador das duas contas.
--
-- Escopo: organizacao_id em TODAS as tabelas (a RLS do projeto inteiro escopa
-- por public.user_organizacao(); sem essa coluna haveria vazamento entre
-- empresas, o mesmo bug que 20260806000000 teve que corrigir no Gantt Livre) e
-- projeto_id nas plantas/grupos, porque um mapa pertence a uma obra.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. PLANTAS DE REFERÊNCIA ============
-- arquivo_path, não arquivo_url: o bucket é privado e a leitura acontece por
-- signed URL de 1h gerada na hora (mesmo padrão de rdr-fotos, ver
-- src/lib/rdr/rdr-db.ts). Guardar uma URL gravaria um link que expira.

CREATE TABLE IF NOT EXISTS public.mapa_plantas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  arquivo_path text NOT NULL,
  largura_natural integer NOT NULL,
  altura_natural integer NOT NULL,
  crop_x numeric NOT NULL DEFAULT 0,
  crop_y numeric NOT NULL DEFAULT 0,
  crop_w numeric NOT NULL,
  crop_h numeric NOT NULL,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mapa_plantas_projeto_idx
  ON public.mapa_plantas (organizacao_id, projeto_id);

-- ============ 2. GRUPOS DE AVANÇO ============

CREATE TABLE IF NOT EXISTS public.mapa_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mapa_grupos_projeto_idx
  ON public.mapa_grupos (organizacao_id, projeto_id);

-- ============ 3. GRADES ============
-- grupo_id NULL = grade isolada, com seu próprio card de %.
-- ON DELETE SET NULL: apagar um grupo não pode levar junto as grades e todo o
-- apontamento delas — elas apenas voltam a ser isoladas.

CREATE TABLE IF NOT EXISTS public.mapa_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  planta_id uuid NOT NULL REFERENCES public.mapa_plantas(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES public.mapa_grupos(id) ON DELETE SET NULL,
  nome text NOT NULL,
  offset_x numeric NOT NULL,
  offset_y numeric NOT NULL,
  largura_celula numeric NOT NULL CHECK (largura_celula > 0),
  altura_celula numeric NOT NULL CHECK (altura_celula > 0),
  colunas integer NOT NULL CHECK (colunas BETWEEN 1 AND 200),
  linhas integer NOT NULL CHECK (linhas BETWEEN 1 AND 200),
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mapa_grades_planta_idx ON public.mapa_grades (planta_id);
CREATE INDEX IF NOT EXISTS mapa_grades_grupo_idx ON public.mapa_grades (grupo_id) WHERE grupo_id IS NOT NULL;

-- ============ 4. CATÁLOGO DE STATUS (por grade) ============
-- O UNIQUE (id, grade_id) parece redundante com a PK, mas é o que permite a FK
-- composta lá em mapa_celulas: sem ele, nada impediria uma célula da grade A
-- apontar para um status da grade B.

CREATE TABLE IF NOT EXISTS public.mapa_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.mapa_grades(id) ON DELETE CASCADE,
  chave text NOT NULL,
  label text NOT NULL,
  cor_hex text NOT NULL,
  peso numeric NOT NULL DEFAULT 1 CHECK (peso >= 0 AND peso <= 1),
  conta_no_calculo boolean NOT NULL DEFAULT true,
  -- 0 = estado inicial (padrão de célula nunca clicada, não gera indicador).
  -- >= 1 gera um card acumulativo: % da etapa N = células com ordem >= N.
  ordem integer NOT NULL DEFAULT 0,
  UNIQUE (grade_id, chave),
  UNIQUE (id, grade_id)
);

CREATE INDEX IF NOT EXISTS mapa_status_grade_idx ON public.mapa_status (grade_id, ordem);

-- ============ 5. CÉLULAS ============

CREATE TABLE IF NOT EXISTS public.mapa_celulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.mapa_grades(id) ON DELETE CASCADE,
  linha integer NOT NULL CHECK (linha >= 0),
  coluna integer NOT NULL CHECK (coluna >= 0),
  status_id uuid NOT NULL,
  atualizado_por uuid REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grade_id, linha, coluna)
);

-- FK composta: garante no banco que a célula só usa status da PRÓPRIA grade.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mapa_celulas_status_da_mesma_grade') THEN
    ALTER TABLE public.mapa_celulas
      ADD CONSTRAINT mapa_celulas_status_da_mesma_grade
      FOREIGN KEY (status_id, grade_id)
      REFERENCES public.mapa_status (id, grade_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mapa_celulas_grade_idx ON public.mapa_celulas (grade_id);

-- ============ 6. RLS ============
-- Leitura: qualquer um da empresa que enxergue o módulo engenharia.
-- Escrita: papel Edição no módulo. Os auxiliares de campo apontam direto (sem
-- conferência prévia), então quem aponta precisa desse papel em engenharia.

ALTER TABLE public.mapa_plantas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapa_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapa_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapa_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapa_celulas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_plantas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_grupos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_status TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_celulas TO authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mapa_plantas', 'mapa_grupos', 'mapa_grades', 'mapa_status', 'mapa_celulas']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Leitura %I da propria empresa" ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY "Leitura %I da propria empresa" ON public.%I
        FOR SELECT TO authenticated
        USING (
          public.is_super_admin()
          OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia'))
        )
    $f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "Edicao gerencia %I" ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY "Edicao gerencia %I" ON public.%I
        FOR ALL TO authenticated
        USING (
          public.is_super_admin()
          OR (organizacao_id = public.user_organizacao()
              AND public.user_ve_modulo('engenharia')
              AND public.user_papel_modulo('engenharia') = 'edicao')
        )
        WITH CHECK (
          public.is_super_admin()
          OR (organizacao_id = public.user_organizacao()
              AND public.user_ve_modulo('engenharia')
              AND public.user_papel_modulo('engenharia') = 'edicao')
        )
    $f$, t, t);
  END LOOP;
END $$;

-- ============ 7. STORAGE: bucket privado mapa-plantas ============
-- Caminhos: "{organizacao_id}/{planta_id}/{arquivo}". As policies escopam pela
-- primeira parte do caminho, igual ao bucket rdr-fotos (20260803004100).

INSERT INTO storage.buckets (id, name, public)
VALUES ('mapa-plantas', 'mapa-plantas', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mapa-plantas leitura da organizacao" ON storage.objects;
CREATE POLICY "mapa-plantas leitura da organizacao"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mapa-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "mapa-plantas escrita da organizacao" ON storage.objects;
CREATE POLICY "mapa-plantas escrita da organizacao"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mapa-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "mapa-plantas update da organizacao" ON storage.objects;
CREATE POLICY "mapa-plantas update da organizacao"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'mapa-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text)
  WITH CHECK (bucket_id = 'mapa-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "mapa-plantas delete da organizacao" ON storage.objects;
CREATE POLICY "mapa-plantas delete da organizacao"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'mapa-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

NOTIFY pgrst, 'reload schema';
