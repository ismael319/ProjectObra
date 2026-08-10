-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- FUNDAÇÃO da dupla validação de lançamentos. Hoje um lançamento entra no
-- banco e já vale — não há conferência por segunda pessoa, e as colunas
-- `validado`/`validado_em` que existem em apontamentos_diarios e
-- cargas_concreto guardam só QUANDO foi validado, nunca POR QUEM.
--
-- O desenho aqui é de DUAS PERSPECTIVAS, não de duas pessoas quaisquer: cada
-- registro precisa de uma confirmação por ETAPA, e cada etapa é conferida por
-- um grupo diferente (no apontamento, o RH confere a quantidade e o
-- Planejamento confere os locais; no concreto, o engenheiro confere as cargas
-- da área dele e a Qualidade confere os dados técnicos). Quem confirma o quê
-- é configurável em tela, inclusive o recorte por área.
--
-- Decisão central: confirmar é um INSERT em validacao_confirmacoes, NUNCA um
-- UPDATE no registro de origem. Isso resolve de graça o problema de que a RLS
-- das tabelas de negócio só libera UPDATE pra papel 'edicao' — quem confirma
-- não precisa (nem deve) poder editar o registro que está conferindo.
--
-- A tabela de confirmações é polimórfica (entidade + registro_id, sem FK real)
-- porque a tela "Minhas validações" precisa varrer os três fluxos numa query
-- só, e porque fluxos futuros entram sem migration nova. O preço é não ter
-- integridade referencial: a limpeza de confirmações órfãs vem junto com cada
-- fluxo, nas migrations das fases seguintes.
--
-- Esta migration é ADITIVA e não muda o comportamento de nenhum fluxo. Ela só
-- cria a estrutura e a tela de configuração. A propagação do status pra dentro
-- de cargas_concreto / apontamentos_diarios / programação vem nas fases
-- seguintes, quando cada tabela ganhar sua coluna derivada.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. ETAPAS DE VALIDAÇÃO (configuráveis por organização) ============

CREATE TABLE IF NOT EXISTS public.validacao_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  entidade text NOT NULL CHECK (entidade IN ('apontamento', 'carga_concreto', 'programacao')),
  chave text NOT NULL,
  nome text NOT NULL,
  descricao text,
  ordem int NOT NULL DEFAULT 0,
  -- true = o responsável só confirma registros das áreas atribuídas a ele.
  -- false = confirma qualquer registro da entidade dentro da organização.
  escopo_area boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, entidade, chave)
);

CREATE INDEX IF NOT EXISTS validacao_etapas_organizacao_idx
  ON public.validacao_etapas (organizacao_id, entidade);

ALTER TABLE public.validacao_etapas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validacao_etapas TO authenticated;

-- Leitura liberada pra toda a organização: qualquer usuário precisa saber
-- quais etapas existem pra a tela de validação montar as colunas de status.
DROP POLICY IF EXISTS "Leitura validacao_etapas da propria empresa" ON public.validacao_etapas;
CREATE POLICY "Leitura validacao_etapas da propria empresa" ON public.validacao_etapas
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

-- Escrita: configurar quem valida o quê é administração do sistema.
DROP POLICY IF EXISTS "Edicao gerencia validacao_etapas" ON public.validacao_etapas;
CREATE POLICY "Edicao gerencia validacao_etapas" ON public.validacao_etapas
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('sistema') = 'edicao')
  )
  WITH CHECK (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('sistema') = 'edicao')
  );

-- ============ 2. RESPONSÁVEIS POR ETAPA ============
-- Área nula = responsável por TODAS as áreas daquela etapa. Os dois universos
-- de área do projeto são separados de propósito: `areas` vale pro apontamento
-- e pra programação, `areas_concreto` vale pra qualidade. Uma linha nunca
-- preenche as duas.

