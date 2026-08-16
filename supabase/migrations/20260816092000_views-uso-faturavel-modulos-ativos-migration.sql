-- ============================================================
-- MIGRAÇÃO: Views de feature-gating comercial e uso faturável (Fase C)
-- Execute este SQL no Supabase SQL Editor do ProjectObra, APÓS
-- organizacao-planos-modulos-avulsos-migration.sql
-- ============================================================

-- ============ 1. FONTE DE VERDADE: módulo comercial ativo por organização ============
-- Combina plano vigente + módulos avulsos, e classifica cada um em
-- 'leitura_escrita' (acesso pleno) ou 'somente_leitura' (mantém visibilidade
-- dos dados já existentes, sem permitir escrita — decisão de produto para
-- downgrade/cancelamento e para assinatura vencida além do prazo de graça).
--
-- Um módulo pode aparecer pela via do plano E pela via avulsa ao mesmo
-- tempo (ex.: cliente já tinha QUALIDADE avulso e depois migrou pro plano
-- Profissional, que já inclui QUALIDADE) — o GROUP BY final resolve isso
-- pegando o nível de acesso mais permissivo entre as duas origens.
--
-- Esta view é a verdade CONTRATUAL, sem bypass de piloto — serve também
-- pra relatório futuro de "quanto cada empresa deveria pagar". O bypass da
-- organização piloto (is_piloto) fica só nas funções da seção 2, que são as
-- usadas de fato para checagem de acesso.

CREATE OR REPLACE VIEW public.v_organizacao_modulos_ativos AS
SELECT
  organizacao_id,
  modulo_codigo,
  CASE WHEN bool_or(nivel_acesso = 'leitura_escrita') THEN 'leitura_escrita' ELSE 'somente_leitura' END AS nivel_acesso
FROM (
  -- Via plano contratado (histórico: linha com data_fim preenchido = plano
  -- anterior, mantém leitura dos módulos que ela cobria).
  SELECT
    op.organizacao_id,
    pm.modulo_codigo,
    CASE
      WHEN op.data_fim IS NOT NULL THEN 'somente_leitura'
      WHEN op.status = 'ativo' THEN 'leitura_escrita'
      WHEN op.status = 'trial' AND (op.trial_fim IS NULL OR op.trial_fim >= current_date) THEN 'leitura_escrita'
      WHEN op.status = 'suspenso' AND op.grace_fim IS NOT NULL AND op.grace_fim >= current_date THEN 'leitura_escrita'
      ELSE 'somente_leitura'
    END AS nivel_acesso
  FROM public.organizacao_planos op
  JOIN public.plano_modulos pm ON pm.plano_id = op.plano_id

  UNION ALL

  -- Via módulo avulso (cancelado também mantém leitura, mesma regra).
  SELECT
    oma.organizacao_id,
    oma.modulo_codigo,
    CASE WHEN oma.status = 'ativo' THEN 'leitura_escrita' ELSE 'somente_leitura' END AS nivel_acesso
  FROM public.organizacao_modulos_avulsos oma
) origem
GROUP BY organizacao_id, modulo_codigo;

-- ============ 2. FUNÇÕES DE CHECAGEM (com bypass da organização piloto) ============
-- Mesmo espírito de public.user_tem_modulo / user_ve_modulo (RLS de tela),
-- mas para o nível comercial. Nome com sufixo "_comercial" de propósito,
-- pra não confundir com as funções de módulo de RLS já existentes.

