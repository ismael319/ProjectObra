-- FASE 4: Blindar funções SECURITY DEFINER — validação explícita de
-- usuário, organização, obra, módulo e papel; restringir execução pública.

-- ============ 1. FUNÇÕES DE PERFIL: ADICIONAR GUARDS ============

CREATE OR REPLACE FUNCTION public.assinaturas_da_organizacao()
RETURNS TABLE(id uuid, nome text, funcao text, assinatura_estilo text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.id, p.nome, p.funcao, p.assinatura_estilo
  FROM public.user_profiles p
  WHERE p.organizacao_id = public.user_organizacao()
    AND public.user_papel() IS NOT NULL
    AND p.organizacao_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_assinatura(p_assinatura_estilo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão ausente' USING ERRCODE = '28000';
  END IF;
  IF public.user_papel() IS NULL THEN
    RAISE EXCEPTION 'Usuário sem papel ativo' USING ERRCODE = '42501';
  END IF;
  IF p_assinatura_estilo IS NULL
     OR p_assinatura_estilo NOT IN ('dancing', 'vibes', 'caveat') THEN
    RAISE EXCEPTION 'Estilo de assinatura inválido: %', p_assinatura_estilo;
  END IF;

  UPDATE public.user_profiles
  SET assinatura_estilo = p_assinatura_estilo
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_minha_funcao(nova_funcao text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.user_profiles SET funcao = nullif(trim(nova_funcao), '') WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.exportar_meus_dados()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão ausente' USING ERRCODE = '28000';
  END IF;
  IF public.user_papel() IS NULL THEN
    RAISE EXCEPTION 'Usuário sem papel ativo' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'exportado_em', now(),
    'perfil', row_to_json(up.*),
    'organizacao', (SELECT row_to_json(o.*) FROM public.organizacoes o WHERE o.id = up.organizacao_id),
    'modulos', (SELECT jsonb_agg(row_to_json(om.*)) FROM public.organizacao_modulos om WHERE om.organizacao_id = up.organizacao_id)
  ) INTO v_result
  FROM public.user_profiles up
  WHERE up.id = v_user_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.meus_lancamentos_rejeitados()
RETURNS TABLE(entidade text, registro_id uuid, identificacao text, data_referencia date, etapa_nome text, motivo text, rejeitado_por text, rejeitado_em timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH rejeicoes AS (
    SELECT vc.entidade, vc.registro_id, vc.etapa_chave, vc.observacao,
           vc.criado_em, vc.usuario_id, vc.organizacao_id
      FROM public.validacao_confirmacoes vc
     WHERE vc.decisao = 'rejeitado'
  ),
  detalhe AS (
    SELECT r.*, e.nome AS etapa_nome, up.email AS autor_email
      FROM rejeicoes r
      LEFT JOIN public.validacao_etapas e
             ON e.organizacao_id = r.organizacao_id
            AND e.entidade = r.entidade
            AND e.chave = r.etapa_chave
      LEFT JOIN public.user_profiles up ON up.id = r.usuario_id
  ),
  concreto AS (
    SELECT d.entidade, d.registro_id,
           COALESCE(c.codigo_rastreabilidade, 'Carga sem código') AS identificacao,
           c.data AS data_referencia,
           d.etapa_nome, d.observacao, d.autor_email, d.criado_em
      FROM detalhe d
      JOIN public.cargas_concreto c ON c.id = d.registro_id
     WHERE d.entidade = 'carga_concreto'
       AND c.criado_por = auth.uid()
       AND c.validacao_status = 'rejeitado'
  ),
  apontamento AS (
    SELECT d.entidade, d.registro_id,
           a.atividade_nome || ' — ' || a.setor_nome ||
             COALESCE(' / ' || a.area_nome, '') AS identificacao,
           a.data AS data_referencia,
           d.etapa_nome, d.observacao, d.autor_email, d.criado_em
      FROM detalhe d
      JOIN public.apontamentos_diarios a ON a.id = d.registro_id
     WHERE d.entidade = 'apontamento'
       AND a.criado_por = auth.uid()
       AND a.validacao_status = 'rejeitado'
  ),
  programacao AS (
    SELECT d.entidade, d.registro_id,
           'Semana ' || w.iso_week || '/' || w.iso_year AS identificacao,
           w.start_date AS data_referencia,
           d.etapa_nome, d.observacao, d.autor_email, d.criado_em
      FROM detalhe d
      JOIN public.programacao_submissoes s ON s.id = d.registro_id
      JOIN public.weeks w ON w.id = s.week_id
     WHERE d.entidade = 'programacao'
       AND s.engenheiro_usuario_id = auth.uid()
       AND s.validacao_status = 'rejeitado'
  ),
  tudo AS (
    SELECT * FROM concreto
    UNION ALL SELECT * FROM apontamento
    UNION ALL SELECT * FROM programacao
  )
  SELECT entidade, registro_id, identificacao, data_referencia,
         COALESCE(etapa_nome, 'Etapa removida') AS etapa_nome,
         observacao AS motivo,
         COALESCE(autor_email, 'Usuário removido') AS rejeitado_por,
         criado_em AS rejeitado_em
    FROM tudo
   ORDER BY criado_em DESC;
$$;

-- ============ 2. SEED FUNCTIONS: ADICIONAR AUTH + ORG + PAPEL ============

CREATE OR REPLACE FUNCTION public.seed_cargos_referencia_padrao(p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_setor record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND ativo AND status_solicitacao = 'aprovado'
  ) THEN
    RAISE EXCEPTION 'Usuário não autenticado ou inativo' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin()
     AND (
       p_organizacao_id IS DISTINCT FROM public.user_organizacao()
       OR public.user_papel() <> 'edicao'
     ) THEN
    RAISE EXCEPTION 'Sem permissão para esta organização' USING ERRCODE = '42501';
  END IF;

  FOR v_setor IN
    SELECT * FROM (VALUES
      ('Administrativo'), ('Coordenação'), ('Liderança'), ('Logística'), ('Operacional'), ('Técnico')
    ) AS s(nome)
  LOOP
    INSERT INTO public.rh_setores (organizacao_id, nome)
    SELECT p_organizacao_id, v_setor.nome
    WHERE NOT EXISTS (
      SELECT 1 FROM public.rh_setores WHERE organizacao_id = p_organizacao_id AND nome = v_setor.nome
    );
  END LOOP;

  INSERT INTO public.rh_cargos (organizacao_id, nome, setor_padrao_id, categoria)
  SELECT p_organizacao_id, v.nome, s.id, v.categoria
  FROM (VALUES
    ('Agente Administrativo', 'Administrativo', 'I'),
    ('Almoxarife', 'Administrativo', 'I'),
    ('Analista Administrativo', 'Administrativo', 'I'),
    ('Analista de Compras', 'Administrativo', 'I'),
    ('Analista de Recursos Humanos', 'Administrativo', 'I'),
    ('Assistente Administrativo', 'Administrativo', 'I'),
    ('Auxiliar Administrativo', 'Administrativo', 'I'),
    ('Auxiliar de Almoxarife', 'Administrativo', 'I'),
    ('Auxiliar de Engenharia', 'Administrativo', 'I'),
    ('Auxiliar de Engenheiraria Pl', 'Administrativo', 'I'),
    ('Contra Mestre de Obras', 'Liderança', 'I'),
    ('Engenheiro Civil', 'Coordenação', 'I'),
    ('Engenheiro de Segurança do Trabalho', 'Coordenação', 'I'),
    ('Engenheiro Mecânico', 'Coordenação', 'I'),
    ('Líder de Obra', 'Liderança', 'I'),
    ('Mestre de Obras', 'Coordenação', 'I'),
    ('Supervisor Administrativo', 'Coordenação', 'I'),
    ('Supervisor de Qualidade', 'Coordenação', 'I'),
    ('Supervisor de Segurança do Trabalho', 'Coordenação', 'I'),
    ('Supervisora da qualidade', 'Coordenação', 'I'),
    ('Planner', 'Coordenação', 'I'),
    ('Coordenador de Obras', 'Coordenação', 'I'),
    ('Contra Mestre de Obras Jr', 'Liderança', 'I'),
    ('Encarregado Carpintaria', 'Liderança', 'I'),
    ('Encarregado de Ferragem', 'Liderança', 'I'),
    ('Encarregado de Obras', 'Liderança', 'I'),
    ('Encarregado Terraplanagem', 'Liderança', 'I'),
    ('Motorista de Caminhão 3/4', 'Logística', 'I'),
    ('Motorista de Caminhão Basculante', 'Logística', 'I'),
    ('Motorista de Caminhão Betoneira', 'Logística', 'I'),
    ('Motorista de Caminhão Bomba', 'Logística', 'I'),
    ('Motorista de Caminhão Caçamba', 'Logística', 'I'),
    ('Motorista de Caminhão Guincho', 'Logística', 'I'),
    ('Operador de Guindaste', 'Logística', 'I'),
    ('Operador de Pá Carregadeira', 'Logística', 'I'),
    ('Operador de Retroescavadeira', 'Logística', 'I'),
    ('Operador de Trator', 'Logística', 'I'),
    ('Operador Escavadeira Hidráulica', 'Logística', 'I'),
    ('Operador Mini Pá Carregadeira', 'Logística', 'I'),
    ('Operador Rolo Compactador', 'Logística', 'I'),
    ('Operador de munck', 'Logística', 'I'),
    ('Apontador de Obras', 'Operacional', 'I'),
    ('Armador', 'Operacional', 'I'),
    ('Auxiliar de Eletricista', 'Operacional', 'D'),
    ('Auxiliar de Expedição', 'Operacional', 'D'),
    ('Auxiliar de Limpeza', 'Operacional', 'I'),
    ('Auxiliar de Montagem', 'Operacional', 'D'),
    ('Auxiliar Técnico de Segurança do Trabalho', 'Operacional', 'I'),
    ('Carpinteiro', 'Operacional', 'D'),
    ('Eletricista', 'Operacional', 'D'),
    ('Meio Oficial de Carpinteiro', 'Operacional', 'D'),
    ('Meio Oficial de Pedreiro', 'Operacional', 'D'),
    ('Monitor de Alojamento', 'Operacional', 'I'),
    ('Montador', 'Operacional', 'D'),
    ('Operador de Central de Concreto', 'Operacional', 'D'),
    ('Pedreiro', 'Operacional', 'D'),
    ('Porteiro', 'Operacional', 'I'),
    ('Servente de Obras', 'Operacional', 'D'),
    ('Sinaleiro', 'Operacional', 'I'),
    ('Soldador', 'Operacional', 'I'),
    ('Supervisor de Usina', 'Operacional', 'D'),
    ('Op. De Central de Concreto Jr', 'Operacional', 'I'),
    ('Técnico de Enfermagem do Trabalho', 'Técnico', 'I'),
    ('Técnico de Segurança do Trabalho', 'Técnico', 'I'),
    ('Enfermeira do trabalho', 'Técnico', 'I'),
    ('Almoxarife Jr', 'Administrativo', 'I')
  ) AS v(nome, setor_nome, categoria)
  JOIN public.rh_setores s ON s.organizacao_id = p_organizacao_id AND s.nome = v.setor_nome
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rh_cargos c WHERE c.organizacao_id = p_organizacao_id AND c.nome = v.nome
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_etapas_concreto_padrao(p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND ativo AND status_solicitacao = 'aprovado'
  ) THEN
    RAISE EXCEPTION 'Usuário não autenticado ou inativo' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin()
     AND (
       p_organizacao_id IS DISTINCT FROM public.user_organizacao()
       OR public.user_papel() <> 'edicao'
     ) THEN
    RAISE EXCEPTION 'Sem permissão para esta organização' USING ERRCODE = '42501';
  END IF;

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

CREATE OR REPLACE FUNCTION public.seed_setores_areas_concreto_padrao(p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND ativo AND status_solicitacao = 'aprovado'
  ) THEN
    RAISE EXCEPTION 'Usuário não autenticado ou inativo' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin()
     AND (
       p_organizacao_id IS DISTINCT FROM public.user_organizacao()
       OR public.user_papel() <> 'edicao'
     ) THEN
    RAISE EXCEPTION 'Sem permissão para esta organização' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.setores_concreto (organizacao_id, nome)
  SELECT p_organizacao_id, s.nome FROM public.setores s
  ON CONFLICT (organizacao_id, nome) DO NOTHING;

  INSERT INTO public.areas_concreto (organizacao_id, setor_concreto_id, nome)
  SELECT p_organizacao_id, sc.id, a.nome
  FROM public.areas a
  JOIN public.setores s ON s.id = a.setor_id
  JOIN public.setores_concreto sc ON sc.organizacao_id = p_organizacao_id AND sc.nome = s.nome
  ON CONFLICT (organizacao_id, setor_concreto_id, nome) DO NOTHING;
END;
$$;

-- ============ 3. SINCRONIZAR SUBMISSÕES: ADICIONAR PAPEL ============

CREATE OR REPLACE FUNCTION public.sincronizar_submissoes_semana(p_week_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_organizacao uuid;
  v_criadas integer;
BEGIN
  IF auth.uid() IS NULL OR public.user_papel() IS NULL THEN
    RAISE EXCEPTION 'Usuário sem acesso' USING ERRCODE = '42501';
  END IF;

  SELECT organizacao_id INTO v_organizacao FROM public.weeks WHERE id = p_week_id;
  IF v_organizacao IS NULL OR v_organizacao <> public.user_organizacao() THEN
    RETURN 0;
  END IF;

  WITH nomes AS (
    SELECT DISTINCT a.foreman
      FROM public.activities a
     WHERE a.week_id = p_week_id
       AND a.foreman IS NOT NULL
       AND trim(a.foreman) <> ''
       AND COALESCE(a.inativa, false) = false
  ),
  inseridas AS (
    INSERT INTO public.programacao_submissoes (organizacao_id, week_id, engenheiro_usuario_id, foreman_nome)
    SELECT v_organizacao, p_week_id, m.usuario_id, n.foreman
      FROM nomes n
      JOIN public.programacao_engenheiros_usuarios m
        ON m.foreman_nome = n.foreman AND m.organizacao_id = v_organizacao
    ON CONFLICT (week_id, engenheiro_usuario_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_criadas FROM inseridas;

  RETURN v_criadas;
END;
$$;

-- ============ 4. RESTRENGRIR GRANTS ============

-- Limpeza demo: apenas service_role (chamada por pg_cron)
REVOKE ALL ON FUNCTION public.limpar_contas_demo_expiradas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_contas_demo_expiradas() TO service_role;

-- Seed functions: apenas authenticated (já têm guards internos agora)
REVOKE ALL ON FUNCTION public.seed_cargos_referencia_padrao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_etapas_concreto_padrao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_setores_areas_concreto_padrao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_cargos_referencia_padrao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_etapas_concreto_padrao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_setores_areas_concreto_padrao(uuid) TO authenticated;

-- Registrar evento: manter accessível para anon (login/signup logging)
-- mas adicionar validação de parâmetros
REVOKE ALL ON FUNCTION public.registrar_evento_seguranca(text, text, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_evento_seguranca(text, text, uuid, text, text, text, jsonb) TO anon, authenticated;

-- Minhas validações pendentes: authenticated only
REVOKE ALL ON FUNCTION public.minhas_validacoes_pendentes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_validacoes_pendentes() TO authenticated;

-- Sincronizar submissões: authenticated only
REVOKE ALL ON FUNCTION public.sincronizar_submissoes_semana(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_submissoes_semana(uuid) TO authenticated;

-- Exportar dados: authenticated only
REVOKE ALL ON FUNCTION public.exportar_meus_dados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exportar_meus_dados() TO authenticated;

-- Assinaturas: authenticated only
REVOKE ALL ON FUNCTION public.assinaturas_da_organizacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assinaturas_da_organizacao() TO authenticated;

-- Atualizar assinatura: authenticated only
REVOKE ALL ON FUNCTION public.atualizar_assinatura(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_assinatura(text) TO authenticated;

-- Atualizar função: authenticated only
REVOKE ALL ON FUNCTION public.atualizar_minha_funcao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_minha_funcao(text) TO authenticated;

-- Meus lançamentos rejeitados: authenticated only
REVOKE ALL ON FUNCTION public.meus_lancamentos_rejeitados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meus_lancamentos_rejeitados() TO authenticated;

-- Uso faturável da organização: authenticated only (já tem guard)
REVOKE ALL ON FUNCTION public.minha_organizacao_uso_faturavel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_organizacao_uso_faturavel() TO authenticated;

-- Módulos comerciais ativos: authenticated only
REVOKE ALL ON FUNCTION public.meus_modulos_comerciais_ativos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meus_modulos_comerciais_ativos() TO authenticated;

-- Uso armazenamento: authenticated only (já tem guard)
REVOKE ALL ON FUNCTION public.uso_armazenamento_organizacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uso_armazenamento_organizacao(uuid) TO authenticated;

-- Listar arquivos: authenticated only (já tem guard)
REVOKE ALL ON FUNCTION public.listar_arquivos_organizacao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_arquivos_organizacao(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
