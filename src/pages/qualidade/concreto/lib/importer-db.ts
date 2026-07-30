// Chamadas ao Supabase usadas pela importação histórica (ImportarHistorico.tsx).
// Transformação pura fica em importer.ts — aqui só é resolução de catálogo
// (Área/Setor real do Apontamento / Fornecedor / Traço) e gravação em lote.
//
// Mapeamento (confirmado com o cliente): PROJETO da BDConcreto é uma ÁREA do
// Apontamento (não um Setor) — cada Área já pertence a um Setor real, então
// ao casar por nome herdamos o Setor dela automaticamente. APLICAÇÃO NA
// ETAPA DA OBRA vira Etapa (subárea) dentro dessa Área, usando a mesma
// cascata Setor→Área→Etapa já existente, sem inventar nível novo.

import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "@/lib/administracao/parse-shared";
import {
  TRACOS_CANONICOS,
  FORNECEDOR_PROPRIA_NOME,
  FORNECEDOR_EXTERNA_NOME,
  type CargaAgrupada,
} from "./importer";

const TAMANHO_LOTE = 500;

// ---------- Setores (só usado como opção de Setor-pai ao criar uma Área nova) ----------

export type SetorCatalogo = { id: string; nome: string };

export async function carregarSetores(): Promise<SetorCatalogo[]> {
  const { data, error } = await supabase.from("setores").select("id,nome").eq("ativo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as SetorCatalogo[];
}

// ---------- Áreas (catálogo global do Apontamento — casamos em QUALQUER Setor) ----------

export type AreaCatalogo = { id: string; setor_id: string; nome: string; setorNome: string };

export async function carregarAreas(): Promise<AreaCatalogo[]> {
  const [{ data: areas, error: errAreas }, { data: setores, error: errSetores }] = await Promise.all([
    supabase.from("areas").select("id,setor_id,nome").eq("ativo", true),
    supabase.from("setores").select("id,nome").eq("ativo", true),
  ]);
  if (errAreas) throw new Error(errAreas.message);
  if (errSetores) throw new Error(errSetores.message);
  const nomeSetor = new Map((setores ?? []).map((s) => [(s as { id: string }).id, (s as { nome: string }).nome]));
  return ((areas ?? []) as { id: string; setor_id: string; nome: string }[]).map((a) => ({
    ...a,
    setorNome: nomeSetor.get(a.setor_id) ?? "?",
  }));
}

/** Resolução escolhida pelo usuário na tela de revisão pra um valor de PROJETO. */
export type ResolucaoArea =
  | { tipo: "match"; areaId: string; setorId: string }
  | { tipo: "criar"; setorId: string; nome: string }
  | { tipo: "pular" };

export type MapeamentoAreas = Map<string, ResolucaoArea>; // chave: normalizarTexto(projetoRaw)

/** Casa cada PROJETO distinto contra as Áreas reais (em qualquer Setor); o que não bater fica pra revisão manual. */
export function sugerirMapeamentoAreas(projetosDistintos: string[], areas: AreaCatalogo[]): {
  sugestao: MapeamentoAreas;
  semCorrespondencia: string[];
} {
  const porNomeNorm = new Map(areas.map((a) => [normalizarTexto(a.nome), a]));
  const sugestao: MapeamentoAreas = new Map();
  const semCorrespondencia: string[] = [];
  for (const projeto of projetosDistintos) {
    const chave = normalizarTexto(projeto);
    const area = porNomeNorm.get(chave);
    if (area) sugestao.set(chave, { tipo: "match", areaId: area.id, setorId: area.setor_id });
    else semCorrespondencia.push(projeto);
  }
  return { sugestao, semCorrespondencia };
}

// ---------- Subáreas / Etapa (catálogo global, filho de Área — criadas automaticamente) ----------

type SubareaCatalogo = { id: string; area_id: string; nome: string };

class ResolvedorDeSubareas {
  private porChave = new Map<string, string>(); // `${areaId}::${normNome}` -> subareaId
  private carregado = false;
  criadas = 0;

  private async carregarSeNecessario() {
    if (this.carregado) return;
    const { data, error } = await supabase.from("subareas").select("id,area_id,nome").eq("ativo", true);
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as SubareaCatalogo[]) {
      this.porChave.set(`${s.area_id}::${normalizarTexto(s.nome)}`, s.id);
    }
    this.carregado = true;
  }

  async resolverOuCriar(areaId: string, nome: string): Promise<string> {
    await this.carregarSeNecessario();
    const chave = `${areaId}::${normalizarTexto(nome)}`;
    const existente = this.porChave.get(chave);
    if (existente) return existente;

    const { data, error } = await supabase.from("subareas").insert({ area_id: areaId, nome }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? `Falha ao criar etapa "${nome}".`);
    const id = (data as { id: string }).id;
    this.porChave.set(chave, id);
    this.criadas++;
    return id;
  }
}

