-- ============================================================
-- MÓDULO "Qualidade" — Concreto
-- 1/4: fornecedores_concreto
-- Usa is_super_admin(), user_organizacao(), user_papel(), user_ve_modulo()
-- (já existentes — ver modulos-plataforma-migration.sql / modulos-visiveis-migration.sql)
-- ============================================================

-- Registra o módulo 'qualidade' no catálogo de módulos da plataforma
-- (mesmo padrão de 'administracao'/'suprimentos' — aparece sozinho no toggle
-- por empresa em Empresas Clientes assim que existir aqui).
INSERT INTO public.modulos (key, nome, descricao) VALUES
  ('qualidade', 'Qualidade', 'Controle de Concreto: fornecedores, traços, cargas e destinos de aplicação')
ON CONFLICT (key) DO NOTHING;

-- Uma usina interna (tipo 'propria') e, quando ela não supre a demanda,
-- fornecedores externos de concreto (tipo 'externa').
CREATE TABLE IF NOT EXISTS public.fornecedores_concreto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('propria', 'externa')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fornecedores_concreto_organizacao_idx ON public.fornecedores_concreto (organizacao_id);

ALTER TABLE public.fornecedores_concreto ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores_concreto TO authenticated;

DROP POLICY IF EXISTS "Leitura fornecedores_concreto da propria empresa" ON public.fornecedores_concreto;
CREATE POLICY "Leitura fornecedores_concreto da propria empresa" ON public.fornecedores_concreto
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia fornecedores_concreto" ON public.fornecedores_concreto;
CREATE POLICY "Edicao gerencia fornecedores_concreto" ON public.fornecedores_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));
