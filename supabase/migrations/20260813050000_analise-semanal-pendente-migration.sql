-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Fechar a semana (consolidado) e concluir a Análise Semanal viram dois
-- passos distintos: fechar trava status/PPC, mas a semana continua
-- "pendente" (precisando de análise) até alguém revisar o resumo em
-- ModalAnaliseSemana e confirmar explicitamente.
--
-- Sem RPC nova pra marcar/desmarcar — é um UPDATE direto em weeks, mesmo
-- padrão de updateWeekAnalise (programacao-db.ts), já coberto pela policy
-- "Update weeks" existente (Edição no módulo Engenharia).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER TABLE public.weeks ADD COLUMN IF NOT EXISTS analise_concluida boolean NOT NULL DEFAULT false;
ALTER TABLE public.weeks ADD COLUMN IF NOT EXISTS analise_concluida_por uuid REFERENCES auth.users(id);
ALTER TABLE public.weeks ADD COLUMN IF NOT EXISTS analise_concluida_em timestamptz;

NOTIFY pgrst, 'reload schema';
