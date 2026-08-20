-- ============================================================
-- MIGRAÇÃO: Controle de Entrega de Materiais (Estrutura Metálica e afins)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: execute APÓS papel-por-modulo-fundacao-migration.sql (usa
-- user_papel_modulo()) e acesso-por-obra-versionado.sql (usa user_ve_projeto()
-- e a constraint projetos_id_organizacao_key).
-- ============================================================
-- Digitaliza o controle hoje feito em planilha Excel
-- ("Controle_de_entrega_estrutura_metálica.xlsx"). Entra em SIGA Suprimentos
-- (chave de módulo 'suprimentos', já existente desde o Sienge) — decisão
-- tomada junto com o usuário, não junto dos Alertas Sienge por serem domínios
-- diferentes (aquele lê relatórios importados do ERP; este é lançamento
-- próprio de romaneios).
--
-- Frentes são cadastro NOVO e próprio deste módulo (materiais_frentes) — não
-- reaproveita public.setores/areas (raiz da EAP do módulo Apontamento,
-- domínio diferente: aquilo é atividade/cronograma, isto é lista de peças).
--
-- Quatro tabelas, na ordem em que dependem umas das outras:
--
--   materiais_frentes         frente/área do projeto (Casa de Máquina,
--                              Armazém, Subestação...)
--   materiais_listas_itens    lista de peças planejadas por frente, subida no
--                              início do projeto (marca, descrição, qtd, peso)
--   materiais_romaneios       cabeçalho da remessa — SEM frente_id, porque um
--                              romaneio pode trazer itens de várias frentes
--   materiais_romaneio_itens  item entregue dentro de um romaneio; acumula
--                              contra materiais_listas_itens
--
-- Overdelivery é permitido de propósito (acontece na prática) — nada aqui
-- bloqueia quantidade entregue > planejada, só a view materiais_progresso
-- sinaliza com a flag `excedente` pro front estilizar.
--
-- origem_lancamento só tem 'manual' e 'excel' por enquanto — a importação de
-- romaneio em PDF via IA/visão (Fase 3 do prompt original) foi adiada:
-- inspecionamos o projeto e não existe hoje nenhum fluxo de extração de PDF
-- por IA pra copiar (o "RDO por WhatsApp" citado como referência não tem
-- código correspondente). Quando essa fase for construída, adicionar 'pdf_ia'
-- ao CHECK é migration de uma linha.
--
-- organizacao_id denormalizado em materiais_romaneio_itens (igual a
-- sienge_itens): evita JOIN até materiais_romaneios só pra RLS.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. FRENTES ============

CREATE TABLE IF NOT EXISTS public.materiais_frentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL,
  projeto_id uuid NOT NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiais_frentes_projeto_organizacao_fkey
    FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE,
  CONSTRAINT materiais_frentes_projeto_nome_key UNIQUE (projeto_id, nome)
);

CREATE INDEX IF NOT EXISTS materiais_frentes_projeto_idx ON public.materiais_frentes (projeto_id);

-- ============ 2. LISTA DE PEÇAS PLANEJADAS ============

CREATE TABLE IF NOT EXISTS public.materiais_listas_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL,
  projeto_id uuid NOT NULL,
  frente_id uuid NOT NULL REFERENCES public.materiais_frentes(id) ON DELETE CASCADE,
  marca_conjunto text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  qtd_planejada numeric NOT NULL DEFAULT 0 CHECK (qtd_planejada >= 0),
  peso_unitario_kg numeric NOT NULL DEFAULT 0 CHECK (peso_unitario_kg >= 0),
  peso_total_planejado_kg numeric GENERATED ALWAYS AS (qtd_planejada * peso_unitario_kg) STORED,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiais_listas_itens_projeto_organizacao_fkey
    FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE,
  CONSTRAINT materiais_listas_itens_projeto_frente_marca_key UNIQUE (projeto_id, frente_id, marca_conjunto)
);

CREATE INDEX IF NOT EXISTS materiais_listas_itens_frente_idx ON public.materiais_listas_itens (frente_id);
CREATE INDEX IF NOT EXISTS materiais_listas_itens_projeto_idx ON public.materiais_listas_itens (projeto_id);

-- ============ 3. ROMANEIOS (cabeçalho) ============

CREATE TABLE IF NOT EXISTS public.materiais_romaneios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL,
  projeto_id uuid NOT NULL,
  numero_romaneio text NOT NULL,
  data_chegada date NOT NULL,
  transportadora text,
  observacoes text,
  anexo_path text,
  origem_lancamento text NOT NULL DEFAULT 'manual' CHECK (origem_lancamento IN ('manual', 'excel')),
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiais_romaneios_projeto_organizacao_fkey
    FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS materiais_romaneios_projeto_idx ON public.materiais_romaneios (projeto_id, data_chegada DESC);

