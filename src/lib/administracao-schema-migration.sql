-- ============================================================
-- MIGRAÇÃO: Módulo "Administração" (Controle de Efetivo / RH de obra)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS modulos-visiveis-migration.sql
-- (usa is_super_admin(), user_organizacao(), user_papel(),
--  user_ve_modulo(), e os catálogos organizacoes/modulos/organizacao_modulos)
-- ============================================================
-- Substitui a planilha CONTROLE_DE_EFETIVO por um módulo próprio:
-- cadastro de funcionários, documentação obrigatória (ASO/NRs), efetivo do
-- dia e histórico de demissões. Inclui também as tabelas de reconciliação
-- Ponto (RH) × Campo (Apontamento de MO) do adendo.
--
-- Só schema — sem RPC/trigger de "efetivo do dia" nem importador ainda
-- (ficam pra próxima etapa, depois de validar este schema em produção).
-- ============================================================

-- ============ 1. CATÁLOGO DE MÓDULOS: registra 'administracao' ============

INSERT INTO public.modulos (key, nome, descricao) VALUES
  ('administracao', 'Administração', 'Controle de Efetivo: cadastro de funcionários, documentação/NRs, efetivo do dia e demissões')
ON CONFLICT (key) DO NOTHING;

-- ============ 2. CATÁLOGOS DO RH (por empresa cliente) ============

CREATE TABLE IF NOT EXISTS public.rh_setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rh_setores_organizacao_idx ON public.rh_setores (organizacao_id);

ALTER TABLE public.rh_setores ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_setores TO authenticated;

DROP POLICY IF EXISTS "Leitura rh_setores da propria empresa" ON public.rh_setores;
CREATE POLICY "Leitura rh_setores da propria empresa" ON public.rh_setores
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia rh_setores" ON public.rh_setores;
CREATE POLICY "Edicao gerencia rh_setores" ON public.rh_setores
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

CREATE TABLE IF NOT EXISTS public.rh_encarregados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rh_encarregados_organizacao_idx ON public.rh_encarregados (organizacao_id);

ALTER TABLE public.rh_encarregados ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_encarregados TO authenticated;

DROP POLICY IF EXISTS "Leitura rh_encarregados da propria empresa" ON public.rh_encarregados;
CREATE POLICY "Leitura rh_encarregados da propria empresa" ON public.rh_encarregados
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia rh_encarregados" ON public.rh_encarregados;
CREATE POLICY "Edicao gerencia rh_encarregados" ON public.rh_encarregados
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- rh_cargos: cada cargo já carrega setor/grupo/categoria padrão, usados pra
-- autopreencher o cadastro do funcionário (o funcionário pode sobrescrever).
-- mapeia_para_role_apontamento é o que permite cruzar Ponto x Campo depois:
-- o Apontamento de Campo só modela pedreiro/servente/carpinteiro
-- nominalmente hoje, então é só nessas 3 que a comparação automática vale.
CREATE TABLE IF NOT EXISTS public.rh_cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  setor_padrao_id uuid REFERENCES public.rh_setores(id) ON DELETE SET NULL,
  grupo text CHECK (grupo IN ('operacional', 'engenharia', 'administrativo')),
  categoria text CHECK (categoria IN ('D', 'I')),
  mapeia_para_role_apontamento text CHECK (mapeia_para_role_apontamento IN ('pedreiro', 'servente', 'carpinteiro')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rh_cargos_organizacao_idx ON public.rh_cargos (organizacao_id);

ALTER TABLE public.rh_cargos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_cargos TO authenticated;

DROP POLICY IF EXISTS "Leitura rh_cargos da propria empresa" ON public.rh_cargos;
CREATE POLICY "Leitura rh_cargos da propria empresa" ON public.rh_cargos
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia rh_cargos" ON public.rh_cargos;
CREATE POLICY "Edicao gerencia rh_cargos" ON public.rh_cargos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- ============ 3. TIPOS DE DOCUMENTO (prazos de ASO/NR, por empresa) ============

CREATE TABLE IF NOT EXISTS public.tipos_documento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  key text NOT NULL,
  nome text NOT NULL,
  validade_dias integer NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, key)
);

ALTER TABLE public.tipos_documento ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_documento TO authenticated;