CREATE OR REPLACE FUNCTION public.organizacao_pode_ler_modulo_comercial(p_codigo text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.organizacoes o
    WHERE o.id = public.user_organizacao()
      AND (
        o.is_piloto
        OR EXISTS (
          SELECT 1 FROM public.v_organizacao_modulos_ativos v
          WHERE v.organizacao_id = o.id AND v.modulo_codigo = p_codigo
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.organizacao_pode_escrever_modulo_comercial(p_codigo text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.organizacoes o
    WHERE o.id = public.user_organizacao()
      AND (
        o.is_piloto
        OR EXISTS (
          SELECT 1 FROM public.v_organizacao_modulos_ativos v
          WHERE v.organizacao_id = o.id AND v.modulo_codigo = p_codigo AND v.nivel_acesso = 'leitura_escrita'
        )
      )
  );
$$;

-- ============ 2.1 RPC PARA O FRONT-END: meus módulos comerciais ativos ============
-- v_organizacao_modulos_ativos não é exposta direto ao PostgREST (sem GRANT
-- SELECT) — o front-end consulta por aqui, já com o bypass de piloto
-- aplicado, pra decidir o que mostrar/esconder (feature-gating de tela).

CREATE OR REPLACE FUNCTION public.meus_modulos_comerciais_ativos()
RETURNS TABLE (modulo_codigo text, nivel_acesso text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.codigo, 'leitura_escrita'::text
  FROM public.organizacoes o
  CROSS JOIN public.modulos_comerciais m
  WHERE o.id = public.user_organizacao() AND o.is_piloto AND m.status = 'ativo'

  UNION ALL

  SELECT v.modulo_codigo, v.nivel_acesso
  FROM public.v_organizacao_modulos_ativos v
  WHERE v.organizacao_id = public.user_organizacao()
    AND NOT EXISTS (
      SELECT 1 FROM public.organizacoes o2 WHERE o2.id = public.user_organizacao() AND o2.is_piloto
    );
$$;

GRANT EXECUTE ON FUNCTION public.meus_modulos_comerciais_ativos() TO authenticated;

-- ============ 3. USO FATURÁVEL (usuários ativos + obras ativas) ============
-- Materialized view: soma direta em user_profiles/projetos toda hora que o
-- app precisar do número seria caro em orgs grandes, e o critério de
-- cobrança combinado (usuários + obras) não precisa de dado em tempo real
-- (é usado para fechamento, não para checagem de acesso).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.v_organizacao_uso_faturavel AS
SELECT
  o.id AS organizacao_id,
  count(DISTINCT up.id) FILTER (WHERE up.status_solicitacao = 'aprovado') AS usuarios_ativos,
  count(DISTINCT p.id) FILTER (WHERE p.status = 'ativo') AS obras_ativas,
  now() AS calculado_em
FROM public.organizacoes o
LEFT JOIN public.user_profiles up ON up.organizacao_id = o.id
LEFT JOIN public.projetos p ON p.organizacao_id = o.id
GROUP BY o.id;

CREATE UNIQUE INDEX IF NOT EXISTS v_organizacao_uso_faturavel_org_uidx
  ON public.v_organizacao_uso_faturavel (organizacao_id);

-- Materialized view não aceita RLS (limitação do Postgres) — trava o acesso
-- direto e expõe só via função SECURITY DEFINER, que filtra pela própria
-- organização do usuário (ou todas, se Dono da Plataforma).
REVOKE ALL ON public.v_organizacao_uso_faturavel FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.minha_organizacao_uso_faturavel()
RETURNS TABLE (organizacao_id uuid, usuarios_ativos bigint, obras_ativas bigint, calculado_em timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT v.organizacao_id, v.usuarios_ativos, v.obras_ativas, v.calculado_em
  FROM public.v_organizacao_uso_faturavel v
  WHERE v.organizacao_id = public.user_organizacao() OR public.is_super_admin();
$$;

GRANT EXECUTE ON FUNCTION public.minha_organizacao_uso_faturavel() TO authenticated;

-- Sem GRANT EXECUTE para authenticated de propósito: recalcular a
-- materialized view inteira é caro, não é algo que um usuário comum deveria
-- disparar. Pensada para ser chamada por um job agendado (pg_cron) ou pelo
-- service role — nenhum dos dois passa pelo RLS/PostgREST.
CREATE OR REPLACE FUNCTION public.refresh_uso_faturavel()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_organizacao_uso_faturavel;
$$;

NOTIFY pgrst, 'reload schema';
