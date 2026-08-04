-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS activity-subetapas-migration.sql
--
-- Sub-etapa passa de um booleano (concluida sim/não) pra um status de 3 estados
-- (pendente/concluida/nao_concluida) — o problema do booleano: toda sub-etapa
-- recém-criada (ou ainda não realizada, ex.: prevista pra mais tarde no dia)
-- contava como "não concluída" no cálculo automático do status da atividade
-- (computeStatusFromSubetapas), puxando a atividade pra "não concluída"/"parcial"
-- antes da hora. Com o status "pendente" como estado neutro, o cálculo passa a
-- esperar todas as sub-etapas serem resolvidas (concluída ou não) antes de
-- derivar o status da atividade.
--
-- A coluna `concluida` continua existindo (não migramos os dados pra apagá-la),
-- só deixa de ser usada pelo app — todo concluida=true vira status='concluida' no
-- backfill abaixo; o resto (concluida=false, hoje ambíguo entre "nunca foi
-- marcada" e "explicitamente não feita") vira 'pendente', que é o comportamento
-- correto pra sub-etapa recém-criada.

ALTER TABLE public.activity_subetapas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'concluida', 'nao_concluida'));

UPDATE public.activity_subetapas SET status = 'concluida' WHERE concluida = true;

NOTIFY pgrst, 'reload schema';