DROP POLICY IF EXISTS "Leitura tipos_documento da propria empresa" ON public.tipos_documento;
CREATE POLICY "Leitura tipos_documento da propria empresa" ON public.tipos_documento
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia tipos_documento" ON public.tipos_documento;
CREATE POLICY "Edicao gerencia tipos_documento" ON public.tipos_documento
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- Função de seed: popula os 9 tipos padrão pra uma empresa. Não é chamada
-- automaticamente por trigger (preferência explícita de manter lógica visível
-- no app, não "mágica" no banco) — a tela que libera o módulo 'administracao'
-- pra uma empresa (Etapa 3) chama isso uma vez via RPC. Cada empresa edita os
-- prazos depois se precisar; ON CONFLICT DO NOTHING deixa seguro rodar de novo.
CREATE OR REPLACE FUNCTION public.seed_tipos_documento_padrao(p_organizacao_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.tipos_documento (organizacao_id, key, nome, validade_dias) VALUES
    (p_organizacao_id, 'aso', 'ASO', 180),
    (p_organizacao_id, 'nr01', 'NR 01', 360),
    (p_organizacao_id, 'nr06', 'NR 06', 360),
    (p_organizacao_id, 'nr12', 'NR 12', 180),
    (p_organizacao_id, 'nr18', 'NR 18', 360),
    (p_organizacao_id, 'nr20', 'NR 20', 360),
    (p_organizacao_id, 'nr35', 'NR 35', 720),
    (p_organizacao_id, 'malaria', 'Malária', 360),
    (p_organizacao_id, 'integracao_fs', 'Integração FS', 1000)
  ON CONFLICT (organizacao_id, key) DO NOTHING;
$$;
GRANT EXECUTE ON FUNCTION public.seed_tipos_documento_padrao(uuid) TO authenticated;

-- ============ 4. FUNCIONÁRIOS (cadastro ativo) ============

CREATE TABLE IF NOT EXISTS public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  matricula text NOT NULL,
  nome text NOT NULL,
  cpf text,
  cargo_id uuid REFERENCES public.rh_cargos(id) ON DELETE SET NULL,
  setor_id uuid REFERENCES public.rh_setores(id) ON DELETE SET NULL,
  encarregado_id uuid REFERENCES public.rh_encarregados(id) ON DELETE SET NULL,
  indicacao text,
  data_admissao date NOT NULL,
  -- Texto livre por ora (ex.: "728") — não ligado ao conceito de
  -- projetos/cronograma que já existe no app.
  obra_codigo text,
  local text CHECK (local IN ('obra', 'alojamento', 'em_viagem', 'turno_noite')),
  status_bdr text NOT NULL CHECK (status_bdr IN ('liberado_fs', 'integracao', 'aguardando_documentacao')),
  status_fs text NOT NULL CHECK (status_fs IN ('liberado', 'bloqueado')),
  grupo text CHECK (grupo IN ('operacional', 'engenharia', 'administrativo')),
  categoria text CHECK (categoria IN ('D', 'I')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id),
  UNIQUE (organizacao_id, matricula)
);

CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_organizacao_cpf_idx
  ON public.funcionarios (organizacao_id, cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS funcionarios_organizacao_idx ON public.funcionarios (organizacao_id);
CREATE INDEX IF NOT EXISTS funcionarios_setor_idx ON public.funcionarios (setor_id);

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionarios TO authenticated;

DROP POLICY IF EXISTS "Leitura funcionarios da propria empresa" ON public.funcionarios;
CREATE POLICY "Leitura funcionarios da propria empresa" ON public.funcionarios
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia funcionarios" ON public.funcionarios;
CREATE POLICY "Edicao gerencia funcionarios" ON public.funcionarios
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- ============ 5. DEMISSÕES (histórico — cópia dos dados, não FK viva) ============

CREATE TABLE IF NOT EXISTS public.demissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  funcionario_origem_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  matricula text NOT NULL,
  nome text NOT NULL,
  cargo_nome text,
  setor_nome text,
  data_admissao date,
  data_demissao date NOT NULL,
  cpf text,
  indicacao text,
  local text,
  motivo text NOT NULL CHECK (motivo IN ('pedido_demissao', 'justa_causa', 'termino_contrato', 'sem_justa_causa')),
  categoria text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demissoes_organizacao_idx ON public.demissoes (organizacao_id);

ALTER TABLE public.demissoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demissoes TO authenticated;

DROP POLICY IF EXISTS "Leitura demissoes da propria empresa" ON public.demissoes;
CREATE POLICY "Leitura demissoes da propria empresa" ON public.demissoes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia demissoes" ON public.demissoes;
CREATE POLICY "Edicao gerencia demissoes" ON public.demissoes
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- ============ 6. DOCUMENTOS DO FUNCIONÁRIO (ASO/NRs) ============

CREATE TABLE IF NOT EXISTS public.documentos_funcionario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalizado do funcionário pra RLS não precisar de join a cada linha
  -- (mesmo espírito de empresa_nome/lideranca_nome em apontamentos_diarios).
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  tipo_documento_id uuid NOT NULL REFERENCES public.tipos_documento(id),
  data_emissao date NOT NULL,
  -- Cópia do prazo vigente na hora da emissão: mudar o prazo padrão depois
  -- não reescreve vencimentos já calculados.
  validade_dias_no_momento integer NOT NULL,
  data_vencimento date GENERATED ALWAYS AS (data_emissao + validade_dias_no_momento) STORED,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id),
  UNIQUE (funcionario_id, tipo_documento_id)
);

