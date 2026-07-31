-- ============================================================
-- MIGRAÇÃO: separa "origem do cronograma" de "Empresa" em activities
-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Até aqui, a coluna `company` era reaproveitada pra guardar o nome do
-- cronograma de origem em atividades importadas (is_extra=false) — não
-- existia campo de Empresa de verdade pra elas (sempre aparecia null na
-- tela, de propósito, pra não confundir "Empresa" com o cronograma).
-- Agora que a importação passa a coletar Empresa/Engenheiro/Etapa de
-- verdade por atividade, essa coluna não pode fazer as duas coisas.
-- ============================================================

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS source_cronograma text;

-- Backfill: o que hoje está em `company` pras atividades importadas é o
-- nome do cronograma, não uma Empresa — move pra coluna nova e limpa
-- `company` (nunca teve Empresa real nessas linhas).
UPDATE public.activities
SET source_cronograma = company,
    company = NULL
WHERE is_extra = false
  AND company IS NOT NULL
  AND source_cronograma IS NULL;
