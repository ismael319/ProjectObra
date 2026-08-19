-- ============================================================
-- MIGRAÇÃO: Documenta por que vw_projeto_kpis é SECURITY DEFINER
-- de propósito, pra o alerta do Security Advisor não ser
-- confundido com o bug já corrigido em
-- 20260817000000_corrige-security-definer-views.sql.
-- ============================================================
-- Não muda comportamento nenhum, só deixa registrado no próprio banco
-- (visível em qualquer client SQL / painel) o motivo de continuar assim.

COMMENT ON VIEW public.vw_projeto_kpis IS
'SECURITY DEFINER intencional: le de projeto_kpis_snapshot (materialized '
'view, sem suporte a RLS, por isso REVOKE ALL de authenticated/anon nela). '
'Esta view roda como dono para contornar esse REVOKE, mas replica o filtro '
'de RLS manualmente no WHERE (mesma regra de projetos: is_super_admin() OR '
'organizacao_id = user_organizacao() AND user_ve_projeto()). Alerta '
'"Security Definer View" do Supabase Advisor é esperado aqui e pode ser '
'ignorado -- ver 20260817000000_corrige-security-definer-views.sql.';

NOTIFY pgrst, 'reload schema';
