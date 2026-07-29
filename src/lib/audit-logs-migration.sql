-- ============================================================
-- MIGRAÇÃO: Audit logs para rastreabilidade LGPD
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================

-- ============ 1. TABELA DE AUDITORIA ============

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acao text NOT NULL,
  tabela text NOT NULL,
  registro_id uuid,
  dados_anteriores jsonb,
  dados_novos jsonb,
  ip text,
  user_agent text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Política: super admins podem ver tudo, usuários veem apenas suas próprias ações
CREATE POLICY "Super admins veem todos os logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "Usuários veem seus proprios logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

-- Apenas service_role pode inserir (via trigger)
REVOKE ALL ON public.audit_logs FROM authenticated, anon;
GRANT ALL ON public.audit_logs TO service_role;

-- Índices para consulta
CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario ON public.audit_logs (usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tabela ON public.audit_logs (tabela);
CREATE INDEX IF NOT EXISTS idx_audit_logs_criado_em ON public.audit_logs (criado_em DESC);

-- ============ 2. FUNÇÃO PARA REGISTRAR LOG ============

CREATE OR REPLACE FUNCTION public.registrar_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ============ 3. TRIGGER PARA user_profiles ============

DROP TRIGGER IF EXISTS trg_audit_user_profiles ON public.user_profiles;
CREATE TRIGGER trg_audit_user_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.registrar_audit_log();

-- ============ 4. FUNÇÃO AUXILIAR is_super_admin ============

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT is_super_admin FROM public.user_profiles WHERE id = auth.uid();
$$;
