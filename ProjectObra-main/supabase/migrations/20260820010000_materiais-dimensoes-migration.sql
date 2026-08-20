-- ============================================================
-- MIGRAÇÃO: Coluna "Dimensões" nos itens de materiais
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: execute APÓS materiais-entrega-fundacao-migration.sql
-- ============================================================
-- O arquivo real de lista de conjuntos (planilha do fornecedor/projetista)
-- traz uma coluna "DIMENSÕES (mm)" (ex.: "24 x 70 x 7640") junto de marca e
-- descrição, que a fundação do módulo não previa. Texto livre — mesma
-- convenção de "descricao", sem parsing/validação de formato.
-- ============================================================

ALTER TABLE public.materiais_listas_itens
  ADD COLUMN IF NOT EXISTS dimensoes text;

CREATE OR REPLACE VIEW public.materiais_progresso AS
SELECT
  li.id AS item_id,
  li.organizacao_id,
  li.projeto_id,
  li.frente_id,
  li.marca_conjunto,
  li.descricao,
  li.dimensoes,
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

NOTIFY pgrst, 'reload schema';
