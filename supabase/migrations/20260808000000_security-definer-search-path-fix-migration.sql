-- Segurança: adiciona SET search_path = public a todas as funções SECURITY DEFINER
-- que estavam sem essa proteção. Previne search_path hijacking.
-- Cada função é recriada com CREATE OR REPLACE, mantendo o comportamento idêntico.

-- 1. atualizar_minha_funcao
CREATE OR REPLACE FUNCTION public.atualizar_minha_funcao(nova_funcao text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_profiles SET funcao = nullif(trim(nova_funcao), '') WHERE id = auth.uid();
$$;

-- 2. user_tem_modulo
CREATE OR REPLACE FUNCTION public.user_tem_modulo(chave text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizacao_modulos
    WHERE organizacao_id = public.user_organizacao() AND modulo_key = chave AND ativo
  );
$$;

-- 3. user_ve_modulo
CREATE OR REPLACE FUNCTION public.user_ve_modulo(chave text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.user_tem_modulo(chave) AND (
    NOT EXISTS (SELECT 1 FROM public.user_modulos_visiveis WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_modulos_visiveis WHERE user_id = auth.uid() AND modulo_key = chave)
  );
$$;

-- 4. handle_new_user (versão final com convites)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  convite_id uuid := NULL;
  convite_papel text;
  convite_org uuid;
BEGIN
  IF to_regclass('public.convites') IS NOT NULL THEN
    SELECT id, papel_convidado, organizacao_id
      INTO convite_id, convite_papel, convite_org
      FROM public.convites
      WHERE lower(email) = lower(new.email) AND usado_em IS NULL
      ORDER BY criado_em DESC LIMIT 1;
  END IF;

  IF convite_id IS NOT NULL THEN
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, convite_papel, 'aprovado', convite_org);
    UPDATE public.convites SET usado_em = now() WHERE id = convite_id;
  ELSE
    INSERT INTO public.user_profiles (id, email, papel, status_solicitacao, organizacao_id)
    VALUES (new.id, new.email, NULL, 'pendente', NULL);
  END IF;

  RETURN new;
END;
$$;

-- 5. handle_user_profile_decision
CREATE OR REPLACE FUNCTION public.handle_user_profile_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ator_papel text;
BEGIN
  IF (new.papel IS DISTINCT FROM old.papel)
     OR (new.status_solicitacao IS DISTINCT FROM old.status_solicitacao) THEN

    new.decidido_por := auth.uid();
    new.decidido_em := now();

    ator_papel := public.user_papel();

    -- Só um admin pode conceder o papel admin (segunda camada além da RLS).
    IF new.papel = 'admin' AND ator_papel IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Somente administradores podem conceder o papel admin';
    END IF;

    -- Ninguém decide sobre a própria solicitação, nem admin.
    IF new.id = auth.uid() THEN
      RAISE EXCEPTION 'Não é permitido decidir sobre a própria solicitação';
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- 6. user_papel
CREATE OR REPLACE FUNCTION public.user_papel()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT papel FROM public.user_profiles
  WHERE id = auth.uid() AND status_solicitacao = 'aprovado';
$$;

-- 7. registrar_evento_seguranca
CREATE OR REPLACE FUNCTION public.registrar_evento_seguranca(
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_usuario_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.security_events (event_type, severity, usuario_id, email, ip, user_agent, metadata)
  VALUES (p_event_type, p_severity, p_usuario_id, p_email, p_ip, p_user_agent, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 8. verificar_rate_limit_login
CREATE OR REPLACE FUNCTION public.verificar_rate_limit_login(
  p_ip text,
  p_max_tentativas int DEFAULT 5,
  p_janela_minutos int DEFAULT 15
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.security_events
  WHERE event_type = 'login_failed'
    AND ip = p_ip
    AND created_at > now() - (p_janela_minutos || ' minutes')::interval;

  RETURN v_count < p_max_tentativas;
END;
$$;

-- 9. verificar_rate_limit_signup
CREATE OR REPLACE FUNCTION public.verificar_rate_limit_signup(
  p_ip text,
  p_max_tentativas int DEFAULT 3,
  p_janela_minutos int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.security_events
  WHERE event_type = 'signup_attempt'
    AND ip = p_ip
    AND created_at > now() - (p_janela_minutos || ' minutes')::interval;

  RETURN v_count < p_max_tentativas;
END;
$$;

-- 10. detect_atividade_suspeita
CREATE OR REPLACE FUNCTION public.detect_atividade_suspeita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tentativas_recentes int;
  v_ips_diferentes int;
BEGIN
  -- Caso 1: Múltiplas tentativas de login falhas (força bruta)
  IF NEW.event_type = 'login_failed' THEN
    SELECT COUNT(*) INTO v_tentativas_recentes
    FROM public.security_events
    WHERE event_type = 'login_failed'
      AND ip = NEW.ip
      AND created_at > now() - interval '15 minutes';

    IF v_tentativas_recentes >= 5 THEN
      INSERT INTO public.security_events (event_type, severity, ip, metadata)
      VALUES ('brute_force_detected', 'critical', NEW.ip,
        jsonb_build_object('tentativas', v_tentativas_recentes, 'janela_minutos', 15));
    END IF;
  END IF;

  -- Caso 2: Múltiplos IPs diferentes para mesma conta em curto período
  IF NEW.event_type = 'login_success' AND NEW.usuario_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT ip) INTO v_ips_diferentes
    FROM public.security_events
    WHERE event_type = 'login_success'
      AND usuario_id = NEW.usuario_id
      AND created_at > now() - interval '1 hour'
      AND ip IS DISTINCT FROM NEW.ip;

    IF v_ips_diferentes >= 3 THEN
      INSERT INTO public.security_events (event_type, severity, usuario_id, ip, metadata)
      VALUES ('multiple_ips_detected', 'warning', NEW.usuario_id, NEW.ip,
        jsonb_build_object('ips_diferentes_1h', v_ips_diferentes + 1));
    END IF;
  END IF;

  -- Caso 3: Solicitação de exclusão seguida de novo cadastro (tentativa de fraude)
  IF NEW.event_type = 'account_deletion_requested' THEN
    INSERT INTO public.security_events (event_type, severity, usuario_id, metadata)
    VALUES ('account_deletion_flagged', 'info', NEW.usuario_id,
      jsonb_build_object('acao', 'exclusao_solicitada', 'data', now()));
  END IF;

  RETURN NEW;
END;
$$;

-- 11. consumir_turno_chat
CREATE OR REPLACE FUNCTION public.consumir_turno_chat(
  p_usuario_id uuid,
  p_max_por_janela int DEFAULT 20,
  p_janela_minutos int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.security_events
  WHERE event_type = 'chat_message'
    AND usuario_id = p_usuario_id
    AND created_at > now() - (p_janela_minutos || ' minutes')::interval;

  IF v_count >= p_max_por_janela THEN
    RETURN false;
  END IF;

  INSERT INTO public.security_events (event_type, severity, usuario_id, metadata)
  VALUES ('chat_message', 'info', p_usuario_id,
    jsonb_build_object('janela_minutos', p_janela_minutos, 'max_por_janela', p_max_por_janela));

  RETURN true;
END;
$$;

-- 12. aceitar_termos
CREATE OR REPLACE FUNCTION public.aceitar_termos(versao text DEFAULT '1.0')
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_profiles
  SET termos_aceitos_em = now(),
      versao_termos = versao
  WHERE id = auth.uid();
$$;

-- 13. usuario_aceitou_termos
CREATE OR REPLACE FUNCTION public.usuario_aceitou_termos(versao text DEFAULT '1.0')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND termos_aceitos_em IS NOT NULL
      AND versao_termos = versao
  );
$$;

-- 14. solicitar_exclusao_conta
CREATE OR REPLACE FUNCTION public.solicitar_exclusao_conta(motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET exclusao_solicitada_em = now(),
      exclusao_motivo = motivo,
      ativo = false
  WHERE id = auth.uid()
    AND exclusao_solicitada_em IS NULL
    AND exclusao_confirmada_em IS NULL;
END;
$$;

-- 15. cancelar_exclusao_conta
CREATE OR REPLACE FUNCTION public.cancelar_exclusao_conta()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET exclusao_solicitada_em = NULL,
      exclusao_motivo = NULL,
      ativo = true
  WHERE id = auth.uid()
    AND exclusao_confirmada_em IS NULL;
END;
$$;

-- 16. confirmar_exclusao_conta
CREATE OR REPLACE FUNCTION public.confirmar_exclusao_conta(usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só super admin pode confirmar exclusão
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'Apenas super administradores podem confirmar exclusão de contas';
  END IF;

  -- Marca como confirmada
  UPDATE public.user_profiles
  SET exclusao_confirmada_em = now(),
      papel = NULL,
      status_solicitacao = 'rejeitado'
  WHERE id = usuario_id
    AND exclusao_solicitada_em IS NOT NULL
    AND exclusao_confirmada_em IS NULL;

  -- Remove sessões ativas do usuário
  DELETE FROM auth.sessions WHERE user_id = usuario_id;
END;
$$;

-- 17. exportar_meus_dados
CREATE OR REPLACE FUNCTION public.exportar_meus_dados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
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

-- 18. registrar_audit_log
CREATE OR REPLACE FUNCTION public.registrar_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (usuario_id, acao, tabela, registro_id, dados_anteriores, dados_novos)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 19. is_super_admin (versão final com COALESCE)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.user_profiles WHERE id = auth.uid() AND status_solicitacao = 'aprovado'),
    false
  );
$$;

-- 20. organizacao_piloto_id
CREATE OR REPLACE FUNCTION public.organizacao_piloto_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.organizacoes WHERE is_piloto LIMIT 1;
$$;

-- 21. user_organizacao
CREATE OR REPLACE FUNCTION public.user_organizacao()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organizacao_id FROM public.user_profiles
  WHERE id = auth.uid() AND status_solicitacao = 'aprovado';
$$;

-- 22. seed_tipos_documento_padrao
CREATE OR REPLACE FUNCTION public.seed_tipos_documento_padrao(p_organizacao_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- 23. seed_cargos_referencia_padrao
CREATE OR REPLACE FUNCTION public.seed_cargos_referencia_padrao(p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor record;
BEGIN
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
    ('Armador', 'Operacional', 'D'),
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

-- 24. seed_etapas_concreto_padrao
CREATE OR REPLACE FUNCTION public.seed_etapas_concreto_padrao(p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- 25. gerar_codigo_rastreabilidade_carga
CREATE OR REPLACE FUNCTION public.gerar_codigo_rastreabilidade_carga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- 26. atualizar_status_corpo_prova
CREATE OR REPLACE FUNCTION public.atualizar_status_corpo_prova()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- 27. user_papel_modulo
CREATE OR REPLACE FUNCTION public.user_papel_modulo(chave text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT upm.papel FROM public.user_papel_modulos upm
      JOIN public.user_profiles up ON up.id = upm.user_id
      WHERE upm.user_id = auth.uid()
        AND upm.modulo_key = chave
        AND up.status_solicitacao = 'aprovado'
    ),
    public.user_papel()
  );
$$;

-- 28. seed_setores_areas_concreto_padrao
CREATE OR REPLACE FUNCTION public.seed_setores_areas_concreto_padrao(p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- 29. save_week_baseline
CREATE OR REPLACE FUNCTION public.save_week_baseline(p_week_id uuid, p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Limpa baseline anterior (se existir)
  DELETE FROM public.week_baseline
  WHERE week_id = p_week_id AND organizacao_id = p_organizacao_id;

  -- Copia atividades atuais
  INSERT INTO public.week_baseline (
    week_id, organizacao_id, activity_id, name, company, discipline,
    area, stage, foreman, planned_date, planned_pct, status,
    is_extra, source_cronograma, task_uid
  )
  SELECT
    p_week_id,
    p_organizacao_id,
    a.id,
    a.name,
    a.company,
    a.discipline,
    a.area,
    a.stage,
    a.foreman,
    a.planned_date,
    a.planned_pct,
    a.status,
    a.is_extra,
    a.source_cronograma,
    a.task_uid
  FROM public.activities a
  WHERE a.week_id = p_week_id
    AND a.organizacao_id = p_organizacao_id;
END;
$$;

-- 30. clear_week_baseline
CREATE OR REPLACE FUNCTION public.clear_week_baseline(p_week_id uuid, p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.week_baseline
  WHERE week_id = p_week_id AND organizacao_id = p_organizacao_id;
END;
$$;

-- 31. get_week_analysis
CREATE OR REPLACE FUNCTION public.get_week_analysis(p_week_id uuid, p_organizacao_id uuid)
RETURNS TABLE (
  activity_id uuid,
  activity_name text,
  planned_date date,
  baseline_date date,
  baseline_status text,
  current_status text,
  is_extra boolean,
  was_reprogrammed boolean,
  was_added_after_lock boolean,
  was_removed_after_lock boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Itens que existem no baseline E na programação atual
  SELECT
    COALESCE(b.activity_id, a.id) AS activity_id,
    COALESCE(b.name, a.name) AS activity_name,
    COALESCE(a.planned_date, b.planned_date) AS planned_date,
    b.planned_date AS baseline_date,
    b.status AS baseline_status,
    COALESCE(a.status, 'removida') AS current_status,
    COALESCE(a.is_extra, false) AS is_extra,
    (b.planned_date IS DISTINCT FROM a.planned_date) AS was_reprogrammed,
    (b.activity_id IS NULL) AS was_added_after_lock,
    (a.activity_id IS NULL) AS was_removed_after_lock
  FROM public.week_baseline b
  FULL OUTER JOIN public.activities a
    ON a.id = b.activity_id
    AND a.week_id = p_week_id
    AND a.organizacao_id = p_organizacao_id
  WHERE b.week_id = p_week_id
    AND b.organizacao_id = p_organizacao_id
  ORDER BY COALESCE(b.planned_date, a.planned_date), COALESCE(b.name, a.name);
END;
$$;
