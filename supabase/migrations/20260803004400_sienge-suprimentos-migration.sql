-- ============================================================
-- MIGRAÇÃO: Módulo Suprimentos — Alertas Sienge (Solicitações,
-- Pedidos de Compra e Contratos importados do ERP Sienge)
-- Execute no Supabase SQL Editor do ProjectObra.
-- IMPORTANTE: execute APÓS multi-tenant-fase1-migration.sql e
-- modulos-plataforma-migration.sql (usa user_organizacao() e
-- user_tem_modulo(), criadas lá).
-- ============================================================
-- Porta o mini-app Python "SiengeAlertas" (Flask + SQLite local) para dentro
-- do ProjectObra como módulo pago novo. Cada relatório importado (XLSX/CSV
-- por enquanto — PDF fica pra depois) fica amarrado à obra (projeto_id)
-- selecionada, e as anotações (status/nota/lembrete/sinalizado) persistem
-- por item entre reimportações via a chave de negócio do item.
-- ============================================================

-- ============ 1. CATÁLOGO: NOVO MÓDULO "SUPRIMENTOS" ============
-- A tela de Empresas Clientes (src/pages/admin/OrganizacoesManagement.tsx) já
-- lê a tabela `modulos` dinamicamente e monta o toggle por empresa sozinha —
-- nenhuma tela nova precisa ser criada.

INSERT INTO public.modulos (key, nome, descricao) VALUES
  ('suprimentos', 'Suprimentos', 'Alertas de Solicitações, Pedidos de Compra e Contratos importados do Sienge')
ON CONFLICT (key) DO NOTHING;

-- ============ 2. TABELAS ============
-- organizacao_id fica denormalizado nas 3 tabelas (igual a `projetos`), em
-- vez de derivado por JOIN (como `projeto_cronogramas` faz): sienge_itens
-- pode chegar a dezenas de milhares de linhas por importação, e a policy de
-- RLS não pode pagar um EXISTS(...) por linha em todo SELECT/UPDATE.
-- projeto_id continua presente pro filtro de obra na aplicação e pra
-- integridade referencial.

CREATE TABLE public.sienge_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  tipo_relatorio text NOT NULL CHECK (tipo_relatorio IN ('solicitacoes','pedidos','contratos')),
  arquivo_nome text NOT NULL,
  total_itens integer NOT NULL DEFAULT 0,
  importado_por uuid REFERENCES auth.users(id),
  importado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sienge_importacoes_projeto_tipo_idx
  ON public.sienge_importacoes (projeto_id, tipo_relatorio, importado_em DESC);

CREATE TABLE public.sienge_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  importacao_id uuid NOT NULL REFERENCES public.sienge_importacoes(id) ON DELETE CASCADE,
  tipo_relatorio text NOT NULL CHECK (tipo_relatorio IN ('solicitacoes','pedidos','contratos')),
  chave text NOT NULL,
  insumo text NOT NULL DEFAULT '',
  obra text NOT NULL DEFAULT '',
  data text NOT NULL DEFAULT '',             -- DD/MM/YYYY (texto — "dias" é sempre recalculado no client)
  solicitante text NOT NULL DEFAULT '',
  solicitacao text NOT NULL DEFAULT '',
  autorizado boolean NOT NULL DEFAULT true,
  dt_aut text NOT NULL DEFAULT '',
  qt_pendente text NOT NULL DEFAULT '',
  unidade text NOT NULL DEFAULT '',
  qt_atendida text NOT NULL DEFAULT '',
  sd text NOT NULL DEFAULT '',
  dt_previsao text NOT NULL DEFAULT '',
  dt_atend text NOT NULL DEFAULT '',
  fornecedor text NOT NULL DEFAULT '',
  numero_pedido text NOT NULL DEFAULT '',
  preco_unitario text NOT NULL DEFAULT '',
  total_item text NOT NULL DEFAULT '',
  contrato text NOT NULL DEFAULT '',
  objeto text NOT NULL DEFAULT '',
  empresa text NOT NULL DEFAULT '',
  obras text NOT NULL DEFAULT '',
  situacao text NOT NULL DEFAULT '',
  saldo text NOT NULL DEFAULT '',
  total text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sienge_itens_importacao_idx ON public.sienge_itens (importacao_id);
