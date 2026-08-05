-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Hoje a "Etapa" do Lançamento de Concreto (DestinoRow.tsx) é resolvida como
-- uma Subárea do catálogo GLOBAL de Apontamento (setores/areas/subareas),
-- escopada por Área — ou seja, o mesmo nome de etapa (ex.: "RADIER") vira uma
-- linha duplicada em subareas por Área, tanto na tela quanto no importador
-- histórico (ResolvedorDeSubareas, chave `${areaId}::${nome}`). Na prática, o
-- cliente confirmou que as etapas de concreto são um catálogo padrão,
-- INDEPENDENTE da Área/Setor.
--
-- Esta migration cria `etapas_concreto` — catálogo próprio, por organização,
-- mesmo padrão de fornecedores_concreto/tracos_concreto — e adiciona
-- destinos_carga.etapa_concreto_id apontando pra ele. A coluna antiga
-- subarea_id NÃO é removida (mantém o histórico já lançado legível), só para
-- de ser usada por novos lançamentos.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. Tabela etapas_concreto ============

CREATE TABLE IF NOT EXISTS public.etapas_concreto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS etapas_concreto_organizacao_idx ON public.etapas_concreto (organizacao_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'etapas_concreto_organizacao_id_nome_key'
  ) THEN
    ALTER TABLE public.etapas_concreto
      ADD CONSTRAINT etapas_concreto_organizacao_id_nome_key UNIQUE (organizacao_id, nome);
  END IF;
END $$;

ALTER TABLE public.etapas_concreto ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etapas_concreto TO authenticated;

DROP POLICY IF EXISTS "Leitura etapas_concreto da propria empresa" ON public.etapas_concreto;
CREATE POLICY "Leitura etapas_concreto da propria empresa" ON public.etapas_concreto
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia etapas_concreto" ON public.etapas_concreto;
CREATE POLICY "Edicao gerencia etapas_concreto" ON public.etapas_concreto
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));

-- ============ 2. destinos_carga ganha etapa_concreto_id ============
-- subarea_id fica intacto pra não perder o vínculo do que já foi lançado.

ALTER TABLE public.destinos_carga
  ADD COLUMN IF NOT EXISTS etapa_concreto_id uuid REFERENCES public.etapas_concreto(id);

CREATE INDEX IF NOT EXISTS destinos_carga_etapa_concreto_idx ON public.destinos_carga (etapa_concreto_id);

-- ============ 3. Seed da lista padrão levantada com o cliente ============
-- Mesmo espírito de seed_cargos_referencia_padrao/seed_tipos_documento_padrao:
-- não roda sozinha, é chamada pela tela "Cadastro > Etapas" (botão "Lista
-- padrão"). Idempotente (ON CONFLICT DO NOTHING) — rodar de novo não duplica
-- nem sobrescreve edições que o usuário já tenha feito numa etapa.

CREATE OR REPLACE FUNCTION public.seed_etapas_concreto_padrao(p_organizacao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.etapas_concreto (organizacao_id, nome)
  SELECT p_organizacao_id, v.nome
  FROM (VALUES
    ('CONTRAPISO'), ('ESTACA FUNDAÇÃO'), ('BLOCO FUNDAÇÃO'), ('VIGA PRÉ MOLDADA'),
    ('PISO PLANO'), ('CALÇADA'), ('PISO INCLINADO'), ('PAREDE'), ('VIGA'), ('RADIER'),
    ('PILAR'), ('LAJE'), ('CANALETA'), ('ESTACA'), ('BLOCO'), ('DIVISÓRIA'), ('CORTINA'),
    ('CAIXA'), ('BASE'), ('MAGRO'), ('GRAUTE PLACA TÚNEL'), ('GRAUTE DOS PILARES'),
    ('DEGRAUS'), ('RADIER CANTEIRO'), ('ALOJAMENTO 01'), ('ALOJAMENTO HOTEL'),
    ('ESTACAS AZ 01 EIXO N'), ('RADIER USINA'), ('PRÉ MOLDADOS')
  ) AS v(nome)
  ON CONFLICT (organizacao_id, nome) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_etapas_concreto_padrao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
