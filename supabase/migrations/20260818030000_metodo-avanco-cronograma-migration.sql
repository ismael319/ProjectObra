-- ============================================================
-- MIGRAÇÃO: Método de avanço por cronograma (padrão x por quantidade)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Alguns cronogramas não usam o "% Concluído" nativo do MS Project (calculado
-- a partir do trabalho/HH apontado) — em vez disso, medem avanço físico por
-- quantidade de serviço executada, usando três campos numéricos genéricos do
-- MS Project (Número1 = quantidade total planejada, Número2 = planejada até a
-- data de status, Número3 = executada até a data de status).
--
-- Essa coluna guarda, por cronograma, qual método foi escolhido no upload:
-- 'padrao' (comportamento de sempre) ou 'quantidade' (recalcula o avanço pela
-- fórmula Número3/Número1 — ver applyMetodoAvanco em src/lib/xml-parser.ts).
-- Default 'padrao' preserva o comportamento de todos os cronogramas já
-- cadastrados sem precisar reprocessar nada.
-- ============================================================

ALTER TABLE public.projeto_cronogramas
  ADD COLUMN IF NOT EXISTS metodo_avanco text NOT NULL DEFAULT 'padrao';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projeto_cronogramas_metodo_avanco_check') THEN
    ALTER TABLE public.projeto_cronogramas
      ADD CONSTRAINT projeto_cronogramas_metodo_avanco_check
      CHECK (metodo_avanco IN ('padrao', 'quantidade'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
