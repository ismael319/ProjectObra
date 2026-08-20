import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { useFornecedoresConcreto, useAreasConcreto } from "./lib/catalog";
import { downloadNodeAsA4Png, downloadNodeAsPdf } from "@/lib/png-export";
import { CHART_COLORS } from "@/lib/chart-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/lib/use-media-query";
import { Download, FileText, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

const COLORS = CHART_COLORS;

type Carga = { id: string; data: string; ano_mes: string | null; fornecedor_id: string; quantidade_m3: number | string };
type Destino = { carga_id: string; area_concreto_id: string | null; quantidade_m3_aplicada: number | string };

function formatAnoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  return `${mes}/${ano}`;
}

// Nome de área é texto livre e pode ser longo ("CASA DE MÁQUINAS /
// RECEBIMENTO") — rótulo do eixo X do gráfico "Concreto / Área" quebra em
// várias linhas horizontais pra caber na largura da própria coluna da barra
// (nome completo continua no tooltip ao passar o mouse). SVG <text> não
// quebra linha sozinho, então a quebra é calculada aqui por contagem de
// caracteres, preservando palavras inteiras quando cabem; o que sobra além
// de MAX_LINHAS vira reticências na última linha.
const CHARS_POR_LINHA_AREA = 11;
const MAX_LINHAS_AREA = 3;

function quebrarNomeArea(nome: string): string[] {
  const palavras = nome.split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const proximo = atual ? `${atual} ${palavra}` : palavra;
    if (proximo.length <= CHARS_POR_LINHA_AREA) {
      atual = proximo;
      continue;
    }
    if (atual) linhas.push(atual);
    // palavra sozinha maior que o limite da linha: quebra em pedaços
    let resto = palavra;
    while (resto.length > CHARS_POR_LINHA_AREA) {
      linhas.push(resto.slice(0, CHARS_POR_LINHA_AREA));
      resto = resto.slice(CHARS_POR_LINHA_AREA);
    }
    atual = resto;
  }
  if (atual) linhas.push(atual);

  if (linhas.length <= MAX_LINHAS_AREA) return linhas;
  const cortadas = linhas.slice(0, MAX_LINHAS_AREA);
  const ultima = cortadas[MAX_LINHAS_AREA - 1]!;
  cortadas[MAX_LINHAS_AREA - 1] = ultima.length >= CHARS_POR_LINHA_AREA
    ? `${ultima.slice(0, CHARS_POR_LINHA_AREA - 1)}…`
    : `${ultima}…`;
  return cortadas;
}

// Tick customizado (em vez de angle+textAnchor do XAxis): texto horizontal,
// centralizado sob a barra, uma <tspan> por linha — permite quebra de linha,
// que o XAxis nativo do recharts não suporta.
function AreaAxisTick({ x, y, payload, compact = false }: { x: number; y: number; payload: { value: string }; compact?: boolean }) {
  const linhas = quebrarNomeArea(payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fontSize={compact ? 9 : 12} className="fill-muted-foreground">
        {linhas.map((linha, i) => (
          <tspan key={i} x={0} dy={compact ? 10 : 14}>{linha}</tspan>
        ))}
      </text>
    </g>
  );
}

// O PostgREST devolve colunas numeric como string (não number) — converter com
// Number() antes de qualquer soma, senão "6.5" + "12.3" vira "06.512.3".
function m3(v: number | string): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Cargas antigas podem ter ano_mes NULL ou vazio (coluna criada depois dos
// dados) — deriva o mês/ano da data quando vier sem preenchimento.
function mesDe(c: Carga): string | null {
  return c.ano_mes || (c.data ? c.data.slice(0, 7) : null);
}

// Sem paginação, o Supabase corta a resposta em 1000 linhas por chamada, sem
// erro — organizações com mais cargas que isso (comum depois de importar
// histórico) perdiam dados do dashboard em silêncio. Busca a 1ª página junto
// com o total (count: "exact", sem round-trip extra) e, se sobrar mais de
// uma página, dispara o resto EM PARALELO em vez de esperar página por
// página — numa organização com muito histórico isso é a diferença entre
// N round-trips sequenciais e só 2 "ondas" de requisição.
async function listarPaginado<T>(tabela: string, colunas: string, organizacaoId: string, projetoId: string): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const primeira = await supabase
    .from(tabela)
    .select(colunas, { count: "exact" })
    .eq("organizacao_id", organizacaoId)
    .eq("projeto_id", projetoId)
    .range(0, PAGE_SIZE - 1);
  if (primeira.error) throw primeira.error;

  const rows: T[] = [...((primeira.data ?? []) as unknown as T[])];
  const total = primeira.count ?? rows.length;

  const paginasRestantes = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) {
    paginasRestantes.push(
      supabase.from(tabela).select(colunas).eq("organizacao_id", organizacaoId).eq("projeto_id", projetoId).range(from, from + PAGE_SIZE - 1),
    );
  }
  for (const resultado of await Promise.all(paginasRestantes)) {
    if (resultado.error) throw resultado.error;
    rows.push(...((resultado.data ?? []) as unknown as T[]));
  }

  return rows;
}

