-- ============================================================
-- MIGRAÇÃO: Nomenclatura SIGA no catálogo comercial (modulos_comerciais)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- A plataforma está sendo reposicionada sob a marca SIGA, com os produtos
-- SIGA Planejamento / SIGA Execução / SIGA Financeiro / SIGA Análise /
-- SIGA Pessoas (mais SIGA Segurança e SIGA Suprimentos, adicionados na
-- validação desta tarefa por não terem produto SIGA definido no documento
-- original). Chatbot IA e WhatsApp RDO continuam como add-ons transversais,
-- sem produto SIGA (fora do escopo desta migração).
--
-- Só o campo de EXIBIÇÃO (`categoria`, usado hoje para agrupar visualmente
-- os módulos na página de Planos) muda. `codigo`, `modulo_rls_key` e demais
-- referências técnicas permanecem intactos — nada disso quebra RLS, FKs ou
-- rotas.
-- ============================================================

UPDATE public.modulos_comerciais SET categoria = 'SIGA Planejamento' WHERE codigo = 'CRONOGRAMA';
UPDATE public.modulos_comerciais SET categoria = 'SIGA Execução' WHERE codigo IN ('GESTAO_VISTA', 'MAPA_SETORES');
UPDATE public.modulos_comerciais SET categoria = 'SIGA Análise' WHERE codigo = 'QUALIDADE';
UPDATE public.modulos_comerciais SET categoria = 'SIGA Pessoas' WHERE codigo = 'RH';
UPDATE public.modulos_comerciais SET categoria = 'SIGA Suprimentos' WHERE codigo = 'SUPRIMENTOS';
-- CHATBOT_IA ('produtividade') e WHATSAPP_RDO ('integracoes') não mudam:
-- são add-ons transversais, sem produto SIGA por decisão do documento.

-- SIGA Financeiro (orçamento, custos, avanço financeiro, EVM) ainda não tem
-- nenhuma tela implementada no código — entra só como item de catálogo
-- 'planejado', sem gate de RLS (modulo_rls_key NULL) e sem preço definido.
INSERT INTO public.modulos_comerciais (codigo, nome, categoria, descricao, tipo_cobranca, modulo_rls_key, modulo_dependencia_id, status, ordem_exibicao) VALUES
  ('FINANCEIRO', 'Financeiro', 'SIGA Financeiro', 'Orçamento, custos, avanço financeiro e EVM. Ainda não implementado — aparece no catálogo para fins comerciais/roadmap.', NULL, NULL, NULL, 'planejado', 25)
ON CONFLICT (codigo) DO NOTHING;

NOTIFY pgrst, 'reload schema';
