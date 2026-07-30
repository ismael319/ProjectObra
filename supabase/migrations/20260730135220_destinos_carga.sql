-- ============================================================
-- MÓDULO "Qualidade" — Concreto
-- 4/4: destinos_carga
-- ============================================================

-- Onde o concreto de uma carga foi aplicado. Na maioria dos casos é 1 destino
-- por carga, mas uma carga pode ser dividida entre vários setores/áreas —
-- por isso é tabela própria (N destinos por carga) em vez de colunas soltas
-- em cargas_concreto. setor_id/area_id/subarea_id apontam pros mesmos
-- catálogos globais (setores/areas/subareas) já usados no Apontamento de MO.
CREATE TABLE IF NOT EXISTS public.destinos_carga (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalizado de cargas_concreto pra RLS não precisar de join a cada linha
  -- (mesmo padrão de documentos_funcionario.organizacao_id).
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  carga_id uuid NOT NULL REFERENCES public.cargas_concreto(id) ON DELETE CASCADE,
  setor_id uuid NOT NULL REFERENCES public.setores(id),
  area_id uuid REFERENCES public.areas(id),
  subarea_id uuid REFERENCES public.subareas(id),
  quantidade_m3_aplicada numeric NOT NULL,
  observacao text
);

CREATE INDEX IF NOT EXISTS destinos_carga_organizacao_idx ON public.destinos_carga (organizacao_id);
CREATE INDEX IF NOT EXISTS destinos_carga_carga_idx ON public.destinos_carga (carga_id);

ALTER TABLE public.destinos_carga ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.destinos_carga TO authenticated;

DROP POLICY IF EXISTS "Leitura destinos_carga da propria empresa" ON public.destinos_carga;
CREATE POLICY "Leitura destinos_carga da propria empresa" ON public.destinos_carga
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia destinos_carga" ON public.destinos_carga;
CREATE POLICY "Edicao gerencia destinos_carga" ON public.destinos_carga
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));
