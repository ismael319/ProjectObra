#!/usr/bin/env node
// ============================================================================
// migrar-rdr.mjs — Migração do RDR do "Projeto 1" para o ProjectObra
// ----------------------------------------------------------------------------
// Lê os registros do Supabase antigo (hapjuixvwsotcbmpsmyx), sobe as fotos
// (base64 -> bucket privado rdr-fotos) e insere no banco novo do ProjectObra.
//
// PRÉ-REQUISITOS:
//   1. Execute src/lib/rdr-migration.sql no SQL Editor do Supabase do ProjectObra.
//   2. Configure as variáveis de ambiente (PowerShell):
//        $env:PROJECTOBRA_SUPABASE_URL   = "https://<ref>.supabase.co"
//        $env:PROJECTOBRA_SERVICE_ROLE_KEY = "<service_role do ProjectObra>"
//        $env:ORGANIZACAO_ID             = "<uuid da organização-alvo>"
//      Opcionais:
//        $env:USER_ID                    = "<uuid do usuário que migra>"
//        $env:LIMITE                     = "<n> migra só n registros (teste)"
//   3. Rode: node scripts/migrar-rdr.mjs
//
// A SERVICE ROLE KEY não pode ficar em código nem no repo — é por isso que
// ela entra via variável de ambiente. O script usa o @supabase/supabase-js
// já instalado nas dependências do projeto.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const OLD_URL = "https://hapjuixvwsotcbmpsmyx.supabase.co";
const OLD_ANON = "sb_publishable_4SC7Z5-Ht_RhVAvRaFxyBw_NOE6KaFK";

const NEW_URL = process.env.PROJECTOBRA_SUPABASE_URL;
const NEW_SERVICE_ROLE = process.env.PROJECTOBRA_SERVICE_ROLE_KEY;
const ORGANIZACAO_ID = process.env.ORGANIZACAO_ID;
const USER_ID = process.env.USER_ID ?? null;
const LIMITE = process.env.LIMITE ? Number(process.env.LIMITE) : Infinity;

const BUCKET = "rdr-fotos";

function fail(msg) {
  console.error(`[ERRO] ${msg}`);
  process.exit(1);
}

if (!NEW_URL || !NEW_SERVICE_ROLE || !ORGANIZACAO_ID) {
  fail(
    "Faltam variáveis de ambiente: PROJECTOBRA_SUPABASE_URL, " +
      "PROJECTOBRA_SERVICE_ROLE_KEY e ORGANIZACAO_ID"
  );
}

const oldClient = createClient(OLD_URL, OLD_ANON);
const newClient = createClient(NEW_URL, NEW_SERVICE_ROLE, { auth: { persistSession: false } });

const { data: records, error: errRead } = await oldClient
  .from("rdr_records")
  .select("*")
  .order("saved_at", { ascending: true })
  .limit(LIMITE);

if (errRead) fail(`Falha ao ler registros antigos: ${errRead.message}`);
if (!records?.length) {
  console.log("Nenhum registro encontrado no banco antigo.");
  process.exit(0);
}
console.log(`${records.length} registro(s) lidos do banco antigo.`);

let ok = 0;
let falhas = 0;

for (const rec of records) {
  try {
    // O id antigo é um inteiro (não uuid) — geramos um uuid novo aqui para
    // usar tanto no caminho das fotos quanto na linha da tabela nova.
    const recordId = randomUUID();

    // 1) Fotos base64 -> bucket privado do novo projeto.
    const novasFotos = [];
    const fotosAntigas = Array.isArray(rec.fotos) ? rec.fotos : [];
    for (let i = 0; i < fotosAntigas.length; i++) {
      const f = fotosAntigas[i];
      const dataUrl = typeof f === "string" ? f : f?.url;
      const name = typeof f === "string" ? `foto-${i + 1}.jpg` : (f?.name ?? `foto-${i + 1}.jpg`);
      if (!dataUrl || !dataUrl.startsWith("data:")) continue;

      const header = dataUrl.split(",")[0] ?? "";
      const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      const blob = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
      const path = `${ORGANIZACAO_ID}/${recordId}/${i + 1}-${Date.now()}.${ext}`;

      const { error: upErr } = await newClient.storage.from(BUCKET).upload(path, blob, {
        contentType: mime,
        upsert: true,
      });
      if (upErr) throw new Error(`upload foto: ${upErr.message}`);
      novasFotos.push({ path, name });
    }

    // 2) Insere no banco novo (service role ignora RLS).
    const row = {
      id: recordId,
      organizacao_id: ORGANIZACAO_ID,
      data_ocorrido: rec.data_ocorrido,
      hora: rec.hora ?? "",
      autor_id: USER_ID,
      autor_nome: rec.autor_nome ?? "",
      local: rec.local ?? "",
      categorias: rec.categorias ?? [],
      concluido: rec.concluido ?? "",
      nome_colaborador: rec.nome_colaborador ?? "",
      responsavel_setor: rec.responsavel_setor ?? "",
      responsavel_registro: rec.responsavel_registro ?? "",
      descricao: rec.descricao ?? "",
      sugestao_correcao: rec.sugestao_correcao ?? "",
      prazo: rec.prazo || null,
      fotos: novasFotos,
      criado_por: USER_ID,
      criado_em: rec.saved_at ?? new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    const { error: insErr } = await newClient.from("rdr_records").insert(row);
    if (insErr) throw new Error(`insert: ${insErr.message}`);

    ok++;
    console.log(`[OK] antigo#${rec.id} -> ${recordId} (${rec.data_ocorrido}) fotos: ${novasFotos.length}`);
  } catch (e) {
    falhas++;
    console.error(`[FALHA] antigo#${rec.id}: ${e.message}`);
  }
}

console.log("----------------------------------------");
console.log(`Concluído: ${ok} migrados, ${falhas} com falha.`);
if (falhas > 0) process.exit(1);
