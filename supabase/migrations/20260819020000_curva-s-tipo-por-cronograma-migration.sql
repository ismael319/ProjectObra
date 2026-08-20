-- ============================================================
-- MIGRAÇÃO: Tipo de Curva S por cronograma (por trabalho/HH x por peso)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Qual das duas curvas (a existente, por trabalho/HH, ou a nova por peso
-- atribuído — ver 20260819010000_curva-s-peso-fundacao-migration.sql) a tela
-- de Curva S deve mostrar pra um cronograma. Escolhido no Gerenciar
-- Cronograma (junto do método de avanço e da data de status), não na própria
-- tela da Curva S — a tela só lê essa configuração e decide sozinha qual
-- motor usar (src/lib/curve-utils.ts ou src/lib/curva-s-peso.ts).
-- Default 'hh' preserva o comportamento de todo cronograma já cadastrado.
-- ============================================================

ALTER TABLE public.projeto_cronogramas
  ADD COLUMN IF NOT EXISTS tipo_curva_s text NOT NULL DEFAULT 'hh';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projeto_cronogramas_tipo_curva_s_check') THEN
    ALTER TABLE public.projeto_cronogramas
      ADD CONSTRAINT projeto_cronogramas_tipo_curva_s_check
      CHECK (tipo_curva_s IN ('hh', 'peso'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
