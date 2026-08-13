-- Preparação não destrutiva para separar os módulos legados por obra.
--
-- O banco atual tem uma única organização piloto e uma única obra (FS CNP).
-- Todos os dados existentes são vinculados a ela. As colunas começam
-- anuláveis para manter clientes PWA antigos operando até o frontend novo ser
-- publicado; a migration posterior torna o escopo obrigatório e ativa a RLS.

DO $$
DECLARE
  v_organizacao_id uuid;
  v_projeto_id uuid;
  v_projetos integer;
  tabela text;
BEGIN
  SELECT id INTO v_organizacao_id
  FROM public.organizacoes
  WHERE is_piloto
  LIMIT 1;

  IF v_organizacao_id IS NULL THEN
    RAISE EXCEPTION 'Organização piloto não encontrada';
  END IF;

  SELECT count(*) INTO v_projetos
  FROM public.projetos
  WHERE organizacao_id = v_organizacao_id;

  IF v_projetos <> 1 THEN
    RAISE EXCEPTION 'A preparação exige exatamente uma obra na organização piloto; encontradas %', v_projetos;
  END IF;

  SELECT id INTO v_projeto_id
  FROM public.projetos
  WHERE organizacao_id = v_organizacao_id;

  FOREACH tabela IN ARRAY ARRAY[
    'empresas', 'liderancas', 'setores', 'areas', 'subareas', 'atividades',
    'apontamentos_diarios', 'dias_trabalho', 'eap_modelos', 'mapa_chuvas', 'app_settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organizacao_id uuid', tabela);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS projeto_id uuid', tabela);
    EXECUTE format(
      'UPDATE public.%I SET organizacao_id = $1, projeto_id = $2 WHERE organizacao_id IS NULL OR projeto_id IS NULL',
      tabela
    ) USING v_organizacao_id, v_projeto_id;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (organizacao_id, projeto_id)',
      tabela || '_organizacao_projeto_idx', tabela
    );
  END LOOP;
END $$;

-- Durante a transição há uma única obra; clientes antigos que ainda não
-- enviam escopo continuam funcionando. Assim que houver mais de uma obra, a
-- ausência de escopo vira erro em vez de gravar dados no lugar errado.
CREATE OR REPLACE FUNCTION public.preencher_escopo_legado_transicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_organizacao_id uuid;
  v_projeto_id uuid;
  v_projetos integer;
BEGIN
  IF NEW.organizacao_id IS NOT NULL AND NEW.projeto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_organizacao_id
  FROM public.organizacoes
  WHERE is_piloto
  LIMIT 1;

  SELECT count(*) INTO v_projetos
  FROM public.projetos
  WHERE organizacao_id = v_organizacao_id;

  IF v_projetos <> 1 THEN
    RAISE EXCEPTION 'Organização e obra são obrigatórias para este registro';
  END IF;

  SELECT id INTO v_projeto_id
  FROM public.projetos
  WHERE organizacao_id = v_organizacao_id;

  NEW.organizacao_id := COALESCE(NEW.organizacao_id, v_organizacao_id);
  NEW.projeto_id := COALESCE(NEW.projeto_id, v_projeto_id);
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'empresas', 'liderancas', 'setores', 'areas', 'subareas', 'atividades',
    'apontamentos_diarios', 'dias_trabalho', 'eap_modelos', 'mapa_chuvas', 'app_settings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS preencher_escopo_legado_transicao ON public.%I', tabela);
    EXECUTE format(
      'CREATE TRIGGER preencher_escopo_legado_transicao BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.preencher_escopo_legado_transicao()',
      tabela
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