-- ============ 4. ROMANEIO ITENS (detalhe) ============

CREATE TABLE IF NOT EXISTS public.materiais_romaneio_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL,
  projeto_id uuid NOT NULL,
  romaneio_id uuid NOT NULL REFERENCES public.materiais_romaneios(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.materiais_listas_itens(id) ON DELETE CASCADE,
  quantidade_entregue numeric NOT NULL CHECK (quantidade_entregue > 0),
  peso_entregue_kg numeric CHECK (peso_entregue_kg IS NULL OR peso_entregue_kg >= 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiais_romaneio_itens_projeto_organizacao_fkey
    FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS materiais_romaneio_itens_romaneio_idx ON public.materiais_romaneio_itens (romaneio_id);
CREATE INDEX IF NOT EXISTS materiais_romaneio_itens_item_idx ON public.materiais_romaneio_itens (item_id);

-- ============ 5. VIEW DE PROGRESSO ============
-- Soma entregas por item; % sem teto em 100% (overdelivery permitido de
-- propósito); flag `excedente` pro front estilizar quando passa de 100%.

CREATE OR REPLACE VIEW public.materiais_progresso AS
SELECT
  li.id AS item_id,
  li.organizacao_id,
  li.projeto_id,
  li.frente_id,
  li.marca_conjunto,
  li.descricao,
  li.qtd_planejada,
  li.peso_unitario_kg,
  li.peso_total_planejado_kg,
  COALESCE(SUM(ri.quantidade_entregue), 0) AS qtd_entregue,
  COALESCE(SUM(ri.peso_entregue_kg), 0) AS peso_entregue_kg,
  CASE WHEN li.qtd_planejada > 0
    THEN COALESCE(SUM(ri.quantidade_entregue), 0) / li.qtd_planejada
    ELSE NULL
  END AS pct_qtd_entregue,
  CASE WHEN li.peso_total_planejado_kg > 0
    THEN COALESCE(SUM(ri.peso_entregue_kg), 0) / li.peso_total_planejado_kg
    ELSE NULL
  END AS pct_peso_entregue,
  (COALESCE(SUM(ri.quantidade_entregue), 0) > li.qtd_planejada) AS excedente
FROM public.materiais_listas_itens li
LEFT JOIN public.materiais_romaneio_itens ri ON ri.item_id = li.id
GROUP BY li.id;

-- ============ 6. RLS + GRANT ============
-- Mesmo padrão do módulo Suprimentos (chave 'suprimentos'): leitura pra quem
-- enxerga o módulo na obra; escrita só pra papel de edição no módulo.

ALTER TABLE public.materiais_frentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_listas_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_romaneios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_romaneio_itens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais_frentes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais_listas_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais_romaneios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais_romaneio_itens TO authenticated;
GRANT SELECT ON public.materiais_progresso TO authenticated;

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'materiais_frentes', 'materiais_listas_itens',
    'materiais_romaneios', 'materiais_romaneio_itens'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Leitura %I da obra" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Escrita %I da obra" ON public.%I', tabela, tabela);

    EXECUTE format($sql$
      CREATE POLICY "Leitura %1$I da obra" ON public.%1$I FOR SELECT TO authenticated
      USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_ve_modulo('suprimentos')))
    $sql$, tabela);

    EXECUTE format($sql$
      CREATE POLICY "Escrita %1$I da obra" ON public.%1$I FOR ALL TO authenticated
      USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('suprimentos') = 'edicao'))
      WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('suprimentos') = 'edicao'))
    $sql$, tabela);
  END LOOP;
END $$;

-- ============ 7. STORAGE: bucket privado materiais-romaneios ============
-- Caminhos: "{organizacao_id}/{romaneio_id}/{arquivo}", mesmo padrão de
-- mapa-setores-plantas (20260813060000) e rdr-fotos (20260803004100).

INSERT INTO storage.buckets (id, name, public)
VALUES ('materiais-romaneios', 'materiais-romaneios', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "materiais-romaneios leitura da organizacao" ON storage.objects;
CREATE POLICY "materiais-romaneios leitura da organizacao"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'materiais-romaneios' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "materiais-romaneios escrita da organizacao" ON storage.objects;
CREATE POLICY "materiais-romaneios escrita da organizacao"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materiais-romaneios' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "materiais-romaneios update da organizacao" ON storage.objects;
CREATE POLICY "materiais-romaneios update da organizacao"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'materiais-romaneios' AND (storage.foldername(name))[1] = public.user_organizacao()::text)
  WITH CHECK (bucket_id = 'materiais-romaneios' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "materiais-romaneios delete da organizacao" ON storage.objects;
CREATE POLICY "materiais-romaneios delete da organizacao"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materiais-romaneios' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

NOTIFY pgrst, 'reload schema';
