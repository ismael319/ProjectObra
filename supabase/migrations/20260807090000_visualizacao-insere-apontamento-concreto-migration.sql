-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Papel "visualizacao" passa a poder INSERIR (nunca editar/excluir) em:
--   - apontamentos_diarios (Distribuição Efetivo)
--   - cargas_concreto / destinos_carga / corpos_prova (Lançamento de Concreto)
-- Mesmo espírito de "insercao_pontual" hoje (só cria, nunca edita/apaga) —
-- na prática "visualizacao" e "insercao_pontual" ficam com a mesma
-- capacidade de INSERT nessas duas telas específicas; UPDATE/DELETE
-- continuam exclusivos de "edicao" em todo lugar, sem mudança.
--
-- DROP POLICY + recriar com o mesmo texto (só troca a lista de papéis) —
-- reversível tirando 'visualizacao' de volta.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ apontamentos_diarios ============

DROP POLICY IF EXISTS "Insert apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Insert apontamentos" ON public.apontamentos_diarios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('edicao', 'insercao_pontual', 'visualizacao'));

-- ============ cargas_concreto ============

DROP POLICY IF EXISTS "Insercao cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Insercao cargas_concreto" ON public.cargas_concreto
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') IN ('edicao', 'insercao_pontual', 'visualizacao')));

-- ============ destinos_carga ============

DROP POLICY IF EXISTS "Insercao destinos_carga" ON public.destinos_carga;
CREATE POLICY "Insercao destinos_carga" ON public.destinos_carga
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') IN ('edicao', 'insercao_pontual', 'visualizacao')));

-- ============ corpos_prova ============
-- Criados na mesma submissão do Lançamento (junto com a carga) quando o
-- usuário preenche a seção de Rastreabilidade — precisa do mesmo acesso.

DROP POLICY IF EXISTS "Insercao corpos_prova" ON public.corpos_prova;
CREATE POLICY "Insercao corpos_prova" ON public.corpos_prova
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel_modulo('qualidade') IN ('edicao', 'insercao_pontual', 'visualizacao')));

NOTIFY pgrst, 'reload schema';
