import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useFornecedoresConcreto, useTracosConcreto, useEtapasConcreto, useAreasConcreto } from "./lib/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import {
  listarTodasCargasConcreto,
  buildCargasConcretoWorkbook,
  downloadCargasConcretoWorkbook,
  type CargaRow,
} from "./lib/excel-export";

function formatBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

type Filters = {
  dataInicio: string;
  dataFim: string;
  fornecedorId: string | null;
  tracoId: string | null;
  projetoId: string | null;
  etapaId: string | null;
  numeroCarga: string;
};

const PAGE_SIZE = 25;

// Sem filtro de data por padrão — a tela deve abrir mostrando TODOS os
// lançamentos do sistema, não só o mês atual.
function defaultFilters(): Filters {
  return { dataInicio: "", dataFim: "", fornecedorId: null, tracoId: null, projetoId: null, etapaId: null, numeroCarga: "" };
}

export default function ConcretoConsulta() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const [filters, setFilters] = useState<Filters>(defaultFilters());
  const [page, setPage] = useState(0);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const { data: fornecedores = [] } = useFornecedoresConcreto(organizacaoId, false);
  const { data: tracos = [] } = useTracosConcreto(organizacaoId, false);
  const { data: projetos = [] } = useAreasConcreto(null, organizacaoId);
  const { data: etapas = [] } = useEtapasConcreto(organizacaoId, false);

  const queryKey = ["cargas-concreto-consulta", organizacaoId, filters, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      // Filtrar por Projeto/Etapa é filtrar pelo destino da carga (tabela filha) —
      // o embed só precisa virar inner join (!inner) quando um desses filtros
      // está ativo; do contrário cargas sem nenhum destino sumiriam da listagem
      // toda vez que a tela abre sem filtro nenhum. areas_concreto é o catálogo
      // próprio do Concreto; areas (global do Apontamento) é só fallback pra
      // destinos lançados antes da separação.
      const filtraPorDestino = !!filters.projetoId || !!filters.etapaId;
      const destinosEmbed = `destinos_carga${filtraPorDestino ? "!inner" : ""}(quantidade_m3_aplicada, observacao, areas_concreto(nome), areas(nome), etapa_concreto:etapas_concreto(nome))`;

      let q = supabase
        .from("cargas_concreto")
        .select(
          `id, codigo_rastreabilidade, data, numero_carga, quantidade_m3, tipo_origem, peso_balanca_kg, preco_total, validado, criado_por_nome,
           fornecedores_concreto(nome),
           tracos_concreto(nome, fck_mpa),
           ${destinosEmbed}`,
          { count: "exact" }
        )
        .eq("organizacao_id", organizacaoId!)
        .order("data", { ascending: false });
      if (filters.dataInicio) q = q.gte("data", filters.dataInicio);
      if (filters.dataFim) q = q.lte("data", filters.dataFim);
      if (filters.fornecedorId) q = q.eq("fornecedor_id", filters.fornecedorId);
      if (filters.tracoId) q = q.eq("traco_id", filters.tracoId);
      if (filters.projetoId) q = q.eq("destinos_carga.area_concreto_id", filters.projetoId);
      if (filters.etapaId) q = q.eq("destinos_carga.etapa_concreto_id", filters.etapaId);
      if (filters.numeroCarga.trim()) q = q.ilike("numero_carga", `%${filters.numeroCarga.trim()}%`);
      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as CargaRow[], count: count ?? 0 };
    },
    enabled: !!organizacaoId,
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cargas_concreto").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Carga removida");
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["cargas-concreto-consulta"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setPage(0);
    setFilters((p) => ({ ...p, [k]: v }));
  };

  const [exportando, setExportando] = useState(false);

  async function handleExportarTudo() {
    if (!organizacaoId) return;
    setExportando(true);
    try {
      const rows = await listarTodasCargasConcreto(organizacaoId);
      if (rows.length === 0) {
        toast.warning("Nenhum lançamento no banco pra exportar.");
        return;
      }
      const wb = await buildCargasConcretoWorkbook(rows);
      await downloadCargasConcretoWorkbook(wb);
      toast.success(`${rows.length} lançamento(s) exportado(s)`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xl">Todos os lançamentos</CardTitle>
            <Button
              variant="outline"
              onClick={handleExportarTudo}
              disabled={exportando || !organizacaoId}
              title="Exporta TODOS os lançamentos do banco, ignorando os filtros da tela"
            >
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar tudo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <div className="space-y-1.5">
              <Label>Data início</Label>
              <Input type="date" value={filters.dataInicio} onChange={(e) => setF("dataInicio", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data fim</Label>
              <Input type="date" value={filters.dataFim} onChange={(e) => setF("dataFim", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Combobox options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))} value={filters.fornecedorId} onChange={(v) => setF("fornecedorId", v)} placeholder="Todos" />
            </div>
            <div className="space-y-1.5">
              <Label>Traço</Label>
              <Combobox options={tracos.map((t) => ({ value: t.id, label: t.nome }))} value={filters.tracoId} onChange={(v) => setF("tracoId", v)} placeholder="Todos" />
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Combobox options={projetos.map((a) => ({ value: a.id, label: a.nome }))} value={filters.projetoId} onChange={(v) => setF("projetoId", v)} placeholder="Todos" />
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Combobox options={etapas.map((e) => ({ value: e.id, label: e.nome }))} value={filters.etapaId} onChange={(v) => setF("etapaId", v)} placeholder="Todas" />
            </div>
            <div className="space-y-1.5">
              <Label>Número da carga</Label>
              <Input value={filters.numeroCarga} onChange={(e) => setF("numeroCarga", e.target.value)} placeholder="Buscar..." />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">{data?.count ?? 0} carga(s)</div>
            <Button variant="outline" onClick={() => { setFilters(defaultFilters()); setPage(0); }}>Limpar filtros</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Nº Carga</TableHead>
                  <TableHead>Traço</TableHead>
                  <TableHead className="text-right">Qtd. (m³)</TableHead>
                  <TableHead className="text-right">Preço total</TableHead>
                  <TableHead>Destino(s)</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead>Validado</TableHead>
                  <TableHead>Lançado por</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                )}
                {!isLoading && (data?.rows ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado</TableCell></TableRow>
                )}
                {(data?.rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatBR(r.data)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.fornecedores_concreto?.nome ?? "—"}
                      <Badge variant="outline" className="ml-1.5 text-[10px]">{r.tipo_origem === "propria" ? "Própria" : "Externa"}</Badge>
                    </TableCell>
                    <TableCell>{r.numero_carga ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.tracos_concreto?.nome ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.quantidade_m3.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{r.preco_total != null ? r.preco_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</TableCell>
                    <TableCell className="text-xs max-w-[200px]">
                      {r.destinos_carga.length === 0
                        ? "—"
                        : r.destinos_carga.map((d, i) => (
                            <div key={i} className="whitespace-nowrap">
                              {d.areas_concreto?.nome ?? d.areas?.nome ?? "Sem área"} — {d.quantidade_m3_aplicada.toLocaleString("pt-BR")}m³
                            </div>
                          ))}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      {r.destinos_carga.length === 0
                        ? "—"
                        : r.destinos_carga.map((d, i) => (
                            <div key={i} className="whitespace-nowrap">{d.areas_concreto?.nome ?? d.areas?.nome ?? "—"}</div>
                          ))}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      {r.destinos_carga.length === 0
                        ? "—"
                        : r.destinos_carga.map((d, i) => (
                            <div key={i} className="whitespace-nowrap">{d.etapa_concreto?.nome ?? "—"}</div>
                          ))}
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px]">
                      {r.destinos_carga.length === 0 || r.destinos_carga.every((d) => !d.observacao)
                        ? "—"
                        : r.destinos_carga.map((d, i) => (
                            <div key={i} className="whitespace-nowrap">{d.observacao || "—"}</div>
                          ))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.validado ? "default" : "outline"} className="text-[10px]">{r.validado ? "Sim" : "Não"}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{r.criado_por_nome ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDel(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir carga?</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir esta carga e seus destinos? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && delMut.mutate(confirmDel)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