CREATE TABLE IF NOT EXISTS public.validacao_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  etapa_id uuid NOT NULL REFERENCES public.validacao_etapas(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.areas(id) ON DELETE CASCADE,
  area_concreto_id uuid REFERENCES public.areas_concreto(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validacao_resp_area_de_um_universo_so') THEN
    ALTER TABLE public.validacao_responsaveis
      ADD CONSTRAINT validacao_resp_area_de_um_universo_so
      CHECK (area_id IS NULL OR area_concreto_id IS NULL);
  END IF;
END $$;

-- UNIQUE comum não serve: no Postgres dois NULL são distintos entre si, então
-- (etapa, usuario, NULL) poderia ser inserido infinitas vezes. Índices
-- parciais cobrem os três casos sem depender de NULLS NOT DISTINCT.
CREATE UNIQUE INDEX IF NOT EXISTS validacao_resp_todas_areas_idx
  ON public.validacao_responsaveis (etapa_id, usuario_id)
  WHERE area_id IS NULL AND area_concreto_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS validacao_resp_area_idx
  ON public.validacao_responsaveis (etapa_id, usuario_id, area_id)
  WHERE area_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS validacao_resp_area_concreto_idx
  ON public.validacao_responsaveis (etapa_id, usuario_id, area_concreto_id)
  WHERE area_concreto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS validacao_resp_usuario_idx
  ON public.validacao_responsaveis (usuario_id);

ALTER TABLE public.validacao_responsaveis ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validacao_responsaveis TO authenticated;

DROP POLICY IF EXISTS "Leitura validacao_responsaveis da propria empresa" ON public.validacao_responsaveis;
CREATE POLICY "Leitura validacao_responsaveis da propria empresa" ON public.validacao_responsaveis
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Edicao gerencia validacao_responsaveis" ON public.validacao_responsaveis;
CREATE POLICY "Edicao gerencia validacao_responsaveis" ON public.validacao_responsaveis
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('sistema') = 'edicao')
  )
  WITH CHECK (
    public.is_super_admin()
    OR (organizacao_id = public.user_organizacao() AND public.user_papel_modulo('sistema') = 'edicao')
  );

-- ============ 3. CONFIRMAÇÕES ============
-- Uma decisão por etapa, por registro (UNIQUE). Trocar de ideia = apagar a
-- própria confirmação e refazer — não há UPDATE, o que mantém a trilha de
-- auditoria honesta.
--
-- organizacao_id tem DEFAULT porque apontamentos_diarios não tem essa coluna:
-- o vínculo com a empresa vem de quem confirmou, não do registro conferido.

CREATE TABLE IF NOT EXISTS public.validacao_confirmacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL DEFAULT public.user_organizacao() REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  entidade text NOT NULL CHECK (entidade IN ('apontamento', 'carga_concreto', 'programacao')),
  registro_id uuid NOT NULL,
  etapa_chave text NOT NULL,
  usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  decisao text NOT NULL CHECK (decisao IN ('confirmado', 'rejeitado')),
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entidade, registro_id, etapa_chave)
);

