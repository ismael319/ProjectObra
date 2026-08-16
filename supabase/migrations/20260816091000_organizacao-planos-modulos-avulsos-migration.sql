-- ============================================================
-- MIGRAÇÃO: Assinatura de plano e módulos avulsos por organização (Fase B)
-- Execute este SQL no Supabase SQL Editor do ProjectObra, APÓS
-- catalogo-modulos-comerciais-planos-migration.sql
-- ============================================================
-- Nome "organizacao_planos" (não "assinatura"/"empresa_assinaturas"): a
-- palavra "assinatura" já é usada no projeto para assinatura ELETRÔNICA de
-- usuário (user_profiles.assinatura_estilo, RPCs atualizar_assinatura /
-- assinaturas_da_organizacao) — usar o mesmo nome aqui colidiria.
--
-- organizacao_planos é HISTÓRICO, não "1 linha = estado atual": cada linha é
-- um período em que a organização esteve num plano. data_fim NULL = período
-- vigente. Ao trocar de plano (upgrade/downgrade) ou cancelar, fecha a linha
-- atual (data_fim = hoje) e, se for troca, abre uma nova. Isso resolve a
-- decisão de produto "downgrade/cancelamento mantém acesso somente leitura
-- aos dados já existentes": basta a view de Fase C tratar toda linha com
-- data_fim preenchido como leitura, nunca preciso apagar ou reclassificar
-- nada por trás.
-- ============================================================

-- ============ 1. ASSINATURA DE PLANO POR ORGANIZAÇÃO ============

CREATE TABLE IF NOT EXISTS public.organizacao_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.planos(id),
  data_inicio date NOT NULL DEFAULT current_date,
  data_fim date,
  ciclo_faturamento text NOT NULL DEFAULT 'mensal' CHECK (ciclo_faturamento IN ('mensal', 'anual')),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'ativo', 'suspenso', 'cancelado')),
  -- Trial é por ORGANIZAÇÃO (uma vez só), não por módulo: o modelo de venda
  -- aqui é comercial/negociado, não self-service, então trial por módulo
  -- individual seria complexidade sem uso hoje.
  trial_fim date,
  -- Fim do período de graça (leitura+escrita ainda liberada) depois que o
  -- status vira 'suspenso' — depois disso, leitura apenas. Valor sugerido
  -- de 7 dias fica a critério de quem lançar a suspensão, não é travado
  -- aqui no schema.
  grace_fim date,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS organizacao_planos_org_idx ON public.organizacao_planos (organizacao_id);

-- No máximo uma linha "aberta" (vigente) por organização.
CREATE UNIQUE INDEX IF NOT EXISTS organizacao_planos_vigente_uidx
  ON public.organizacao_planos (organizacao_id) WHERE data_fim IS NULL;

ALTER TABLE public.organizacao_planos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizacao_planos TO authenticated;

DROP POLICY IF EXISTS "Leitura plano da propria organizacao" ON public.organizacao_planos;
CREATE POLICY "Leitura plano da propria organizacao" ON public.organizacao_planos
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Dono gerencia planos das organizacoes" ON public.organizacao_planos;
CREATE POLICY "Dono gerencia planos das organizacoes" ON public.organizacao_planos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 2. MÓDULOS AVULSOS CONTRATADOS À PARTE ============

CREATE TABLE IF NOT EXISTS public.organizacao_modulos_avulsos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  modulo_codigo text NOT NULL REFERENCES public.modulos_comerciais(codigo),
  data_ativacao date NOT NULL DEFAULT current_date,
  data_desativacao date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'suspenso', 'cancelado')),
  liberado_por uuid REFERENCES auth.users(id),
  CHECK (data_desativacao IS NULL OR data_desativacao >= data_ativacao)
);

CREATE INDEX IF NOT EXISTS organizacao_modulos_avulsos_org_idx
  ON public.organizacao_modulos_avulsos (organizacao_id, modulo_codigo);

ALTER TABLE public.organizacao_modulos_avulsos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizacao_modulos_avulsos TO authenticated;

DROP POLICY IF EXISTS "Leitura avulsos da propria organizacao" ON public.organizacao_modulos_avulsos;
CREATE POLICY "Leitura avulsos da propria organizacao" ON public.organizacao_modulos_avulsos
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Dono gerencia avulsos" ON public.organizacao_modulos_avulsos;
CREATE POLICY "Dono gerencia avulsos" ON public.organizacao_modulos_avulsos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 3. TRAVA: só módulo com status 'ativo' no catálogo pode ser contratado ============
-- Ex.: WHATSAPP_RDO está 'planejado' — ninguém consegue inserir uma linha de
-- avulso ou incluir em plano_modulos apontando pra ele enquanto isso.

CREATE OR REPLACE FUNCTION public.valida_modulo_comercial_ativo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.modulos_comerciais WHERE codigo = NEW.modulo_codigo;
  IF v_status IS DISTINCT FROM 'ativo' THEN
    RAISE EXCEPTION 'Módulo comercial "%" não está ativo (status atual: %) e não pode ser contratado', NEW.modulo_codigo, v_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_modulo_avulso_ativo ON public.organizacao_modulos_avulsos;
CREATE TRIGGER trg_valida_modulo_avulso_ativo
  BEFORE INSERT OR UPDATE OF modulo_codigo, status ON public.organizacao_modulos_avulsos
  FOR EACH ROW WHEN (NEW.status <> 'cancelado')
  EXECUTE FUNCTION public.valida_modulo_comercial_ativo();

-- Mesma trava para plano_modulos: um plano não pode incluir um módulo que
-- ainda está 'planejado'/'deprecated' no catálogo.
DROP TRIGGER IF EXISTS trg_valida_modulo_plano_ativo ON public.plano_modulos;
CREATE TRIGGER trg_valida_modulo_plano_ativo
  BEFORE INSERT OR UPDATE OF modulo_codigo ON public.plano_modulos
  FOR EACH ROW
  EXECUTE FUNCTION public.valida_modulo_comercial_ativo();

NOTIFY pgrst, 'reload schema';
