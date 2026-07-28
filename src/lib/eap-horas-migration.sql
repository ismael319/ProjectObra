-- Migração: horas apontadas na EAP + modelos salvos
-- Execute estas queries no Supabase SQL Editor

-- Guarda a jornada (horas trabalhadas) definida na tela de Validação para cada dia.
-- É por isso que "Horas do dia" hoje não persiste em lugar nenhum: o valor só
-- existia como estado local em Validacao.tsx e nunca era gravado.
CREATE TABLE IF NOT EXISTS dias_trabalho (
  data DATE PRIMARY KEY,
  horas_dia NUMERIC NOT NULL DEFAULT 8,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Modelos de EAP salvos (só a estrutura/hierarquia; as horas são sempre
-- recalculadas ao vivo a partir dos apontamentos validados quando o modelo é aberto).
CREATE TABLE IF NOT EXISTS eap_modelos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  estrutura JSONB NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dias_trabalho ENABLE ROW LEVEL SECURITY;
ALTER TABLE eap_modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON dias_trabalho;
CREATE POLICY "Allow all for authenticated" ON dias_trabalho FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON eap_modelos;
CREATE POLICY "Allow all for authenticated" ON eap_modelos FOR ALL USING (true);

-- GRANTs — sem isso o PostgREST nega o acesso antes mesmo de avaliar a política
-- de RLS acima (mesmo problema que já pegou o Gantt Livre nesta base).
GRANT SELECT, INSERT, UPDATE, DELETE ON dias_trabalho TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON eap_modelos TO anon, authenticated;