-- Rejeitar sem dizer o motivo deixa quem lançou sem saber o que corrigir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validacao_conf_rejeicao_tem_motivo') THEN
    ALTER TABLE public.validacao_confirmacoes
      ADD CONSTRAINT validacao_conf_rejeicao_tem_motivo
      CHECK (decisao <> 'rejeitado' OR nullif(trim(observacao), '') IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS validacao_conf_registro_idx
  ON public.validacao_confirmacoes (entidade, registro_id);
CREATE INDEX IF NOT EXISTS validacao_conf_usuario_idx
  ON public.validacao_confirmacoes (usuario_id, criado_em DESC);

ALTER TABLE public.validacao_confirmacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.validacao_confirmacoes TO authenticated;

-- ============ 4. FUNÇÃO: o usuário logado pode confirmar esta etapa? ============
-- STABLE + SECURITY DEFINER porque precisa enxergar validacao_responsaveis e a
-- área do registro por cima da RLS de quem está confirmando.

CREATE OR REPLACE FUNCTION public.pode_validar(
  p_entidade text,
  p_etapa_chave text,
  p_registro_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_etapa public.validacao_etapas%ROWTYPE;
BEGIN
  SELECT * INTO v_etapa
  FROM public.validacao_etapas
  WHERE organizacao_id = public.user_organizacao()
    AND entidade = p_entidade
    AND chave = p_etapa_chave
    AND ativo;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Etapa sem recorte de área: basta estar na lista de responsáveis.
  IF NOT v_etapa.escopo_area THEN
    RETURN EXISTS (
      SELECT 1 FROM public.validacao_responsaveis r
      WHERE r.etapa_id = v_etapa.id AND r.usuario_id = auth.uid()
    );
  END IF;

  -- Com recorte de área, quem tem área nula responde por todas.
  IF EXISTS (
    SELECT 1 FROM public.validacao_responsaveis r
    WHERE r.etapa_id = v_etapa.id AND r.usuario_id = auth.uid()
      AND r.area_id IS NULL AND r.area_concreto_id IS NULL
  ) THEN
    RETURN true;
  END IF;

  IF p_entidade = 'apontamento' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.apontamentos_diarios a
      JOIN public.validacao_responsaveis r ON r.area_id = a.area_id
      WHERE a.id = p_registro_id
        AND r.etapa_id = v_etapa.id
        AND r.usuario_id = auth.uid()
    );
  END IF;

  -- Uma carga pode ser aplicada em várias áreas (destinos_carga tem N linhas
  -- por carga): responder por qualquer uma delas basta pra poder conferir.
  IF p_entidade = 'carga_concreto' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.destinos_carga d
      JOIN public.validacao_responsaveis r ON r.area_concreto_id = d.area_concreto_id
      WHERE d.carga_id = p_registro_id
        AND r.etapa_id = v_etapa.id
        AND r.usuario_id = auth.uid()
    );
  END IF;

  -- 'programacao' é recortada por engenheiro, não por área — o vínculo
  -- usuário↔engenheiro entra na fase da programação.
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pode_validar(text, text, uuid) TO authenticated;

-- Só quem responde pela etapa consegue inserir a confirmação. A checagem vive
-- na RLS (e não só na tela) porque a tela é vitrine — a RLS é quem barra.
DROP POLICY IF EXISTS "Leitura validacao_confirmacoes da propria empresa" ON public.validacao_confirmacoes;
CREATE POLICY "Leitura validacao_confirmacoes da propria empresa" ON public.validacao_confirmacoes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Responsavel confirma validacao" ON public.validacao_confirmacoes;
CREATE POLICY "Responsavel confirma validacao" ON public.validacao_confirmacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND organizacao_id = public.user_organizacao()
    AND public.pode_validar(entidade, etapa_chave, registro_id)
  );

-- Desfazer só a própria confirmação, nunca a de outra pessoa.
DROP POLICY IF EXISTS "Autor desfaz a propria validacao" ON public.validacao_confirmacoes;
CREATE POLICY "Autor desfaz a propria validacao" ON public.validacao_confirmacoes
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR usuario_id = auth.uid());

-- ============ 5. FUNÇÃO: status consolidado de um registro ============
-- Não escreve em lugar nenhum — só calcula. A propagação pra uma coluna
-- derivada em cada tabela de origem vem nas migrations das fases seguintes,
-- quando essas colunas existirem.
--
-- Regra: qualquer rejeição derruba tudo; todas as etapas ativas confirmadas =
-- aprovado; ao menos uma = parcial; nenhuma = pendente.

