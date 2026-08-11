-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Segmentos: várias fileiras na MESMA grade, com um contador só.
--
-- O caso que quebrou o modelo anterior: numa planta de locação de estacas, elas
-- ficam no PERÍMETRO do galpão — duas fileiras longas no eixo X e fileiras
-- verticais nas laterais. Não é uma malha retangular cheia, é um contorno.
--
-- Até aqui uma grade era uma única malha (offset + passo + colunas × linhas), o
-- que obrigava a criar uma grade por fileira. Só que aí cada fileira vira um
-- contador separado, e são todas a MESMA estaca: quem olha quer "62% das
-- estacas", não quatro percentuais parciais.
--
-- Agora a geometria sai da grade e vai para os segmentos. A grade passa a ser o
-- que ela sempre foi conceitualmente — o item que se mede, com seu catálogo de
-- status, sua quantidade total e seu percentual — e cada segmento é um trecho
-- da malha. Total da grade = soma dos segmentos.
--
-- As colunas de geometria continuam em mapa_grades por compatibilidade, mas
-- deixam de ser lidas: quem manda é mapa_segmentos. Toda grade existente ganha
-- um segmento com a geometria que tinha, e as células apontam para ele — o
-- apontamento já feito é preservado.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. SEGMENTOS ============

CREATE TABLE IF NOT EXISTS public.mapa_segmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.mapa_grades(id) ON DELETE CASCADE,
  -- Rótulo livre pra quem calibra se achar ("Fileira norte", "Lateral leste").
  nome text,
  offset_x numeric NOT NULL,
  offset_y numeric NOT NULL,
  largura_celula numeric NOT NULL CHECK (largura_celula > 0),
  altura_celula numeric NOT NULL CHECK (altura_celula > 0),
  passo_x numeric NOT NULL CHECK (passo_x > 0),
  passo_y numeric NOT NULL CHECK (passo_y > 0),
  colunas integer NOT NULL CHECK (colunas BETWEEN 1 AND 500),
  linhas integer NOT NULL CHECK (linhas BETWEEN 1 AND 500),
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  -- Permite a FK composta em mapa_celulas (célula só usa segmento da própria grade).
  UNIQUE (id, grade_id)
);

CREATE INDEX IF NOT EXISTS mapa_segmentos_grade_idx ON public.mapa_segmentos (grade_id, ordem);

-- ============ 2. BACKFILL: cada grade vira um segmento ============

INSERT INTO public.mapa_segmentos (
  organizacao_id, grade_id, nome, offset_x, offset_y,
  largura_celula, altura_celula, passo_x, passo_y, colunas, linhas, ordem
)
SELECT g.organizacao_id, g.id, NULL, g.offset_x, g.offset_y,
       g.largura_celula, g.altura_celula,
       COALESCE(g.passo_x, g.largura_celula), COALESCE(g.passo_y, g.altura_celula),
       g.colunas, g.linhas, 0
  FROM public.mapa_grades g
 WHERE NOT EXISTS (SELECT 1 FROM public.mapa_segmentos s WHERE s.grade_id = g.id);

-- ============ 3. CÉLULAS PASSAM A APONTAR PARA O SEGMENTO ============

ALTER TABLE public.mapa_celulas
  ADD COLUMN IF NOT EXISTS segmento_id uuid;

-- Cada célula existente pertence ao (único) segmento da grade dela.
UPDATE public.mapa_celulas c
   SET segmento_id = s.id
  FROM public.mapa_segmentos s
 WHERE s.grade_id = c.grade_id
   AND c.segmento_id IS NULL;

-- Célula órfã (grade sem segmento) não deveria existir depois do backfill, mas
-- se existir some aqui — senão o NOT NULL abaixo falha e a migration trava.
DELETE FROM public.mapa_celulas WHERE segmento_id IS NULL;

ALTER TABLE public.mapa_celulas ALTER COLUMN segmento_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mapa_celulas_segmento_da_mesma_grade') THEN
    ALTER TABLE public.mapa_celulas
      ADD CONSTRAINT mapa_celulas_segmento_da_mesma_grade
      FOREIGN KEY (segmento_id, grade_id)
      REFERENCES public.mapa_segmentos (id, grade_id) ON DELETE CASCADE;
  END IF;
END $$;

-- A unicidade passa a ser por segmento: linha 0/coluna 0 existe em CADA fileira.
ALTER TABLE public.mapa_celulas DROP CONSTRAINT IF EXISTS mapa_celulas_grade_id_linha_coluna_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mapa_celulas_segmento_linha_coluna_key') THEN
    ALTER TABLE public.mapa_celulas
      ADD CONSTRAINT mapa_celulas_segmento_linha_coluna_key UNIQUE (segmento_id, linha, coluna);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mapa_celulas_segmento_idx ON public.mapa_celulas (segmento_id);

-- ============ 4. EXIBIÇÃO DA PLANTA ============
-- Planta de AutoCAD vem cheia de cor (vermelho, ciano, magenta) e a malha
-- colorida por cima some no meio. Em cinza ou esmaecida, o apontamento fica
-- legível. É só exibição — o arquivo original não é alterado.

ALTER TABLE public.mapa_plantas
  ADD COLUMN IF NOT EXISTS filtro_visual text NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mapa_plantas_filtro_visual_check') THEN
    ALTER TABLE public.mapa_plantas
      ADD CONSTRAINT mapa_plantas_filtro_visual_check
      CHECK (filtro_visual IN ('normal', 'cinza', 'suave', 'cinza-suave'));
  END IF;
END $$;

-- ============ 5. RLS DOS SEGMENTOS ============

ALTER TABLE public.mapa_segmentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_segmentos TO authenticated;

DROP POLICY IF EXISTS "Leitura mapa_segmentos da propria empresa" ON public.mapa_segmentos;
CREATE POLICY "Leitura mapa_segmentos da propria empresa" ON public.mapa_segmentos
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia'))
  );

DROP POLICY IF EXISTS "Edicao gerencia mapa_segmentos" ON public.mapa_segmentos;
CREATE POLICY "Edicao gerencia mapa_segmentos" ON public.mapa_segmentos
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
  );

NOTIFY pgrst, 'reload schema';