CREATE INDEX sienge_itens_projeto_tipo_chave_idx ON public.sienge_itens (projeto_id, tipo_relatorio, chave);

CREATE TABLE public.sienge_anotacoes (
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  tipo_relatorio text NOT NULL CHECK (tipo_relatorio IN ('solicitacoes','pedidos','contratos')),
  chave text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  nota text NOT NULL DEFAULT '',
  lembrete_data date,
  sinalizado boolean NOT NULL DEFAULT false,
  atualizado_por uuid REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projeto_id, tipo_relatorio, chave)
);
-- PK composta (projeto_id, tipo_relatorio, chave): `chave` sozinha (como no
-- SQLite original) colidiria entre obras diferentes e, em tese, entre tipos
-- de relatório diferentes. Melhoria deliberada sobre o schema original, sem
-- mudar nenhum comportamento visível — a UI já é sempre "por obra
-- selecionada, por aba de tipo".

-- ============ 3. RLS + GRANT ============

ALTER TABLE public.sienge_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sienge_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sienge_anotacoes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sienge_importacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sienge_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sienge_anotacoes TO authenticated;

-- ---------- sienge_importacoes ----------
DROP POLICY IF EXISTS "Acesso importacoes da organizacao" ON public.sienge_importacoes;
CREATE POLICY "Acesso importacoes da organizacao" ON public.sienge_importacoes
  FOR ALL TO authenticated
  USING (organizacao_id = public.user_organizacao())
  WITH CHECK (organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Restringe pelo modulo suprimentos" ON public.sienge_importacoes;
CREATE POLICY "Restringe pelo modulo suprimentos" ON public.sienge_importacoes
  AS RESTRICTIVE FOR ALL TO public USING (public.user_tem_modulo('suprimentos'));

-- ---------- sienge_itens ----------
DROP POLICY IF EXISTS "Acesso itens da organizacao" ON public.sienge_itens;
CREATE POLICY "Acesso itens da organizacao" ON public.sienge_itens
  FOR ALL TO authenticated
  USING (organizacao_id = public.user_organizacao())
  WITH CHECK (organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Restringe pelo modulo suprimentos" ON public.sienge_itens;
CREATE POLICY "Restringe pelo modulo suprimentos" ON public.sienge_itens
  AS RESTRICTIVE FOR ALL TO public USING (public.user_tem_modulo('suprimentos'));

-- ---------- sienge_anotacoes ----------
DROP POLICY IF EXISTS "Acesso anotacoes da organizacao" ON public.sienge_anotacoes;
CREATE POLICY "Acesso anotacoes da organizacao" ON public.sienge_anotacoes
  FOR ALL TO authenticated
  USING (organizacao_id = public.user_organizacao())
  WITH CHECK (organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Restringe pelo modulo suprimentos" ON public.sienge_anotacoes;
CREATE POLICY "Restringe pelo modulo suprimentos" ON public.sienge_anotacoes
  AS RESTRICTIVE FOR ALL TO public USING (public.user_tem_modulo('suprimentos'));

-- ============ 4. PASSO MANUAL PÓS-MIGRAÇÃO ============
-- Diferente de "engenharia"/"seguranca", "Suprimentos" é módulo pago novo e
-- NÃO tem backfill automático pra empresa piloto. Depois de rodar esta
-- migração: /dashboard/admin (Empresas Clientes) > sua empresa > ligar o
-- toggle "Suprimentos" — senão RequireModulo bloqueia a tela mesmo pra você.
