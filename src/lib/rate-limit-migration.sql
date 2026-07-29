-- ============================================================
-- MIGRAÇÃO: Rate Limiting e Prevenção a Fraudes
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================

-- ============ 1. TABELA DE EVENTOS DE SEGURANÇA ============

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  ip text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Políticas: apenas super admins visualizam
CREATE POLICY "Super admins read security events" ON public.security_events
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Apenas service_role pode inserir (via trigger ou RPC)
REVOKE ALL ON public.security_events FROM authenticated, anon;
GRANT ALL ON public.security_events TO service_role;

-- Índices para consulta
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events (event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events (severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_usuario ON public.security_events (usuario_id);

-- ============ 2. FUNÇÃO PARA REGISTRAR EVENTO DE SEGURANÇA ============

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

GRANT EXECUTE ON FUNCTION public.registrar_evento_seguranca TO authenticated;

-- ============ 3. FUNÇÃO DE RATE LIMIT (TENTATIVAS DE LOGIN) ============

CREATE OR REPLACE FUNCTION public.verificar_rate_limit_login(
  p_ip text,
  p_max_tentativas int DEFAULT 5,
  p_janela_minutos int DEFAULT 15
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
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

-- ============ 4. FUNÇÃO DE RATE LIMIT (SIGNUP) ============

CREATE OR REPLACE FUNCTION public.verificar_rate_limit_signup(
  p_ip text,
  p_max_tentativas int DEFAULT 3,
  p_janela_minutos int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
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

-- ============ 5. FUNÇÃO PARA DETECTAR ATIVIDADE SUSPEITA ============

CREATE OR REPLACE FUNCTION public.detect_atividade_suspeita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Trigger: toda inserção em security_events passa pelo detector
DROP TRIGGER IF EXISTS trg_detect_atividade_suspeita ON public.security_events;
CREATE TRIGGER trg_detect_atividade_suspeita
  AFTER INSERT ON public.security_events
  FOR EACH ROW EXECUTE FUNCTION public.detect_atividade_suspeita();

-- ============ 6. VIEW DE EVENTOS CRÍTICOS PARA ADMIN ============

CREATE OR REPLACE VIEW public.security_alerts AS
SELECT
  id,
  event_type,
  severity,
  email,
  ip,
  metadata,
  created_at,
  CASE
    WHEN event_type = 'brute_force_detected' THEN 'Força bruta detectada'
    WHEN event_type = 'multiple_ips_detected' THEN 'Múltiplos IPs na mesma conta'
    WHEN event_type = 'login_failed' THEN 'Tentativa de login falha'
    WHEN event_type = 'login_success' THEN 'Login bem-sucedido'
    WHEN event_type = 'signup_attempt' THEN 'Tentativa de cadastro'
    WHEN event_type = 'account_deletion_flagged' THEN 'Exclusão de conta solicitada'
    ELSE event_type
  END AS descricao
FROM public.security_events
WHERE severity IN ('warning', 'critical')
ORDER BY created_at DESC;

-- ============ 7. GRANTS PARA VIEWS ============

GRANT SELECT ON public.security_alerts TO authenticated;
