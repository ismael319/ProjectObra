-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Rastreabilidade de Concreto (Carga <-> Corpos de Prova <-> Ensaios) —
-- fundação: código único por carga, catálogo de laboratórios, corpos de
-- prova moldados por carga e os resultados de ruptura lançados para cada
-- um. Segue o mesmo padrão das demais tabelas do módulo Concreto (RLS por
-- organizacao_id, já usando user_papel_modulo('qualidade') desde a
-- criação — ver 20260807010000_papel-por-modulo-concreto-migration.sql).
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. organizacoes.sigla ============
-- Prefixo legível do código de rastreabilidade (ex.: "728 FS CNP"). Opcional
-- — organização sem sigla cadastrada gera código sem prefixo (CC-AAAA-NNNN
-- em vez de [SIGLA]-CC-AAAA-NNNN), pra não travar quem ainda não preencheu.

ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS sigla text;

-- ============ 2. laboratorios ============
-- Catálogo simples por organização, mesmo padrão de fornecedores_concreto.

CREATE TABLE IF NOT EXISTS public.laboratorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cnpj text,
  contato text,
  telefone text,
  email text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS laboratorios_organizacao_idx ON public.laboratorios (organizacao_id);

ALTER TABLE public.laboratorios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laboratorios TO authenticated;

DROP POLICY IF EXISTS "Leitura laboratorios da propria empresa" ON public.laboratorios;
CREATE POLICY "Leitura laboratorios da propria empresa" ON public.laboratorios
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia laboratorios" ON public.laboratorios;
CREATE POLICY "Edicao gerencia laboratorios" ON public.laboratorios
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- ============ 3. organizacoes_config_ensaio ============
-- Uma linha por organização: idades padrão de ensaio, quantidade de CPs
-- moldados por carga e qual idade é a "de referência" pra conformidade
-- (normalmente 28 dias). Serve só de SUGESTÃO ao lançar uma carga — o
-- usuário pode ajustar por carga (ver corpos_prova, criado com os valores
-- copiados no momento do lançamento, não uma FK viva pra esta tabela).

