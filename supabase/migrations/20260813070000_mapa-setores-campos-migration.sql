-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- REDESENHO dos "dados do card" do Mapa de Setores — substitui o modelo da
-- fundação (20260813060000), que somava várias atividades com peso via motor
-- EVM (buildCurveFromRawPoints). Decisão de produto: cada um dos 4 campos do
-- card (início, término, avanço previsto, avanço concluído) passa a ter FONTE
-- PRÓPRIA e independente — uma atividade específica do cronograma (inclusive
-- tarefas-resumo da EDT, que o MS Project já consolida sozinho) ou uma coluna
-- personalizada. Um marcador passa a apontar para UM cronograma só (antes
-- dava pra misturar vários por peso — simplificado a pedido).
--
-- mapa_setores_vinculos (peso, multi-atividade) não tem mais uso e é apagada
-- — confirmado que nenhum vínculo real chegou a ser criado na fase de teste.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. mapa_setores_vinculos sai de cena ============

DROP TABLE IF EXISTS public.mapa_setores_vinculos;

-- ============ 2. Marcador passa a apontar para UM cronograma ============
-- Nullable: um setor pode existir só com a geometria, configurado depois via
-- "Propriedades do card".

ALTER TABLE public.mapa_setores_marcadores
  ADD COLUMN IF NOT EXISTS cronograma_id uuid REFERENCES public.projeto_cronogramas(id) ON DELETE SET NULL;

-- ============ 3. Vínculo de cada campo do card com sua fonte ============
-- activity_uid (como em mapa_setores_vinculos antes) referencia uma atividade
-- DENTRO do jsonb projeto_cronogramas.dados — sem FK de banco possível, só
-- para cronograma_id (via mapa_setores_marcadores.cronograma_id). Vale tanto
-- para fonte_tipo='atividade' (lê início/término/% direto da atividade,
-- resumo ou folha — MS Project já rola-up os dois campos igual) quanto para
-- 'coluna_personalizada' (mesma atividade, mas lê customFields[custom_field_id]
-- em vez do campo nativo).

CREATE TABLE IF NOT EXISTS public.mapa_setores_campos (
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  marcador_id uuid NOT NULL REFERENCES public.mapa_setores_marcadores(id) ON DELETE CASCADE,
  campo text NOT NULL CHECK (campo IN ('inicio', 'termino', 'avanco_prev', 'avanco_concl')),
  fonte_tipo text NOT NULL CHECK (fonte_tipo IN ('atividade', 'coluna_personalizada')),
  activity_uid integer NOT NULL,
  -- FieldID do MS Project (ex.: "Text1", "Number3") — só quando fonte_tipo é
  -- coluna_personalizada. O nome legível (Alias) vive em
  -- projeto_cronogramas.dados.customFieldDefs, não aqui.
  custom_field_id text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marcador_id, campo),
  CONSTRAINT mapa_setores_campos_custom_field_exige_tipo CHECK (
    (fonte_tipo = 'coluna_personalizada' AND custom_field_id IS NOT NULL)
    OR (fonte_tipo = 'atividade' AND custom_field_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS mapa_setores_campos_marcador_idx ON public.mapa_setores_campos (marcador_id);

-- ============ 4. RLS ============

ALTER TABLE public.mapa_setores_campos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_setores_campos TO authenticated;

DROP POLICY IF EXISTS "Leitura mapa_setores_campos da propria empresa" ON public.mapa_setores_campos;
CREATE POLICY "Leitura mapa_setores_campos da propria empresa" ON public.mapa_setores_campos
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('engenharia'))
  );

DROP POLICY IF EXISTS "Edicao gerencia mapa_setores_campos" ON public.mapa_setores_campos;
CREATE POLICY "Edicao gerencia mapa_setores_campos" ON public.mapa_setores_campos
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

-- ============ 5. REALTIME ============
-- mapa_setores_vinculos saiu sozinha da publicação quando a tabela foi
-- apagada — só falta adicionar a nova.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mapa_setores_campos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mapa_setores_campos;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
