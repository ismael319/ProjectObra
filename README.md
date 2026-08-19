# SIGA SOLUÇÕES — Gestão de Obras

Sistema de gestão de obras para engenharia civil: planejamento (Gantt, Curva S, programação semanal),
apontamento de mão de obra, controle de efetivo, segurança do trabalho (RDR), qualidade do concreto,
módulo Sienge (suprimentos) e visão geral da obra.

- **Frontend:** React 18 + TypeScript + Vite
- **Estilo:** Tailwind CSS v4 + Radix UI + shadcn-style components
- **Dados:** Supabase (PostgreSQL + Auth + RLS)
- **Estado:** Zustand + TanStack Query
- **Gráficos/relatórios:** Recharts, jsPDF, html2canvas, SheetJS (`xlsx` carregado sob demanda)
- **Deploy:** Vercel (SPA + funções serverless em `/api`)

## Como rodar localmente

Pré-requisitos: Node.js 20+ e npm.

```bash
npm install
```

Crie o arquivo `.env` na raiz (veja a tabela abaixo) e inicie o servidor de desenvolvimento:

```bash
npm run dev
```

O Vite sobe em `http://localhost:5173` por padrão.

## Variáveis de ambiente

### Cliente (`.env`, expostas ao navegador)

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima (pública) do Supabase |

### Serverless (`/api`, configuradas no painel da Vercel — nunca no cliente)

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima (pública) do Supabase |
| `GROQ_API_KEY` | Chave da API Groq (usada no chat — `api/chat.ts`) |
| `TURNSTILE_SECRET_KEY` | Chave secreta do Cloudflare Turnstile (`api/validate-turnstile.ts`) |
| `CHAT_MAX_POR_JANELA` | Opcional — limite de mensagens do assistente por janela (padrão `20`) |
| `CHAT_JANELA_MINUTOS` | Opcional — janela do rate limit do chat em minutos (padrão `60`) |

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Typecheck (`tsc -b`) + build de produção Vite |
| `npm run lint` | Lint com Oxlint |
| `npm test` | Testes unitários (Vitest) |
| `npm run preview` | Serve o build de produção localmente |

## CI

Pipeline em `.github/workflows/ci.yml` (GitHub Actions), executada em push para `main` e pull requests:

1. **Lint e testes** — `npm ci`, `npm run lint`, `npm test` (Vitest)
2. **Build** — `npm run build` (typecheck `tsc -b` + build Vite)

O deploy em produção continua pela Vercel; o CI apenas valida que o código está saudável antes de merge.

## Banco de dados

O esquema é gerenciado por **migrations SQL** em `supabase/migrations/` (nomeadas por timestamp,
padrão do Supabase CLI), aplicadas manualmente no Supabase SQL Editor. A maioria é **idempotente**
(`DROP ... IF EXISTS` + `CREATE ...`), então pode ser re-executada com segurança.

Scripts de consulta/diagnóstico (somente leitura) ficam em `supabase/diagnostics/` — **não** são
migrations.

Ordem recomendada ao montar um banco novo (os timestamps já refletem esta ordem):

1. Schema base de autenticação/perfis e segurança: `acesso-3-niveis`, `funcao-usuario`,
   `modulos-plataforma`, `modulos-visiveis`, `user-approval`, `rls`, `rate-limit`
   (inclui o rate limit do chat), `fix-signup-500`, `consentimento-lgpd`, `exclusao-conta`,
   `excluir-usuario`, `audit-logs`, `pendentes-consolidado`
2. Multi-tenant e projetos: `multi-tenant-fase1`, `projetos-acesso-edicao`, `projetos-grant-fix`
3. Módulos específicos (cada um com suas dependências — ex.: gantt, programação, apontamento,
   administração, rdr, sienge, mapa-chuvas, concreto). Confira o estado do banco com
   `supabase/diagnostics/check-migrations.sql`.

> Aviso: as migrations são aplicadas manualmente no SQL Editor — não há tracking automático do
> que já rodou em cada projeto. Rode as novas em ordem de timestamp.

## Deploy

O projeto é configurado para a **Vercel** (`vercel.json`): build via `npm run build`, saída em
`dist/`, rewrites de SPA para `index.html` e headers de segurança globais (incluindo
Content-Security-Policy). As funções em `/api/`
são deployadas como serverless functions; as variáveis de ambiente serverless devem ser
cadastradas no painel da Vercel (Project Settings → Environment Variables).

## Estrutura

```
src/
  components/      Componentes de UI compartilhados
  lib/             Lógica de domínio, store e integrações
  pages/           Telas da aplicação
  api/             Funções serverless (Vercel)
supabase/
  migrations/      Migrations SQL nomeadas por timestamp
  diagnostics/     Scripts de consulta/diagnóstico (somente leitura)
```

## Permissões

O controle de acesso usa perfis (`user_papel()`, ex.: `edicao`), módulos visíveis por papel e
flag `is_super_admin`. Novas rotas restritas devem ser protegidas com `RequirePapel`
(`src/components/RequirePapel.tsx`) ou no `ProtectedRoute`.