export default function ConcretoDashboard() {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;
  const [anoFiltro, setAnoFiltro] = useState<string | null>(null);
  const [projetoFiltro, setProjetoFiltro] = useState<string[]>([]); // area_concreto_ids
  const [usinaFiltro, setUsinaFiltro] = useState<string | null>(null); // fornecedor_id

  const capturaRef = useRef<HTMLDivElement>(null);
  const [exportando, setExportando] = useState<"imagem" | "pdf" | null>(null);

  const { data: fornecedores = [] } = useFornecedoresConcreto(organizacaoId, projetoId);
  const { data: areas = [] } = useAreasConcreto(null, organizacaoId, projetoId);

  // staleTime: essas duas trazem o histórico INTEIRO da obra (não dá pra
  // paginar no servidor porque o dashboard soma/agrupa tudo no cliente) —
  // sem isso, o padrão global (staleTime 0) refaz essa busca pesada toda vez
  // que a aba do Dashboard é remontada, mesmo revisitando poucos segundos
  // depois. 5 min é o mesmo usado nos catálogos (ver catalog.ts).
  const { data: cargas = [], isLoading } = useQuery({
    queryKey: ["cargas-concreto-dashboard", organizacaoId, projetoId],
    queryFn: () => listarPaginado<Carga>("cargas_concreto", "id,data,ano_mes,fornecedor_id,quantidade_m3", organizacaoId!, projetoId!),
    enabled: !!organizacaoId && !!projetoId,
    staleTime: 5 * 60_000,
  });

  const { data: destinos = [] } = useQuery({
    queryKey: ["destinos-carga-dashboard", organizacaoId, projetoId],
    queryFn: () => listarPaginado<Destino>("destinos_carga", "carga_id,area_concreto_id,quantidade_m3_aplicada", organizacaoId!, projetoId!),
    enabled: !!organizacaoId && !!projetoId,
    staleTime: 5 * 60_000,
  });

  const fornecedorNomePorId = useMemo(() => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);
  const areaNomePorId = useMemo(() => new Map(areas.map((a) => [a.id, a.nome])), [areas]);

  const anos = useMemo(() => {
    const set = new Set<string>();
    for (const c of cargas) {
      const ano = mesDe(c)?.slice(0, 4);
      if (ano) set.add(ano);
    }
    return [...set].sort();
  }, [cargas]);

  // Uma carga pode ter mais de um destino (área) — precisa do conjunto de
  // áreas de cada carga pra filtrar por Projeto, já que área não é campo
  // direto de cargas_concreto.
  const areaIdsPorCarga = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const d of destinos) {
      if (!d.area_concreto_id) continue;
      if (!map.has(d.carga_id)) map.set(d.carga_id, new Set());
      map.get(d.carga_id)!.add(d.area_concreto_id);
    }
    return map;
  }, [destinos]);

  // Ano/Usina/Projeto filtram os gráficos de mês/usina/área — "Volume total"
  // ignora o filtro de ano de propósito, já que o gráfico inteiro é sobre
  // comparar anos (mas respeita Usina/Projeto — ver porAno).
  // Vários projetos selecionados: a carga entra se tiver destino em QUALQUER
  // um deles (OU, não E) — mesmo critério de todo filtro multi-seleção do app.
  const bateProjeto = (cargaId: string) =>
    projetoFiltro.length === 0 || projetoFiltro.some((id) => areaIdsPorCarga.get(cargaId)?.has(id));

  const cargasFiltradas = useMemo(
    () =>
      cargas.filter((c) => {
        if (anoFiltro && !mesDe(c)?.startsWith(anoFiltro)) return false;
        if (usinaFiltro && c.fornecedor_id !== usinaFiltro) return false;
        if (!bateProjeto(c.id)) return false;
        return true;
      }),
    [cargas, anoFiltro, usinaFiltro, projetoFiltro, areaIdsPorCarga],
  );

  const idsCargasFiltradas = useMemo(() => new Set(cargasFiltradas.map((c) => c.id)), [cargasFiltradas]);

  const porMes = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cargasFiltradas) {
      const chave = mesDe(c);
      if (!chave) continue;
      map.set(chave, (map.get(chave) ?? 0) + m3(c.quantidade_m3));
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([anoMes, total]) => ({ anoMes: formatAnoMes(anoMes), total }));
  }, [cargasFiltradas]);

  const porUsina = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cargasFiltradas) {
      const nome = fornecedorNomePorId.get(c.fornecedor_id) ?? "Sem fornecedor";
      map.set(nome, (map.get(nome) ?? 0) + m3(c.quantidade_m3));
    }
    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [cargasFiltradas, fornecedorNomePorId]);

  const porAno = useMemo(() => {
    const totais: Record<string, number> = {};
    for (const c of cargas) {
      if (usinaFiltro && c.fornecedor_id !== usinaFiltro) continue;
      if (!bateProjeto(c.id)) continue;
      const ano = mesDe(c)?.slice(0, 4);
      if (!ano) continue;
      totais[ano] = (totais[ano] ?? 0) + m3(c.quantidade_m3);
    }
    return [{ nome: "Total", ...totais }];
  }, [cargas, usinaFiltro, projetoFiltro, areaIdsPorCarga]);

  const porArea = useMemo(() => {
    const destinosFiltrados = destinos.filter((d) => idsCargasFiltradas.has(d.carga_id));

    const map = new Map<string, number>();
    for (const d of destinosFiltrados) {
      const nome = d.area_concreto_id ? areaNomePorId.get(d.area_concreto_id) ?? "Área removida" : "Sem destino informado";
      map.set(nome, (map.get(nome) ?? 0) + m3(d.quantidade_m3_aplicada));
    }

    // Carga sem NENHUM destino registrado não aparece em destinos_carga —
    // soma a diferença pra não sumir do total (mesmo espírito dos alertas de
    // "sem cargo"/"sem setor" no Dashboard de Administração).
    const destinadoPorCarga = new Map<string, number>();
    for (const d of destinosFiltrados) {
      destinadoPorCarga.set(d.carga_id, (destinadoPorCarga.get(d.carga_id) ?? 0) + m3(d.quantidade_m3_aplicada));
    }
    let semDestino = 0;
    for (const c of cargasFiltradas) {
      const destinado = destinadoPorCarga.get(c.id) ?? 0;
      const resto = m3(c.quantidade_m3) - destinado;
      if (resto > 0.001) semDestino += resto;
    }
    if (semDestino > 0.001) {
      map.set("Sem destino informado", (map.get("Sem destino informado") ?? 0) + semDestino);
    }

    const ordenado = [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);

    // Top 9 áreas com mais volume; o restante é somado num item "Outros" só —
    // o gráfico fica legível com o ranking real, sem uma cauda de barras
    // minúsculas.
    if (ordenado.length <= 9) return ordenado;
    const top = ordenado.slice(0, 9);
    const resto = ordenado.slice(9).reduce((s, x) => s + x.total, 0);
    return resto > 0.001 ? [...top, { nome: "Outros", total: resto }] : top;
  }, [destinos, idsCargasFiltradas, cargasFiltradas, areaNomePorId]);

  const porUsinaGrafico = useMemo(() => {
    if (!isMobile || porUsina.length <= 5) return porUsina;
    const outros = porUsina.slice(5).reduce((total, item) => total + item.total, 0);
    return [...porUsina.slice(0, 5), { nome: "Outros", total: outros }];
  }, [isMobile, porUsina]);
  const porAreaGrafico = useMemo(() => {
    if (!isMobile || porArea.length <= 5) return porArea;
    const outros = porArea.slice(5).reduce((total, item) => total + item.total, 0);
    return [...porArea.slice(0, 5), { nome: "Outros", total: outros }];
  }, [isMobile, porArea]);
  const intervaloMeses = isMobile ? Math.max(0, Math.ceil(porMes.length / 5) - 1) : 1;

  const volumeTotal = cargasFiltradas.reduce((s, c) => s + m3(c.quantidade_m3), 0);

  async function handleExportar(tipo: "imagem" | "pdf") {
    if (!capturaRef.current) return;
    setExportando(tipo);
    try {
      const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("");
      if (tipo === "imagem") {
        await downloadNodeAsA4Png(capturaRef.current, `Dashboard_Concreto_${hoje}.png`, "#ffffff");
      } else {
        await downloadNodeAsPdf(capturaRef.current, `Dashboard_Concreto_${hoje}.pdf`, "#ffffff");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(null);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de Concreto</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExportar("imagem")} disabled={exportando !== null}>
              {exportando === "imagem" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar imagem
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExportar("pdf")} disabled={exportando !== null}>
              {exportando === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Exportar PDF
            </Button>
          </div>
          <div className="w-full sm:w-48 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Combobox
              options={anos.map((a) => ({ value: a, label: a }))}
              value={anoFiltro}
              onChange={setAnoFiltro}
              placeholder="Todos os anos"
            />
          </div>
          <div className="w-full sm:w-48 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Projeto</Label>
            <MultiCombobox
              options={areas.map((a) => ({ value: a.id, label: a.nome }))}
              value={projetoFiltro}
              onChange={setProjetoFiltro}
              placeholder="Todos os projetos"
            />
          </div>
          <div className="w-full sm:w-48 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Usina</Label>
            <Combobox
              options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
              value={usinaFiltro}
              onChange={setUsinaFiltro}
              placeholder="Todas as usinas"
            />
          </div>
        </div>
      </div>

      <div ref={capturaRef} className="space-y-4 bg-background p-2">
      <p className="text-sm text-muted-foreground">
        Concreto — Volume total: <strong className="text-foreground text-2xl">{volumeTotal.toLocaleString("pt-BR")} m³</strong>
        {" · "}Ano: {anoFiltro ?? "todos"}
        {" · "}Projeto: {projetoFiltro.length > 0 ? projetoFiltro.map((id) => areaNomePorId.get(id) ?? id).join(", ") : "todos"}
        {" · "}Usina: {usinaFiltro ? fornecedorNomePorId.get(usinaFiltro) ?? usinaFiltro : "todas"}
      </p>

      {/*
        flex, não grid: html2canvas tem suporte histórico incompleto pra
        display:grid (às vezes reflui pra coluna única na captura) — flexbox
        com largura mínima por card é visualmente equivalente (3 colunas que
        quebram linha se não couberem) e captura de forma confiável.
      */}
      <div className="flex flex-wrap gap-4">
        <Card className="flex-[2] min-w-full sm:min-w-[280px]">
          <CardHeader><CardTitle className="text-base">Volume de concreto/mês (m³)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <BarChart data={porMes} margin={isMobile ? { top: 8, right: 8, left: -24, bottom: 0 } : { top: 24, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                {/* interval=1: mostra 1, pula 1 — um rótulo a cada 2 meses */}
                <XAxis dataKey="anoMes" tick={{ fontSize: isMobile ? 9 : 13 }} interval={intervaloMeses} />
                <YAxis tick={{ fontSize: isMobile ? 9 : 13 }} tickCount={isMobile ? 4 : 5} />
                <Tooltip />
                <Bar dataKey="total" name="m³" fill="#2563eb" radius={[4, 4, 0, 0]}>
                  {!isMobile && <LabelList dataKey="total" position="top" fontSize={13} className="fill-foreground" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex-1 min-w-full sm:min-w-[240px]">
          <CardHeader><CardTitle className="text-base">Volume de concreto / Usina (m³){isMobile && porUsina.length > 5 ? " — Top 5" : ""}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <PieChart>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Pie data={porUsinaGrafico} dataKey="total" nameKey="nome" cx="50%" cy="50%" outerRadius={isMobile ? 64 : 90} label={isMobile ? false : (entry: any) => `${(entry.percent * 100).toFixed(1)}%`}>
                  {porUsinaGrafico.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                <Legend wrapperStyle={{ fontSize: isMobile ? 10 : 14 }} iconSize={isMobile ? 8 : 14} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex-1 min-w-full sm:min-w-[240px]">
          <CardHeader><CardTitle className="text-base">Volume total (m³)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <BarChart data={porAno} margin={isMobile ? { top: 8, right: 4, left: -24, bottom: 0 } : { top: 24, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" tick={{ fontSize: isMobile ? 9 : 13 }} />
                <YAxis tick={{ fontSize: isMobile ? 9 : 13 }} tickCount={isMobile ? 4 : 5} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: isMobile ? 10 : 14 }} iconSize={isMobile ? 8 : 14} />
                {anos.map((ano, i) => (
                  <Bar key={ano} dataKey={ano} name={ano} stackId="total" fill={COLORS[i % COLORS.length]}>
                    {/* center, não top: num segmento empilhado "top" cai bem em
                        cima da linha de divisão com o próximo segmento, ilegível
                        contra qualquer uma das duas cores — centralizado no meio
                        do próprio segmento, com texto branco, sempre lê bem. */}
                    <LabelList dataKey={ano} position="center" fontSize={isMobile ? 10 : 14} fill="#fff" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Concreto / Área (m³){isMobile && porArea.length > 5 ? " — Top 5" : ""}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={isMobile ? 260 : 420}>
            <BarChart data={porAreaGrafico} margin={isMobile ? { top: 12, right: 4, left: -24, bottom: 0 } : { top: 24, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <XAxis dataKey="nome" interval={0} height={isMobile ? 42 : 64} tick={isMobile ? ((props: any) => <AreaAxisTick {...props} compact />) : AreaAxisTick as any} />
              <YAxis tick={{ fontSize: isMobile ? 9 : 13 }} tickCount={isMobile ? 4 : 5} />
              <Tooltip />
              <Bar dataKey="total" name="m³" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="total" position="top" fontSize={isMobile ? 9 : 14} className="fill-foreground" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                {porAreaGrafico.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