CREATE TABLE IF NOT EXISTS public.organizacoes_config_ensaio (
  organizacao_id uuid PRIMARY KEY REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  idades_padrao_dias int[] NOT NULL DEFAULT '{7,28,63}',
  qtd_cps_padrao int NOT NULL DEFAULT 6,
  idade_referencia_dias int NOT NULL DEFAULT 28,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizacoes_config_ensaio ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.organizacoes_config_ensaio TO authenticated;

DROP POLICY IF EXISTS "Leitura config_ensaio da propria empresa" ON public.organizacoes_config_ensaio;
CREATE POLICY "Leitura config_ensaio da propria empresa" ON public.organizacoes_config_ensaio
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Edicao gerencia config_ensaio" ON public.organizacoes_config_ensaio;
CREATE POLICY "Edicao gerencia config_ensaio" ON public.organizacoes_config_ensaio
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- ============ 4. Código de rastreabilidade por carga ============
-- Formato "[SIGLA]-CC-AAAA-NNNN" (NNNN sequencial por organização+ano, com
-- padding de 4 dígitos). O ano vem da DATA da carga (não de "hoje"), pra
-- lançamentos retroativos/importação de histórico caírem no ano correto.
--
-- codigo_rastreabilidade_contadores existe só de apoio pro gerador — não
-- tem tela própria, ninguém edita direto (sem policy de escrita pra
-- authenticated; só a função SECURITY DEFINER abaixo mexe nela). Evita a
-- corrida de concorrência de um MAX()+1 ingênuo: o UPSERT com
-- "ultimo_numero = ultimo_numero + 1 RETURNING" é atômico por linha.

CREATE TABLE IF NOT EXISTS public.codigo_rastreabilidade_contadores (
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  ano int NOT NULL,
  ultimo_numero int NOT NULL DEFAULT 0,
  PRIMARY KEY (organizacao_id, ano)
);

ALTER TABLE public.codigo_rastreabilidade_contadores ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.codigo_rastreabilidade_contadores TO service_role;
-- Sem GRANT/policy pra "authenticated": só a função SECURITY DEFINER (dona
-- é quem cria a migration, com privilégio de bypass) mexe nesta tabela.

ALTER TABLE public.cargas_concreto ADD COLUMN IF NOT EXISTS codigo_rastreabilidade text;

CREATE OR REPLACE FUNCTION public.gerar_codigo_rastreabilidade_carga()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ano int := EXTRACT(YEAR FROM NEW.data)::int;
  v_numero int;
  v_sigla text;
BEGIN
  IF NEW.codigo_rastreabilidade IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, ano, ultimo_numero)
  VALUES (NEW.organizacao_id, v_ano, 1)
  ON CONFLICT (organizacao_id, ano)
  DO UPDATE SET ultimo_numero = public.codigo_rastreabilidade_contadores.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_numero;

  SELECT sigla INTO v_sigla FROM public.organizacoes WHERE id = NEW.organizacao_id;

  NEW.codigo_rastreabilidade := COALESCE(NULLIF(trim(v_sigla), '') || '-', '') || 'CC-' || v_ano || '-' || lpad(v_numero::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_codigo_rastreabilidade_carga ON public.cargas_concreto;
CREATE TRIGGER trg_codigo_rastreabilidade_carga
  BEFORE INSERT ON public.cargas_concreto
  FOR EACH ROW EXECUTE FUNCTION public.gerar_codigo_rastreabilidade_carga();

-- Backfill pra cargas já existentes (rodando numa base já em produção) —
-- em ordem cronológica, pra numeração ficar coerente com a ordem real de
-- lançamento. Não roda de novo em cima do que já tem código (idempotente).
DO $$
DECLARE
  r record;
  v_numero int;
  v_sigla text;
  v_ano int;
BEGIN
  FOR r IN
    SELECT id, organizacao_id, data FROM public.cargas_concreto
    WHERE codigo_rastreabilidade IS NULL
    ORDER BY organizacao_id, data, criado_em
  LOOP
    v_ano := EXTRACT(YEAR FROM r.data)::int;
    INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, ano, ultimo_numero)
    VALUES (r.organizacao_id, v_ano, 1)
    ON CONFLICT (organizacao_id, ano)
    DO UPDATE SET ultimo_numero = public.codigo_rastreabilidade_contadores.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_numero;

    SELECT sigla INTO v_sigla FROM public.organizacoes WHERE id = r.organizacao_id;

    UPDATE public.cargas_concreto
    SET codigo_rastreabilidade = COALESCE(NULLIF(trim(v_sigla), '') || '-', '') || 'CC-' || v_ano || '-' || lpad(v_numero::text, 4, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

DO $$
BEGIN
  ALTER TABLE public.cargas_concreto ALTER COLUMN codigo_rastreabilidade SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cargas_concreto_codigo_rastreabilidade_key') THEN
    ALTER TABLE public.cargas_concreto ADD CONSTRAINT cargas_concreto_codigo_rastreabilidade_key UNIQUE (codigo_rastreabilidade);
  END IF;
END $$;

-- ============ 5. corpos_prova ============
-- Um CP moldado por carga, numa idade prevista de ensaio. status vira
-- 'rompido' automaticamente quando um resultado é lançado em
-- ensaios_corpos_prova (ver trigger na seção 6) — nunca setado à mão.

CREATE TABLE IF NOT EXISTS public.corpos_prova (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalizado de cargas_concreto pra RLS não precisar de join a cada
  -- linha (mesmo padrão de destinos_carga.organizacao_id).
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  carga_id uuid NOT NULL REFERENCES public.cargas_concreto(id) ON DELETE CASCADE,
  laboratorio_id uuid REFERENCES public.laboratorios(id),
  numero_lab text,
  peca_concretada text,
  idade_prevista_dias int NOT NULL,
  data_moldagem date NOT NULL,
  data_ruptura_prevista date NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'rompido')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS corpos_prova_organizacao_idx ON public.corpos_prova (organizacao_id);
CREATE INDEX IF NOT EXISTS corpos_prova_carga_idx ON public.corpos_prova (carga_id);
CREATE INDEX IF NOT EXISTS corpos_prova_status_data_ruptura_idx ON public.corpos_prova (status, data_ruptura_prevista);

ALTER TABLE public.corpos_prova ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corpos_prova TO authenticated;

DROP POLICY IF EXISTS "Leitura corpos_prova da propria empresa" ON public.corpos_prova;
CREATE POLICY "Leitura corpos_prova da propria empresa" ON public.corpos_prova
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Insercao corpos_prova" ON public.corpos_prova;
CREATE POLICY "Insercao corpos_prova" ON public.corpos_prova
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') IN ('edicao', 'insercao_pontual')));

DROP POLICY IF EXISTS "Edicao atualiza corpos_prova" ON public.corpos_prova;
CREATE POLICY "Edicao atualiza corpos_prova" ON public.corpos_prova
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

DROP POLICY IF EXISTS "Edicao exclui corpos_prova" ON public.corpos_prova;
CREATE POLICY "Edicao exclui corpos_prova" ON public.corpos_prova
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- ============ 6. ensaios_corpos_prova ============
-- Resultado de ruptura — 1:1 com o corpo de prova (corpo_prova_id UNIQUE).

CREATE TABLE IF NOT EXISTS public.ensaios_corpos_prova (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corpo_prova_id uuid NOT NULL UNIQUE REFERENCES public.corpos_prova(id) ON DELETE CASCADE,
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  data_ruptura_real date NOT NULL,
  resultado_mpa numeric NOT NULL,
  tipo_ruptura text CHECK (tipo_ruptura IN ('A', 'B', 'C', 'D', 'E', 'F')),
  temperatura_concreto numeric,
  slump_aplicacao numeric,
  observacoes text,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ensaios_corpos_prova_organizacao_idx ON public.ensaios_corpos_prova (organizacao_id);

ALTER TABLE public.ensaios_corpos_prova ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ensaios_corpos_prova TO authenticated;

DROP POLICY IF EXISTS "Leitura ensaios_corpos_prova da propria empresa" ON public.ensaios_corpos_prova;
CREATE POLICY "Leitura ensaios_corpos_prova da propria empresa" ON public.ensaios_corpos_prova
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade')));

DROP POLICY IF EXISTS "Insercao ensaios_corpos_prova" ON public.ensaios_corpos_prova;
CREATE POLICY "Insercao ensaios_corpos_prova" ON public.ensaios_corpos_prova
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') IN ('edicao', 'insercao_pontual')));

DROP POLICY IF EXISTS "Edicao atualiza ensaios_corpos_prova" ON public.ensaios_corpos_prova;
CREATE POLICY "Edicao atualiza ensaios_corpos_prova" ON public.ensaios_corpos_prova
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

DROP POLICY IF EXISTS "Edicao exclui ensaios_corpos_prova" ON public.ensaios_corpos_prova;
CREATE POLICY "Edicao exclui ensaios_corpos_prova" ON public.ensaios_corpos_prova
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') = 'edicao'));

-- Lançar (ou remover) um resultado atualiza o status do CP automaticamente
-- — evita o front esquecer de sincronizar os dois em algum fluxo (inclusive
-- a importação em lote).
CREATE OR REPLACE FUNCTION public.atualizar_status_corpo_prova()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.corpos_prova SET status = 'pendente' WHERE id = OLD.corpo_prova_id;
    RETURN OLD;
  ELSE
    UPDATE public.corpos_prova SET status = 'rompido' WHERE id = NEW.corpo_prova_id;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualizar_status_corpo_prova ON public.ensaios_corpos_prova;
CREATE TRIGGER trg_atualizar_status_corpo_prova
  AFTER INSERT OR DELETE ON public.ensaios_corpos_prova
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_status_corpo_prova();

NOTIFY pgrst, 'reload schema';
