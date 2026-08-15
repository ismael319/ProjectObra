-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- FUNDAÇÃO do módulo "Mapa de Setores" (Gestão à Vista).
--
-- Setor = um marcador (ponto ou área) posicionado livremente sobre uma planta
-- baixa, com um card de avanço solto ligado a ele por uma linha (protótipo já
-- validado). Diferente do Gestão à Vista existente (mapa_plantas/mapa_grades):
-- lá é uma malha de células calibrada; aqui é geometria livre em % — por isso
-- este módulo nasce com tabelas próprias, sem reaproveitar mapa_grades/
-- mapa_celulas (decisão registrada na Fase 1 do planejamento).
--
-- Nomeado "mapa_setores_*" (não "setores") de propósito: `public.setores` já
-- existe e é a raiz do catálogo Setor→Área→Subárea→Atividade do módulo
-- Apontamento — um domínio completamente diferente (cadastro de EAP, não
-- geometria sobre planta). Reusar o nome "setores" aqui colidiria e confundiria
-- os dois conceitos.
--
-- Os números de avanço (Av. Prev / Av. Concl) NÃO são colunas nesta migration:
-- são calculados no cliente (src/lib/mapa-setores/progresso.ts), reaproveitando
-- o mesmo motor da Curva S (buildCurveFromRawPoints em curve-utils.ts) sobre o
-- subconjunto de atividades vinculado a cada marcador via
-- mapa_setores_vinculos. Não há view/function SQL pra isso — o motor de EVM é
-- TypeScript, e replicá-lo em PL/pgSQL duplicaria a lógica que a Curva S já
-- mantém.
--
-- Três tabelas, na ordem em que dependem umas das outras:
--
--   mapa_setores_plantas     a planta de fundo (imagem + recorte), um por
--                            planta carregada — mesmo padrão de mapa_plantas
--   mapa_setores_marcadores  o setor em si: ponto OU área, posição livre em %,
--                            e a posição do card (também livre, ligado por
--                            linha no cliente)
--   mapa_setores_vinculos    quais atividades do cronograma (WBS) alimentam o
--                            avanço de cada marcador, com peso. activity_uid
--                            referencia uma atividade DENTRO do jsonb
--                            projeto_cronogramas.dados — não há FK de banco
--                            possível pra essa coluna (não é uma linha de
--                            tabela), só pra cronograma_id. Integridade desse
--                            vínculo depende do MS Project manter o mesmo UID
--                            entre reimportações; o app detecta e avisa no
--                            próprio card quando um activity_uid vinculado não
--                            é mais encontrado no cronograma atual.
--
-- Além disso: duas colunas novas em `projetos` pro card de "Avanço do dia" do
-- Resumo Geral. Sem tabela de snapshot nova — a cada mudança de cronograma que
-- recalcula projetos.percentual_avanco (project-store.tsx), o valor ANTERIOR é
-- guardado em avanco_real_anterior antes de ser sobrescrito. Mesmo mecanismo já
-- usado por percentual_avanco/percentual_planejado: nasce no navegador (o
-- servidor não decodifica o `dados` comprimido do cronograma) e é persistido
-- como número simples — por isso não há trigger SQL aqui, a captura acontece
-- no código React (project-store.tsx).
--
-- Escopo: organizacao_id em todas as tabelas (RLS por public.user_organizacao()),
-- projeto_id em plantas (um mapa pertence a uma obra).
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. PLANTAS ============
-- arquivo_path, não arquivo_url: bucket privado, leitura via blob URL baixado
-- em runtime (não signed URL — export com html2canvas quebra com URL de outra
-- origem, e signed URL expira em 1h). Mesmo padrão de mapa_plantas.

