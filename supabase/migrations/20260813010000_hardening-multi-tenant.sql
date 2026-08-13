-- Correções de autorização entre organizações e obras.
-- As funções mantêm suas assinaturas públicas para não interromper o frontend.

CREATE OR REPLACE FUNCTION public.assert_acesso_engenharia_projeto(
  p_organizacao_id uuid,
  p_projeto_id uuid,
  p_exige_edicao boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;

  IF public.is_super_admin() THEN
    RETURN;
  END IF;

  IF p_organizacao_id IS DISTINCT FROM public.user_organizacao()
     OR NOT public.user_ve_projeto(p_projeto_id)
     OR NOT public.user_ve_modulo('engenharia')
     OR (p_exige_edicao AND public.user_papel_modulo('engenharia') <> 'edicao') THEN
    RAISE EXCEPTION 'Sem permissão para esta obra' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_acesso_engenharia_projeto(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_acesso_engenharia_projeto(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_week_baseline(
  p_week_id uuid,
  p_organizacao_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_projeto_id uuid;
  v_status public.week_status;
BEGIN
  SELECT projeto_id, status INTO v_projeto_id, v_status
  FROM public.weeks
  WHERE id = p_week_id AND organizacao_id = p_organizacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semana não encontrada ou sem acesso' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_acesso_engenharia_projeto(p_organizacao_id, v_projeto_id, true);

  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'O baseline só pode ser gravado em semana rascunho' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.week_baseline
  WHERE week_id = p_week_id AND organizacao_id = p_organizacao_id;

  INSERT INTO public.week_baseline (
    week_id, organizacao_id, projeto_id, activity_id, name, company, discipline, area,
    stage, foreman, planned_date, planned_pct, status, is_extra,
    source_cronograma, task_uid, inativa, is_extra_original
  )
  SELECT
    a.week_id, a.organizacao_id, a.projeto_id, a.id, a.name, a.company, a.discipline, a.area,
    a.stage, a.foreman, a.planned_date, a.planned_pct, a.status, a.is_extra,
    a.source_cronograma, a.task_uid, a.inativa,
    COALESCE(a.is_extra_original, a.is_extra)
  FROM public.activities a
  WHERE a.week_id = p_week_id
    AND a.organizacao_id = p_organizacao_id
    AND a.projeto_id = v_projeto_id
    AND a.fora_do_plano = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_week_baseline(
  p_week_id uuid,
  p_organizacao_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_projeto_id uuid;
  v_status public.week_status;
BEGIN
  SELECT projeto_id, status INTO v_projeto_id, v_status
  FROM public.weeks
  WHERE id = p_week_id AND organizacao_id = p_organizacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semana não encontrada ou sem acesso' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_acesso_engenharia_projeto(p_organizacao_id, v_projeto_id, true);

  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'O baseline só pode ser apagado em semana rascunho' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.week_baseline
  WHERE week_id = p_week_id AND organizacao_id = p_organizacao_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_week_analysis(
  p_week_id uuid,
  p_organizacao_id uuid
)
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_projeto_id uuid;
BEGIN
  SELECT projeto_id INTO v_projeto_id
  FROM public.weeks
  WHERE id = p_week_id AND organizacao_id = p_organizacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semana não encontrada ou sem acesso' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_acesso_engenharia_projeto(p_organizacao_id, v_projeto_id, false);

  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.week_baseline
    WHERE week_id = p_week_id
      AND organizacao_id = p_organizacao_id
      AND projeto_id = v_projeto_id
  ),
  atual AS (
    SELECT * FROM public.activities
    WHERE week_id = p_week_id
      AND organizacao_id = p_organizacao_id
      AND projeto_id = v_projeto_id
      AND fora_do_plano = false
  )
  SELECT
    COALESCE(b.activity_id, a.id) AS activity_id,
    COALESCE(b.name, a.name) AS activity_name,
    COALESCE(a.planned_date, b.planned_date) AS planned_date,
    b.planned_date AS baseline_date,
    b.status AS baseline_status,
    COALESCE(a.status::text, 'removida') AS current_status,
    COALESCE(a.is_extra, b.is_extra, false) AS is_extra,
    (b.activity_id IS NOT NULL AND a.id IS NOT NULL
      AND b.planned_date IS DISTINCT FROM a.planned_date) AS was_reprogrammed,
    (b.activity_id IS NULL) AS was_added_after_lock,
    (a.id IS NULL) AS was_removed_after_lock
  FROM base b
  FULL OUTER JOIN atual a ON a.id = b.activity_id
  ORDER BY COALESCE(b.planned_date, a.planned_date), COALESCE(b.name, a.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.programacao_pronta_para_bloqueio(p_week_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_organizacao_id uuid;
  v_projeto_id uuid;
BEGIN
  SELECT organizacao_id, projeto_id INTO v_organizacao_id, v_projeto_id
  FROM public.weeks
  WHERE id = p_week_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semana não encontrada ou sem acesso' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_acesso_engenharia_projeto(v_organizacao_id, v_projeto_id, false);

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.programacao_submissoes
    WHERE week_id = p_week_id
      AND organizacao_id = v_organizacao_id
      AND validacao_status <> 'aprovado'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consumir_turno_chat(
  p_usuario_id uuid,
  p_max_por_janela integer DEFAULT 20,
  p_janela_minutos integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_max constant integer := 20;
  v_janela constant integer := 60;
BEGIN
  IF auth.uid() IS NULL OR p_usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuário inválido' USING ERRCODE = '42501';
  END IF;

  IF p_max_por_janela <> v_max OR p_janela_minutos <> v_janela THEN
    RAISE EXCEPTION 'Configuração de cota não permitida' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND ativo AND status_solicitacao = 'aprovado'
  ) THEN
    RAISE EXCEPTION 'Usuário inativo ou não aprovado' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  SELECT count(*) INTO v_count
  FROM public.security_events
  WHERE event_type = 'chat_message'
    AND usuario_id = auth.uid()
    AND created_at > now() - make_interval(mins => v_janela);

  IF v_count >= v_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.security_events (event_type, severity, usuario_id, metadata)
  VALUES ('chat_message', 'info', auth.uid(),
    jsonb_build_object('janela_minutos', v_janela, 'max_por_janela', v_max));

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_tipos_documento_padrao(p_organizacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_profiles
       WHERE id = auth.uid() AND ativo AND status_solicitacao = 'aprovado'
     )
     OR (
       NOT public.is_super_admin()
       AND (
         p_organizacao_id IS DISTINCT FROM public.user_organizacao()
         OR public.user_papel() <> 'edicao'
       )
     ) THEN
    RAISE EXCEPTION 'Sem permissão para esta organização' USING ERRCODE = '42501';
  END IF;

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
END;
$$;

ALTER VIEW public.security_alerts SET (security_invoker = true);

REVOKE ALL ON public.security_alerts FROM PUBLIC, anon;
GRANT SELECT ON public.security_alerts TO authenticated;
-- Com security_invoker a RLS da tabela-base passa a valer. O GRANT apenas
-- permite que a policy abaixo seja avaliada; não concede leitura por si só.
GRANT SELECT ON public.security_events TO authenticated;

DROP POLICY IF EXISTS "Leitura convites" ON public.convites;
CREATE POLICY "Leitura convites" ON public.convites
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.user_papel_modulo('sistema') = 'edicao'
      AND organizacao_id = public.user_organizacao()
    )
  );

DROP POLICY IF EXISTS "Super admins read security events" ON public.security_events;
CREATE POLICY "Super admins read security events" ON public.security_events
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.ativo AND up.status_solicitacao = 'aprovado'
    )
  );

REVOKE ALL ON FUNCTION public.save_week_baseline(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_week_baseline(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_week_analysis(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.programacao_pronta_para_bloqueio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consumir_turno_chat(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_tipos_documento_padrao(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_week_baseline(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_week_baseline(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_week_analysis(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.programacao_pronta_para_bloqueio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_turno_chat(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_tipos_documento_padrao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
