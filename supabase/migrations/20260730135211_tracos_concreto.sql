-- ============================================================
-- MÓDULO "Qualidade" — Concreto
-- 2/4: tracos_concreto
-- ============================================================

-- Cada traço é uma "receita" de concreto: resistência (fck) + consumo de
-- insumos por m³ + preço padrão por m³. Sem controle de estoque nesta fase —
-- os consumos aqui são só referência pra registrar o que foi usado em cada
-- carga, não pra baixar de um saldo.
CREATE TABLE IF NOT EXISTS public.tracos_concreto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  fck_mpa numeric NOT NULL,
  consumo_cimento_kg_m3 numeric,
  consumo_brita00_kg_m3 numeric,
  consumo_brita01_kg_m3 numeric,
  consumo_po_brita_kg_m3 numeric,
  consumo_areia_kg_m3 numeric,
  consumo_agua_l_m3 numeric,
  consumo_aditivo1_l_m3 numeric,
  consumo_aditivo2_l_m3 numeric,
  preco_unitario_m3 numeric,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracos_concreto_organizacao_idx ON public.tracos_concreto (organizacao_id);

ALTER TABLE public.tracos_concreto ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracos_concreto TO authenticated;

DROP POLICY IF EXISTS "Leitura tracos_concreto da propria empresa" ON public.tracos_concreto;
CREATE POLICY "Leitura tracos_concreto da propria empresa" ON public.tracos_concreto
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia tracos_concreto" ON public.tracos_concreto;
CREATE POLICY "Edicao gerencia tracos_concreto" ON public.tracos_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));