CREATE TABLE IF NOT EXISTS public.mapa_setores_plantas (
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

CREATE INDEX IF NOT EXISTS mapa_setores_plantas_projeto_idx
  ON public.mapa_setores_plantas (organizacao_id, projeto_id);

-- ============ 2. MARCADORES (setores) ============
-- Geometria livre em % da planta (0-100), diferente da malha de mapa_grades.
-- O CHECK garante que só os campos do tipo escolhido são preenchidos — evita
-- registro "meio ponto, meio área".

CREATE TABLE IF NOT EXISTS public.mapa_setores_marcadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  planta_id uuid NOT NULL REFERENCES public.mapa_setores_plantas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('ponto', 'area')),
  pos_x_pct numeric CHECK (pos_x_pct BETWEEN 0 AND 100),
  pos_y_pct numeric CHECK (pos_y_pct BETWEEN 0 AND 100),
  area_x_pct numeric CHECK (area_x_pct BETWEEN 0 AND 100),
  area_y_pct numeric CHECK (area_y_pct BETWEEN 0 AND 100),
  area_w_pct numeric CHECK (area_w_pct > 0 AND area_w_pct <= 100),
  area_h_pct numeric CHECK (area_h_pct > 0 AND area_h_pct <= 100),
  card_x_pct numeric NOT NULL CHECK (card_x_pct BETWEEN 0 AND 100),
  card_y_pct numeric NOT NULL CHECK (card_y_pct BETWEEN 0 AND 100),
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mapa_setores_marcadores_geometria_do_tipo CHECK (
    (tipo = 'ponto' AND pos_x_pct IS NOT NULL AND pos_y_pct IS NOT NULL
     AND area_x_pct IS NULL AND area_y_pct IS NULL AND area_w_pct IS NULL AND area_h_pct IS NULL)
    OR
    (tipo = 'area' AND area_x_pct IS NOT NULL AND area_y_pct IS NOT NULL
     AND area_w_pct IS NOT NULL AND area_h_pct IS NOT NULL
     AND pos_x_pct IS NULL AND pos_y_pct IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS mapa_setores_marcadores_planta_idx
  ON public.mapa_setores_marcadores (planta_id);

-- ============ 3. VÍNCULOS COM ATIVIDADES DO CRONOGRAMA ============
-- activity_uid = WBSActivity.uid do cronograma (xml-parser.ts), vive dentro do
-- jsonb projeto_cronogramas.dados — por isso só cronograma_id tem FK real.
-- peso pondera atividades que só parcialmente pertencem a este setor (ex.:
-- uma atividade que atende dois galpões).

CREATE TABLE IF NOT EXISTS public.mapa_setores_vinculos (
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  marcador_id uuid NOT NULL REFERENCES public.mapa_setores_marcadores(id) ON DELETE CASCADE,
  cronograma_id uuid NOT NULL REFERENCES public.projeto_cronogramas(id) ON DELETE CASCADE,
  activity_uid integer NOT NULL,
  peso numeric NOT NULL DEFAULT 1 CHECK (peso > 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marcador_id, cronograma_id, activity_uid)
);

CREATE INDEX IF NOT EXISTS mapa_setores_vinculos_cronograma_idx
  ON public.mapa_setores_vinculos (cronograma_id);

-- ============ 4. AVANÇO DO DIA (colunas em projetos) ============

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS avanco_real_anterior numeric,
  ADD COLUMN IF NOT EXISTS avanco_capturado_em timestamptz;

COMMENT ON COLUMN public.projetos.avanco_real_anterior IS
  'Snapshot de percentual_avanco capturado no navegador, um instante antes da ÚLTIMA vez que percentual_avanco foi recalculado (troca/adição/remoção de cronograma). Usado só para "Avanço do dia" no Mapa de Setores — sem tabela de histórico.';

-- ============ 5. RLS ============
-- Leitura: qualquer um da empresa que enxergue o módulo engenharia.
-- Escrita: papel Edição no módulo engenharia.

ALTER TABLE public.mapa_setores_plantas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapa_setores_marcadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapa_setores_vinculos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_setores_plantas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_setores_marcadores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_setores_vinculos TO authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mapa_setores_plantas', 'mapa_setores_marcadores', 'mapa_setores_vinculos']
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

-- ============ 6. STORAGE: bucket privado mapa-setores-plantas ============
-- Caminhos: "{organizacao_id}/{planta_id}/{arquivo}", mesmo padrão de
-- mapa-plantas (20260811000000) e rdr-fotos (20260803004100).

INSERT INTO storage.buckets (id, name, public)
VALUES ('mapa-setores-plantas', 'mapa-setores-plantas', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mapa-setores-plantas leitura da organizacao" ON storage.objects;
CREATE POLICY "mapa-setores-plantas leitura da organizacao"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mapa-setores-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "mapa-setores-plantas escrita da organizacao" ON storage.objects;
CREATE POLICY "mapa-setores-plantas escrita da organizacao"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mapa-setores-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "mapa-setores-plantas update da organizacao" ON storage.objects;
CREATE POLICY "mapa-setores-plantas update da organizacao"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'mapa-setores-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text)
  WITH CHECK (bucket_id = 'mapa-setores-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "mapa-setores-plantas delete da organizacao" ON storage.objects;
CREATE POLICY "mapa-setores-plantas delete da organizacao"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'mapa-setores-plantas' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

-- ============ 7. REALTIME ============
-- Habilita mudança-ao-vivo nas 3 tabelas novas + projeto_cronogramas (pra o
-- mapa recalcular sozinho quando alguém reimporta o cronograma ou edita um
-- marcador, sem precisar de F5 — RLS de cada tabela já filtra o que cada
-- assinante recebe). Guardado contra "already member of publication" porque
-- projeto_cronogramas é usada por outros módulos e pode já estar habilitada.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mapa_setores_plantas', 'mapa_setores_marcadores', 'mapa_setores_vinculos', 'projeto_cronogramas']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
