import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatBR, todayISO } from "./lib/date-utils";
import {
  useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades,
} from "./lib/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { buildWorkbook, downloadWorkbook, exportFilename, type Apontamento } from "./lib/excel-export";

type Filters = {
  data_inicio: string;
  data_fim: string;
  empresa_id: string | null;
  lideranca_id: string | null;
  setor_id: string | null;
  area_id: string | null;
  subarea_id: string | null;
  atividade_id: string | null;
};

const PAGE_SIZE = 25;

function defaultFilters(): Filters {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const toISO = (x: Date) => x.toISOString().slice(0, 10);
  return {
    data_inicio: toISO(start),
    data_fim: todayISO(),
    empresa_id: null, lideranca_id: null, setor_id: null,
    area_id: null, subarea_id: null, atividade_id: null,
  };
}

export default function Consulta() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>(defaultFilters());
  const [page, setPage] = useState(0);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: empresas = [] } = useEmpresas(false);
  const { data: liderancas = [] } = useLiderancas(false);
  const { data: setores = [] } = useSetores(false);
  const { data: areas = [] } = useAreas(filters.setor_id, false);
  const { data: subareas = [] } = useSubareas(filters.area_id, false);
  const { data: atividades = [] } = useAtividades(false);

  const queryKey = ["apontamentos", filters, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("apontamentos_diarios")
        .select("*", { count: "exact" })
        .gte("data", filters.data_inicio)
        .lte("data", filters.data_fim);
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      if (filters.lideranca_id) q = q.eq("lideranca_id", filters.lideranca_id);
      if (filters.setor_id) q = q.eq("setor_id", filters.setor_id);
      if (filters.area_id) q = q.eq("area_id", filters.area_id);
      if (filters.subarea_id) q = q.eq("subarea_id", filters.subarea_id);
      if (filters.atividade_id) q = q.eq("atividade_id", filters.atividade_id);
      const { data, error, count } = await q;
      if (error) throw error;
      const sorted = ((data ?? []) as Apontamento[]).sort((a, b) => b.data.localeCompare(a.data) || (b.criado_em ?? "").localeCompare(a.criado_em ?? ""));
      const paged = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      return { rows: paged, count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("apontamentos_diarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); setConfirmDel(null); qc.invalidateQueries({ queryKey: ["apontamentos"] }); },
  });

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setPage(0);
    setFilters((p) => ({ ...p, [k]: v }));
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      let q = supabase
        .from("apontamentos_diarios")
        .select("*")
        .gte("data", filters.data_inicio)
        .lte("data", filters.data_fim);
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      if (filters.lideranca_id) q = q.eq("lideranca_id", filters.lideranca_id);
      if (filters.setor_id) q = q.eq("setor_id", filters.setor_id);
      if (filters.area_id) q = q.eq("area_id", filters.area_id);
      if (filters.subarea_id) q = q.eq("subarea_id", filters.subarea_id);
      if (filters.atividade_id) q = q.eq("atividade_id", filters.atividade_id);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Apontamento[];
      if (rows.length === 0) { toast.warning("Nenhum registro no filtro atual"); return; }
      const wb = buildWorkbook(rows);
      downloadWorkbook(wb, exportFilename(filters.data_inicio, filters.data_fim));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const totalPeriodo = useMemo(
    () => (data?.rows ?? []).reduce((s, r) => s + r.total, 0),
    [data?.rows],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Consulta de apontamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Data início</Label>
              <Input type="date" value={filters.data_inicio} onChange={(e) => setF("data_inicio", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data fim</Label>
              <Input type="date" value={filters.data_fim} onChange={(e) => setF("data_fim", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Combobox options={empresas.map((e) => ({ value: e.id, label: e.nome }))} value={filters.empresa_id} onChange={(v) => setF("empresa_id", v)} placeholder="Todas" />
            </div>
            <div className="space-y-1.5">
              <Label>Liderança</Label>
              <Combobox options={liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo }))} value={filters.lideranca_id} onChange={(v) => setF("lideranca_id", v)} placeholder="Todas" />
            </div>
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <Combobox options={setores.map((s) => ({ value: s.id, label: s.nome }))} value={filters.setor_id} onChange={(v) => { setF("setor_id", v); setFilters((p) => ({ ...p, area_id: null, subarea_id: null })); }} placeholder="Todos" />
            </div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Combobox options={areas.map((a) => ({ value: a.id, label: a.nome }))} value={filters.area_id} onChange={(v) => { setF("area_id", v); setFilters((p) => ({ ...p, subarea_id: null })); }} placeholder="Todas" disabled={!filters.setor_id} />
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Combobox options={subareas.map((s) => ({ value: s.id, label: s.nome }))} value={filters.subarea_id} onChange={(v) => setF("subarea_id", v)} placeholder="Todas" disabled={!filters.area_id} />
            </div>
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <Combobox options={atividades.map((a) => ({ value: a.id, label: a.nome }))} value={filters.atividade_id} onChange={(v) => setF("atividade_id", v)} placeholder="Todas" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {data?.count ?? 0} registro(s) · {totalPeriodo} pessoa(s) na página
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setFilters(defaultFilters()); setPage(0); }}>Limpar filtros</Button>
              <Button onClick={exportAll} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportar Excel
              </Button>
            </div>
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
                  <TableHead>Ano-Mês</TableHead>
                  <TableHead>Semana</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Liderança</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Atividade</TableHead>
                  <TableHead className="text-right">Ped</TableHead>
                  <TableHead className="text-right">Serv</TableHead>
                  <TableHead className="text-right">Carp</TableHead>
                  <TableHead className="text-right">Outros</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                )}
                {!isLoading && (data?.rows ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
                )}
                {(data?.rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatBR(r.data)}</TableCell>
                    <TableCell>{r.ano_mes}</TableCell>
                    <TableCell>{r.ano_semana}</TableCell>
                    <TableCell>{r.empresa_nome}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.lideranca_nome}</TableCell>
                    <TableCell>{r.setor_nome}</TableCell>
                    <TableCell>{r.area_nome ?? "—"}</TableCell>
                    <TableCell>{r.subarea_nome ?? "—"}</TableCell>
                    <TableCell>{r.atividade_nome}</TableCell>
                    <TableCell className="text-right">{r.pedreiro || ""}</TableCell>
                    <TableCell className="text-right">{r.servente || ""}</TableCell>
                    <TableCell className="text-right">{r.carpinteiro || ""}</TableCell>
                    <TableCell className="text-right">{r.qntdd_funcao || ""}</TableCell>
                    <TableCell className="text-right font-medium">{r.total}</TableCell>
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
            <AlertDialogTitle>Excluir apontamento?</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.</AlertDialogDescription>
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