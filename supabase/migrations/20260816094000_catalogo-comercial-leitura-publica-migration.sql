-- ============================================================
-- MIGRAÇÃO: Leitura pública do catálogo comercial (Fase E)
-- Execute este SQL no Supabase SQL Editor do ProjectObra, APÓS
-- rls-feature-gating-comercial-migration.sql
-- ============================================================
-- A página pública de planos (/planos, antes do login) precisa ler
-- modulos_comerciais/planos/plano_modulos sem sessão — as policies de Fase A
-- só liberavam leitura para 'authenticated'. Esta migração é só ADITIVA:
-- cria uma policy nova para 'anon', sem tocar nas policies existentes.
--
-- modulo_precos NÃO entra aqui de propósito: a página pública mostra preço
-- de PLANO (planos.preco_base_mensal), não o preço avulso por módulo — não
-- há necessidade de expor esse detalhe a visitante anônimo ainda.
-- ============================================================

GRANT SELECT ON public.modulos_comerciais TO anon;
DROP POLICY IF EXISTS "Leitura publica catalogo comercial" ON public.modulos_comerciais;
CREATE POLICY "Leitura publica catalogo comercial" ON public.modulos_comerciais
  FOR SELECT TO anon USING (true);

GRANT SELECT ON public.planos TO anon;
DROP POLICY IF EXISTS "Leitura publica planos" ON public.planos;
CREATE POLICY "Leitura publica planos" ON public.planos
  FOR SELECT TO anon USING (true);

GRANT SELECT ON public.plano_modulos TO anon;
DROP POLICY IF EXISTS "Leitura publica plano_modulos" ON public.plano_modulos;
CREATE POLICY "Leitura publica plano_modulos" ON public.plano_modulos
  FOR SELECT TO anon USING (true);

NOTIFY pgrst, 'reload schema';