CREATE INDEX IF NOT EXISTS documentos_funcionario_organizacao_idx ON public.documentos_funcionario (organizacao_id);
CREATE INDEX IF NOT EXISTS documentos_funcionario_funcionario_idx ON public.documentos_funcionario (funcionario_id);
CREATE INDEX IF NOT EXISTS documentos_funcionario_vencimento_idx ON public.documentos_funcionario (data_vencimento);

ALTER TABLE public.documentos_funcionario ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos_funcionario TO authenticated;

DROP POLICY IF EXISTS "Leitura documentos_funcionario da propria empresa" ON public.documentos_funcionario;
CREATE POLICY "Leitura documentos_funcionario da propria empresa" ON public.documentos_funcionario
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia documentos_funcionario" ON public.documentos_funcionario;
CREATE POLICY "Edicao gerencia documentos_funcionario" ON public.documentos_funcionario
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- ============ 7. PONTOS IMPORTADOS (bruto, nominal — planilha de Ponto do RH) ============

CREATE TABLE IF NOT EXISTS public.pontos_importados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  matricula text NOT NULL,
  matricula_normalizada text NOT NULL,
  -- Nulo = matrícula do arquivo de ponto não encontrada no cadastro ativo —
  -- é justamente o alerta específico pedido no adendo, não um erro a esconder.
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  data date NOT NULL,
  presente boolean NOT NULL DEFAULT true,
  horario_entrada time,
  horario_saida time,
  arquivo_origem text NOT NULL,
  importado_em timestamptz NOT NULL DEFAULT now(),
  importado_por uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS pontos_importados_organizacao_data_idx ON public.pontos_importados (organizacao_id, data);
CREATE INDEX IF NOT EXISTS pontos_importados_matricula_normalizada_idx ON public.pontos_importados (matricula_normalizada);

ALTER TABLE public.pontos_importados ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pontos_importados TO authenticated;

DROP POLICY IF EXISTS "Leitura pontos_importados da propria empresa" ON public.pontos_importados;
CREATE POLICY "Leitura pontos_importados da propria empresa" ON public.pontos_importados
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia pontos_importados" ON public.pontos_importados;
CREATE POLICY "Edicao gerencia pontos_importados" ON public.pontos_importados
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- ============ 8. EFETIVO PONTO DIÁRIO (agregado, snapshot persistido por importação) ============

CREATE TABLE IF NOT EXISTS public.rh_efetivo_ponto_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  data date NOT NULL,
  setor_id uuid REFERENCES public.rh_setores(id) ON DELETE SET NULL,
  cargo_id uuid REFERENCES public.rh_cargos(id) ON DELETE SET NULL,
  total_presentes integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rh_efetivo_ponto_diario_organizacao_data_idx ON public.rh_efetivo_ponto_diario (organizacao_id, data);

ALTER TABLE public.rh_efetivo_ponto_diario ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_efetivo_ponto_diario TO authenticated;

DROP POLICY IF EXISTS "Leitura rh_efetivo_ponto_diario da propria empresa" ON public.rh_efetivo_ponto_diario;
CREATE POLICY "Leitura rh_efetivo_ponto_diario da propria empresa" ON public.rh_efetivo_ponto_diario
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia rh_efetivo_ponto_diario" ON public.rh_efetivo_ponto_diario;
CREATE POLICY "Edicao gerencia rh_efetivo_ponto_diario" ON public.rh_efetivo_ponto_diario
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));

-- ============================================================
-- Fim do schema. Próximas etapas (não incluídas aqui):
--  - Etapa 2: importador da planilha de Controle de Efetivo (relatório de
--    pré-validação) + importador da planilha de Ponto.
--  - Etapa 3: componentes React (listagem/filtros/formulário de
--    funcionários, painel de documentos/alertas, efetivo do dia com as 3
--    colunas Cadastro/Ponto/Campo, histórico de demissões) + a tela que
--    libera o módulo 'administracao' por empresa chamando
--    seed_tipos_documento_padrao().
-- ============================================================
