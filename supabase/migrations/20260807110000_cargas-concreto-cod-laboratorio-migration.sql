-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Rastreabilidade de Concreto vira um fluxo em 2 etapas:
--   1. Lançamento da carga — só pede um "Cod. Laboratório" (referência
--      solta, ex. número de protocolo/pedido do laboratório), opcional.
--   2. Ensaios > Importar resultados — o PDF do relatório é onde os corpos
--      de prova de verdade são criados (cada um com SEU PRÓPRIO número de
--      laboratório, ex. 436014/436015/..., diferente entre si), casando com
--      a carga por Nota Fiscal + Data de Moldagem (sem mudança nessa etapa).
--
-- Antes, o campo "Cod. Laboratório Tecnológico" do Lançamento copiava o
-- MESMO valor pro numero_lab de todos os corpos de prova da carga — impreciso,
-- já que cada CP tem um código próprio no relatório real. Agora vira campo
-- direto em cargas_concreto: só uma anotação/referência da carga, não uma
-- chave de busca (a ligação com o PDF continua sendo Nota Fiscal + Data).
--
-- Idempotente — seguro rodar mais de uma vez.

ALTER TABLE public.cargas_concreto ADD COLUMN IF NOT EXISTS cod_laboratorio text;

NOTIFY pgrst, 'reload schema';