// ---------- Fornecedores/Traços (catálogos por organização) ----------

async function resolverOuCriarFornecedor(organizacaoId: string, nome: string, tipo: "propria" | "externa"): Promise<string> {
  const { data: existentes, error: errBusca } = await supabase
    .from("fornecedores_concreto")
    .select("id,nome")
    .eq("organizacao_id", organizacaoId);
  if (errBusca) throw new Error(errBusca.message);
  const achado = (existentes ?? []).find((f) => normalizarTexto((f as { nome: string }).nome) === normalizarTexto(nome));
  if (achado) return (achado as { id: string }).id;

  const { data, error } = await supabase
    .from("fornecedores_concreto")
    .insert({ organizacao_id: organizacaoId, nome, tipo })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? `Falha ao criar fornecedor "${nome}".`);
  return (data as { id: string }).id;
}

async function resolverOuCriarTracos(organizacaoId: string): Promise<Map<string, string>> {
  const { data: existentes, error: errBusca } = await supabase
    .from("tracos_concreto")
    .select("id,nome")
    .eq("organizacao_id", organizacaoId);
  if (errBusca) throw new Error(errBusca.message);
  const mapa = new Map<string, string>();
  for (const t of (existentes ?? []) as { id: string; nome: string }[]) mapa.set(t.nome.toUpperCase(), t.id);

  for (const canonico of TRACOS_CANONICOS) {
    if (mapa.has(canonico.nome)) continue;
    const { data, error } = await supabase
      .from("tracos_concreto")
      .insert({
        organizacao_id: organizacaoId,
        nome: canonico.nome,
        fck_mpa: canonico.fckMpa,
        consumo_cimento_kg_m3: canonico.consumo_cimento_kg_m3,
        consumo_brita00_kg_m3: canonico.consumo_brita00_kg_m3,
        consumo_brita01_kg_m3: canonico.consumo_brita01_kg_m3,
        consumo_po_brita_kg_m3: canonico.consumo_po_brita_kg_m3,
        consumo_areia_kg_m3: canonico.consumo_areia_kg_m3,
        consumo_agua_l_m3: canonico.consumo_agua_l_m3,
        consumo_aditivo1_l_m3: canonico.consumo_aditivo1_l_m3,
        consumo_aditivo2_l_m3: canonico.consumo_aditivo2_l_m3,
        preco_unitario_m3: canonico.preco_unitario_m3,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? `Falha ao criar traço "${canonico.nome}".`);
    mapa.set(canonico.nome, (data as { id: string }).id);
  }
  return mapa;
}

// ---------- Commit em lote ----------

export type ResumoImportacaoConcreto = {
  cargasCriadas: number;
  destinosCriados: number;
  cargasPuladas: number;
  areasCriadas: number;
  etapasCriadas: number;
};

export async function commitarImportacaoConcreto(params: {
  organizacaoId: string;
  userId?: string;
  userNome?: string;
  cargas: CargaAgrupada[];
  mapeamentoAreas: MapeamentoAreas; // chave: normalizarTexto(projetoRaw)
}): Promise<ResumoImportacaoConcreto> {
  const { organizacaoId, userId, userNome, cargas, mapeamentoAreas } = params;

  const [fornecedorPropriaId, fornecedorExternaId, tracoPorNome] = await Promise.all([
    resolverOuCriarFornecedor(organizacaoId, FORNECEDOR_PROPRIA_NOME, "propria"),
    resolverOuCriarFornecedor(organizacaoId, FORNECEDOR_EXTERNA_NOME, "externa"),
    resolverOuCriarTracos(organizacaoId),
  ]);

  const resolvedorSubareas = new ResolvedorDeSubareas();
  let areasCriadas = 0;

  type CargaRow = Record<string, unknown>;
  type DestinoRow = Record<string, unknown>;
  const cargaRows: CargaRow[] = [];
  const destinoRows: DestinoRow[] = [];
  let cargasPuladas = 0;

  for (const carga of cargas) {
    const fornecedorId = carga.tipoOrigem === "propria" ? fornecedorPropriaId : fornecedorExternaId;
    const tracoId = tracoPorNome.get(carga.tracoNome);
    if (!tracoId) {
      cargasPuladas++;
      continue;
    }

    const destinosResolvidos: DestinoRow[] = [];
    for (const destino of carga.destinos) {
      const resolucao = mapeamentoAreas.get(normalizarTexto(destino.projetoRaw));
      if (!resolucao || resolucao.tipo === "pular") continue;

      let setorId: string;
      let areaId: string;
      if (resolucao.tipo === "match") {
        setorId = resolucao.setorId;
        areaId = resolucao.areaId;
      } else {
        setorId = resolucao.setorId;
        const { data, error } = await supabase.from("areas").insert({ setor_id: setorId, nome: resolucao.nome }).select("id").single();
        if (error || !data) throw new Error(error?.message ?? `Falha ao criar área "${resolucao.nome}".`);
        areaId = (data as { id: string }).id;
        areasCriadas++;
        mapeamentoAreas.set(normalizarTexto(destino.projetoRaw), { tipo: "match", areaId, setorId });
      }

      let subareaId: string | null = null;
      if (destino.etapaNorm) {
        subareaId = await resolvedorSubareas.resolverOuCriar(areaId, destino.etapaNorm);
      }

      destinosResolvidos.push({
        id: crypto.randomUUID(),
        organizacao_id: organizacaoId,
        carga_id: "", // preenchido abaixo, depois que o id da carga é gerado
        setor_id: setorId,
        area_id: areaId,
        subarea_id: subareaId,
        quantidade_m3_aplicada: destino.quantidadeM3Aplicada,
        observacao: destino.observacao || null,
      });
    }

    if (destinosResolvidos.length === 0) {
      cargasPuladas++;
      continue;
    }

    const cargaId = crypto.randomUUID();
    for (const d of destinosResolvidos) d.carga_id = cargaId;
    destinoRows.push(...destinosResolvidos);

    cargaRows.push({
      id: cargaId,
      organizacao_id: organizacaoId,
      data: carga.data,
      fornecedor_id: fornecedorId,
      tipo_origem: carga.tipoOrigem,
      numero_carga: carga.numeroCarga,
      traco_id: tracoId,
      quantidade_m3: carga.quantidadeM3,
      peso_bruto_teorico_kg: carga.computed.peso_bruto_teorico_kg,
      peso_balanca_kg: carga.computed.peso_balanca_kg,
      perda_kg: carga.computed.perda_kg,
      perda_pct: carga.computed.perda_pct,
      preco_unitario: carga.computed.preco_unitario,
      preco_total: carga.computed.preco_total,
      validado: true, // histórico: já é dado consolidado, não passa pela fila de validação
      validado_em: new Date().toISOString(),
      criado_por: userId ?? null,
      criado_por_nome: userNome ?? "Importação histórica",
      ano_mes: carga.computed.ano_mes,
      ano_semana: carga.computed.ano_semana,
    });
  }

  for (let i = 0; i < cargaRows.length; i += TAMANHO_LOTE) {
    const lote = cargaRows.slice(i, i + TAMANHO_LOTE);
    const { error } = await supabase.from("cargas_concreto").insert(lote);
    if (error) throw new Error(`Falha ao gravar cargas (lote ${i}): ${error.message}`);
  }
  for (let i = 0; i < destinoRows.length; i += TAMANHO_LOTE) {
    const lote = destinoRows.slice(i, i + TAMANHO_LOTE);
    const { error } = await supabase.from("destinos_carga").insert(lote);
    if (error) throw new Error(`Falha ao gravar destinos (lote ${i}): ${error.message}`);
  }

  return {
    cargasCriadas: cargaRows.length,
    destinosCriados: destinoRows.length,
    cargasPuladas,
    areasCriadas,
    etapasCriadas: resolvedorSubareas.criadas,
  };
}
