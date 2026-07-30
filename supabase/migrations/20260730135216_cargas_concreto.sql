-- ============================================================
-- MÓDULO "Qualidade" — Concreto
-- 3/4: cargas_concreto
-- ============================================================

-- Uma linha por carga/caminhão de concreto recebido, seja da usina própria
-- ou de fornecedor externo. tipo_origem é uma cópia do tipo do fornecedor no
-- momento do recebimento (mesmo espírito de empresa_nome/lideranca_nome em
-- apontamentos_diarios: se o cadastro do fornecedor mudar depois, a carga já
-- registrada mantém a origem como foi na hora).
CREATE TABLE IF NOT EXISTS public.cargas_concreto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  data date NOT NULL,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores_concreto(id),
  tipo_origem text NOT NULL CHECK (tipo_origem IN ('propria', 'externa')),
  numero_carga text,
  traco_id uuid NOT NULL REFERENCES public.tracos_concreto(id),
  quantidade_m3 numeric NOT NULL,
  peso_bruto_teorico_kg numeric,
  peso_balanca_kg numeric,
  perda_kg numeric,
  perda_pct numeric,
  preco_unitario numeric,
  preco_total numeric,
  nota_fiscal text,
  validado boolean NOT NULL DEFAULT false,
  validado_em timestamptz,
  criado_por uuid REFERENCES auth.users(id),
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cargas_concreto_organizacao_data_idx ON public.cargas_concreto (organizacao_id, data);
CREATE INDEX IF NOT EXISTS cargas_concreto_fornecedor_idx ON public.cargas_concreto (fornecedor_id);
CREATE INDEX IF NOT EXISTS cargas_concreto_traco_idx ON public.cargas_concreto (traco_id);

ALTER TABLE public.cargas_concreto ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargas_concreto TO authenticated;

DROP POLICY IF EXISTS "Leitura cargas_concreto da propria empresa" ON public.cargas_concreto;
CREATE POLICY "Leitura cargas_concreto da propria empresa" ON public.cargas_concreto
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Edicao gerencia cargas_concreto" ON public.cargas_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));
