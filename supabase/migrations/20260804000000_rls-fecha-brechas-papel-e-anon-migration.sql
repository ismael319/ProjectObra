-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Fecha brechas de RLS encontradas numa auditoria: tabelas com política
-- "FOR ALL" que só checava organizacao_id (ou nem isso), sem checar
-- user_papel() — na prática, um usuário "visualizacao" (deveria ser só
-- leitura) conseguia INSERT/UPDATE/DELETE via API direta, mesmo sem botão
-- nenhum na tela pra isso. Mesma classe de bug já corrigida antes em
-- projetos/projeto_cronogramas (projetos-acesso-edicao-migration.sql).
--
-- Confirmado antes de mexer: usuários "insercao_pontual" só têm acesso, na
-- Sidebar, a Distribuição Efetivo > Lançamento (ver src/components/
-- Sidebar.tsx, navSectionsInsercaoPontual) — não têm caminho de UI pra RDR,
-- Suprimentos (Sienge), Mapa de Chuvas ou EAP. Restringir escrita dessas
-- tabelas a "edicao" não tira nenhuma função que esse papel já usava.
--
-- ============ 1. RDR (rdr_records, rdr_config) ============

DROP POLICY IF EXISTS "Acesso rdr_records da organizacao" ON public.rdr_records;
CREATE POLICY "Leitura rdr_records da organizacao" ON public.rdr_records
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());
CREATE POLICY "Edicao gerencia rdr_records" ON public.rdr_records
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()));

DROP POLICY IF EXISTS "Acesso rdr_config da organizacao" ON public.rdr_config;
CREATE POLICY "Leitura rdr_config da organizacao" ON public.rdr_config
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());
CREATE POLICY "Edicao gerencia rdr_config" ON public.rdr_config
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()));

-- ============ 2. SUPRIMENTOS (sienge_importacoes, sienge_itens, sienge_anotacoes) ============

DROP POLICY IF EXISTS "Acesso importacoes da organizacao" ON public.sienge_importacoes;
CREATE POLICY "Leitura importacoes da organizacao" ON public.sienge_importacoes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());
CREATE POLICY "Edicao gerencia importacoes" ON public.sienge_importacoes
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()));

DROP POLICY IF EXISTS "Acesso itens da organizacao" ON public.sienge_itens;
CREATE POLICY "Leitura itens da organizacao" ON public.sienge_itens
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());
CREATE POLICY "Edicao gerencia itens" ON public.sienge_itens
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()));

DROP POLICY IF EXISTS "Acesso anotacoes da organizacao" ON public.sienge_anotacoes;
CREATE POLICY "Leitura anotacoes da organizacao" ON public.sienge_anotacoes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());
CREATE POLICY "Edicao gerencia anotacoes" ON public.sienge_anotacoes
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()));

-- ============ 3. MAPA DE CHUVAS / EAP (mapa_chuvas, dias_trabalho, eap_modelos) ============
-- Estas 3 tabelas são de uma época anterior ao multi-tenant — não têm
-- organizacao_id (dado hoje é global, compartilhado por todas as empresas),
-- e a policy "Allow all for authenticated" tinha GRANT até pra "anon"
-- (usuário nem logado). Aqui só fecho o buraco óbvio (anon + escrita sem
-- checar papel) SEM mudar quem vê o quê — isolar por organização exigiria
-- adicionar organizacao_id, decidir o que fazer com os dados já existentes
-- (hoje compartilhados) e atualizar as telas que consultam essas tabelas;
-- isso é uma mudança de comportamento maior, deixada de fora de propósito
-- pra não alterar o funcionamento atual sem combinar antes.

REVOKE ALL ON public.mapa_chuvas FROM anon;
REVOKE ALL ON public.dias_trabalho FROM anon;
REVOKE ALL ON public.eap_modelos FROM anon;

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.mapa_chuvas;
CREATE POLICY "Leitura mapa_chuvas" ON public.mapa_chuvas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Edicao gerencia mapa_chuvas" ON public.mapa_chuvas
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.user_papel() = 'edicao')
  WITH CHECK (public.is_super_admin() OR public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.dias_trabalho;
CREATE POLICY "Leitura dias_trabalho" ON public.dias_trabalho
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Edicao gerencia dias_trabalho" ON public.dias_trabalho
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.user_papel() = 'edicao')
  WITH CHECK (public.is_super_admin() OR public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.eap_modelos;
CREATE POLICY "Leitura eap_modelos" ON public.eap_modelos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Edicao gerencia eap_modelos" ON public.eap_modelos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.user_papel() = 'edicao')
  WITH CHECK (public.is_super_admin() OR public.user_papel() = 'edicao');

NOTIFY pgrst, 'reload schema';
