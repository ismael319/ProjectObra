-- Aplicar após a publicação do frontend que envia organizacao_id + projeto_id.
-- Converte as tabelas legadas em dados obrigatoriamente pertencentes a uma obra.

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['empresas','liderancas','setores','areas','subareas','atividades','apontamentos_diarios','dias_trabalho','eap_modelos','mapa_chuvas','app_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organizacao_id SET NOT NULL', tabela);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN projeto_id SET NOT NULL', tabela);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = tabela || '_projeto_organizacao_fkey'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE', tabela, tabela || '_projeto_organizacao_fkey');
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS preencher_escopo_legado_transicao ON public.%I', tabela);
  END LOOP;
END $$;

-- Chaves antes globais passam a permitir o mesmo dia/configuração em obras distintas.
ALTER TABLE public.dias_trabalho DROP CONSTRAINT IF EXISTS dias_trabalho_pkey;
ALTER TABLE public.dias_trabalho ADD PRIMARY KEY (organizacao_id, projeto_id, data);
ALTER TABLE public.mapa_chuvas DROP CONSTRAINT IF EXISTS mapa_chuvas_pkey;
ALTER TABLE public.mapa_chuvas ADD PRIMARY KEY (organizacao_id, projeto_id, data);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (organizacao_id, projeto_id, key);

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_nome_key;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_projeto_nome_key UNIQUE (projeto_id, nome);
ALTER TABLE public.liderancas DROP CONSTRAINT IF EXISTS liderancas_nome_tipo_key;
ALTER TABLE public.liderancas ADD CONSTRAINT liderancas_projeto_nome_tipo_key UNIQUE (projeto_id, nome, tipo);
ALTER TABLE public.setores DROP CONSTRAINT IF EXISTS setores_nome_key;
ALTER TABLE public.setores ADD CONSTRAINT setores_projeto_nome_key UNIQUE (projeto_id, nome);
ALTER TABLE public.atividades DROP CONSTRAINT IF EXISTS atividades_nome_key;
ALTER TABLE public.atividades ADD CONSTRAINT atividades_projeto_nome_key UNIQUE (projeto_id, nome);

-- Impede referências cruzadas entre obras mesmo quando o UUID de outro
-- registro for enviado diretamente pela API.
CREATE OR REPLACE FUNCTION public.validar_relacoes_legado_obra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_organizacao_id uuid;
  v_projeto_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'liderancas' AND NEW.empresa_id IS NOT NULL THEN
    SELECT organizacao_id, projeto_id INTO v_organizacao_id, v_projeto_id FROM public.empresas WHERE id = NEW.empresa_id;
  ELSIF TG_TABLE_NAME = 'areas' THEN
    SELECT organizacao_id, projeto_id INTO v_organizacao_id, v_projeto_id FROM public.setores WHERE id = NEW.setor_id;
  ELSIF TG_TABLE_NAME = 'subareas' THEN
    SELECT organizacao_id, projeto_id INTO v_organizacao_id, v_projeto_id FROM public.areas WHERE id = NEW.area_id;
  ELSIF TG_TABLE_NAME = 'atividades' AND NEW.subarea_id IS NOT NULL THEN
    SELECT organizacao_id, projeto_id INTO v_organizacao_id, v_projeto_id FROM public.subareas WHERE id = NEW.subarea_id;
  ELSIF TG_TABLE_NAME = 'apontamentos_diarios' THEN
    IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = NEW.empresa_id AND organizacao_id = NEW.organizacao_id AND projeto_id = NEW.projeto_id)
       OR NOT EXISTS (SELECT 1 FROM public.liderancas WHERE id = NEW.lideranca_id AND organizacao_id = NEW.organizacao_id AND projeto_id = NEW.projeto_id)
       OR NOT EXISTS (SELECT 1 FROM public.setores WHERE id = NEW.setor_id AND organizacao_id = NEW.organizacao_id AND projeto_id = NEW.projeto_id)
       OR NOT EXISTS (SELECT 1 FROM public.atividades WHERE id = NEW.atividade_id AND organizacao_id = NEW.organizacao_id AND projeto_id = NEW.projeto_id)
       OR (NEW.area_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.areas WHERE id = NEW.area_id AND organizacao_id = NEW.organizacao_id AND projeto_id = NEW.projeto_id))
       OR (NEW.subarea_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.subareas WHERE id = NEW.subarea_id AND organizacao_id = NEW.organizacao_id AND projeto_id = NEW.projeto_id)) THEN
      RAISE EXCEPTION 'Referência de apontamento não pertence à mesma obra' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
  ELSE
    RETURN NEW;
  END IF;

  IF NOT FOUND OR v_organizacao_id IS DISTINCT FROM NEW.organizacao_id OR v_projeto_id IS DISTINCT FROM NEW.projeto_id THEN
    RAISE EXCEPTION 'Referência não pertence à mesma obra' USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['liderancas','areas','subareas','atividades','apontamentos_diarios']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS validar_relacoes_legado_obra ON public.%I', tabela);
    EXECUTE format('CREATE TRIGGER validar_relacoes_legado_obra BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validar_relacoes_legado_obra()', tabela);
  END LOOP;
END $$;

DO $$
DECLARE
  tabela text;
  politica text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['empresas','liderancas','setores','areas','subareas','atividades','apontamentos_diarios','dias_trabalho','eap_modelos','mapa_chuvas','app_settings']
  LOOP
    FOR politica IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tabela
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', politica, tabela);
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS "Acesso público %I" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.%I', tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Leitura %I" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Insert %I" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Update %I" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Delete %I" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Edicao gerencia %I" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Leitura %I da obra" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Escrita %I da obra" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Restringe pelo modulo engenharia" ON public.%I', tabela);

    EXECUTE format($sql$
      CREATE POLICY "Leitura %1$I da obra" ON public.%1$I FOR SELECT TO authenticated
      USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_ve_modulo('engenharia')))
    $sql$, tabela);
  END LOOP;
END $$;

-- Catálogos, jornadas, modelos, chuvas e configuração: somente edição.
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['empresas','liderancas','setores','areas','subareas','atividades','dias_trabalho','eap_modelos','mapa_chuvas','app_settings']
  LOOP
    EXECUTE format($sql$
      CREATE POLICY "Escrita %1$I da obra" ON public.%1$I FOR ALL TO authenticated
      USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('engenharia') = 'edicao'))
      WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('engenharia') = 'edicao'))
    $sql$, tabela);
  END LOOP;
END $$;

-- Campo pode criar apontamento da obra permitida; alterações e exclusões são edição.
CREATE POLICY "Insercao apontamentos da obra" ON public.apontamentos_diarios FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_ve_modulo('engenharia') AND public.user_papel_modulo('engenharia') IN ('edicao','insercao_pontual')));
CREATE POLICY "Edicao apontamentos da obra" ON public.apontamentos_diarios FOR UPDATE TO authenticated
USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('engenharia') = 'edicao'))
WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('engenharia') = 'edicao'));
CREATE POLICY "Exclusao apontamentos da obra" ON public.apontamentos_diarios FOR DELETE TO authenticated
USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('engenharia') = 'edicao'));

DROP FUNCTION IF EXISTS public.preencher_escopo_legado_transicao();
NOTIFY pgrst, 'reload schema';