CREATE OR REPLACE FUNCTION public.validacao_status(
  p_organizacao_id uuid,
  p_entidade text,
  p_registro_id uuid
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH etapas AS (
    SELECT chave FROM public.validacao_etapas
    WHERE organizacao_id = p_organizacao_id AND entidade = p_entidade AND ativo
  ),
  decisoes AS (
    SELECT c.etapa_chave, c.decisao
    FROM public.validacao_confirmacoes c
    JOIN etapas e ON e.chave = c.etapa_chave
    WHERE c.entidade = p_entidade AND c.registro_id = p_registro_id
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM decisoes WHERE decisao = 'rejeitado') THEN 'rejeitado'
    WHEN (SELECT count(*) FROM etapas) = 0 THEN 'pendente'
    WHEN (SELECT count(*) FROM decisoes WHERE decisao = 'confirmado') >= (SELECT count(*) FROM etapas) THEN 'aprovado'
    WHEN EXISTS (SELECT 1 FROM decisoes) THEN 'parcial'
    ELSE 'pendente'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.validacao_status(uuid, text, uuid) TO authenticated;

-- ============ 6. AUDITORIA (opcional) ============
-- Mesmo padrão de user_profiles: quem confirmou o quê e quando fica registrado
-- em audit_logs sem nenhuma chamada explícita do frontend.
--
-- Condicional de propósito: registrar_audit_log() vem de
-- 20260803001100_audit-logs-migration.sql, que pode não ter sido aplicada
-- neste banco (as migrations deste projeto são rodadas à mão, sem tracking).
-- A trilha de auditoria é um extra — não pode derrubar a fundação inteira por
-- estar ausente. Rodando a migration de audit_logs depois, basta reexecutar
-- esta aqui pra o trigger passar a existir.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'registrar_audit_log'
  ) THEN
    DROP TRIGGER IF EXISTS trg_audit_validacao_confirmacoes ON public.validacao_confirmacoes;
    CREATE TRIGGER trg_audit_validacao_confirmacoes
      AFTER INSERT OR UPDATE OR DELETE ON public.validacao_confirmacoes
      FOR EACH ROW EXECUTE FUNCTION public.registrar_audit_log();
  ELSE
    RAISE NOTICE 'public.registrar_audit_log() não existe — trigger de auditoria não criado. Rode 20260803001100_audit-logs-migration.sql e reexecute esta migration se quiser a trilha.';
  END IF;
END $$;

-- ============ 7. SEED DAS ETAPAS PADRÃO ============
-- Cria as etapas descritas pelo cliente pra toda organização existente, sem
-- responsáveis atribuídos.
--
-- Uma etapa ativa sem responsável trava os registros em 'pendente', e isso é
-- deliberado: a alternativa (ignorar etapas sem responsável no cálculo) faria
-- uma conferência exigida ser PULADA em silêncio quando alguém esquecesse de
-- cadastrar quem confere. Travar é visível e alguém reclama; pular não é. A
-- tela de configuração avisa em amarelo toda etapa ativa sem responsável.

INSERT INTO public.validacao_etapas (organizacao_id, entidade, chave, nome, descricao, ordem, escopo_area)
SELECT o.id, v.entidade, v.chave, v.nome, v.descricao, v.ordem, v.escopo_area
FROM public.organizacoes o
CROSS JOIN (VALUES
  ('apontamento',    'quantidade', 'Conferência do RH',          'Confere a quantidade de pedreiros, serventes, carpinteiros e demais funções.', 1, false),
  ('apontamento',    'locais',     'Conferência do Planejamento','Confere setor, área, subárea e atividade apontados.',                          2, false),
  ('carga_concreto', 'area',       'Conferência da Engenharia',  'O engenheiro confere as cargas aplicadas nas áreas sob responsabilidade dele.', 1, true),
  ('carga_concreto', 'qualidade',  'Conferência da Qualidade',   'Confere traço, fornecedor, perda, nota fiscal e dados de laboratório.',        2, false),
  ('programacao',    'engenheiro', 'Confirmação do Engenheiro',  'O engenheiro confirma a programação da semana dele.',                          1, false),
  ('programacao',    'coordenacao','Confirmação da Coordenação', 'A coordenação confirma o conjunto da programação da semana.',                  2, false)
) AS v(entidade, chave, nome, descricao, ordem, escopo_area)
ON CONFLICT (organizacao_id, entidade, chave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
