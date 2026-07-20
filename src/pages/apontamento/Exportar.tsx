import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO } from "./lib/date-utils";
import {
  useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades,
} from "./lib/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiCombobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
import { buildWorkbook, downloadWorkbook, exportFilename, type Apontamento } from "./lib/excel-export";

export default function ExportarPage() {
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(todayISO());
  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [liderancaIds, setLiderancaIds] = useState<string[]>([]);
  const [setorIds, setSetorIds] = useState<string[]>([]);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [subareaIds, setSubareaIds] = useState<string[]>([]);
  const [atividadeIds, setAtividadeIds] = useState<string[]>([]);

  const { data: empresas = [] } = useEmpresas(false);
  const { data: liderancas = [] } = useLiderancas(false);
  const { data: setores = [] } = useSetores(false);
  const { data: areas = [] } = useAreas(null, false);
  const { data: subareas = [] } = useSubareas(null, false);
  const { data: atividades = [] } = useAtividades(false);

  const { data: apontamentos = [], isLoading } = useQuery({
    queryKey: ["exportar", dataInicio, dataFim, empresaIds, liderancaIds, setorIds, areaIds, subareaIds, atividadeIds],
    queryFn: async () => {
      let q = supabase
        .from("apontamentos_diarios")
        .select("*")
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data", { ascending: true });
      if (empresaIds.length > 0) q = q.in("empresa_id", empresaIds);
      if (liderancaIds.length > 0) q = q.in("lideranca_id", liderancaIds);
      if (setorIds.length > 0) q = q.in("setor_id", setorIds);
      if (areaIds.length > 0) q = q.in("area_id", areaIds);
      if (subareaIds.length > 0) q = q.in("subarea_id", subareaIds);
      if (atividadeIds.length > 0) q = q.in("atividade_id", atividadeIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Apontamento[];
    },
  });

  const resumo = useMemo(() => {
    const acc = { registros: apontamentos.length, pedreiro: 0, servente: 0, carpinteiro: 0, qntdd_funcao: 0, total: 0 };
    for (const a of apontamentos) { acc.pedreiro += a.pedreiro; acc.servente += a.servente; acc.carpinteiro += a.carpinteiro; acc.qntdd_funcao += a.qntdd_funcao; acc.total += a.total; }
    return acc;
  }, [apontamentos]);

  const handleExport = () => {
    if (apontamentos.length === 0) { toast.warning("Nenhum registro para exportar"); return; }
    const wb = buildWorkbook(apontamentos);
    downloadWorkbook(wb, exportFilename(dataInicio, dataFim));
    toast.success("Excel exportado");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exportar Relatório</h1>
          <p className="text-sm text-muted-foreground">Gere uma planilha Excel com os apontamentos filtrados.</p>
        </div>
        <Button onClick={handleExport} disabled={isLoading || apontamentos.length === 0}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar Excel
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5"><Label>Data início</Label><input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" /></div>
            <div className="space-y-1.5"><Label>Data fim</Label><input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" /></div>
            <div className="space-y-1.5"><Label>Empresa</Label><MultiCombobox options={empresas.map((e) => ({ value: e.id, label: e.nome }))} value={empresaIds} onChange={setEmpresaIds} placeholder="Todas" /></div>
            <div className="space-y-1.5"><Label>Liderança</Label><MultiCombobox options={liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo }))} value={liderancaIds} onChange={setLiderancaIds} placeholder="Todas" /></div>
            <div className="space-y-1.5"><Label>Setor</Label><MultiCombobox options={setores.map((s) => ({ value: s.id, label: s.nome }))} value={setorIds} onChange={setSetorIds} placeholder="Todos" /></div>
            <div className="space-y-1.5"><Label>Área</Label><MultiCombobox options={areas.map((a) => ({ value: a.id, label: a.nome }))} value={areaIds} onChange={setAreaIds} placeholder="Todas" /></div>
            <div className="space-y-1.5"><Label>Etapa</Label><MultiCombobox options={subareas.map((s) => ({ value: s.id, label: s.nome }))} value={subareaIds} onChange={setSubareaIds} placeholder="Todas" /></div>
            <div className="space-y-1.5"><Label>Atividade</Label><MultiCombobox options={atividades.map((a) => ({ value: a.id, label: a.nome }))} value={atividadeIds} onChange={setAtividadeIds} placeholder="Todas" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base"><FileSpreadsheet className="inline h-4 w-4 mr-1" /> Prévia dos dados</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-5 mb-4">
            <div><div className="text-xs text-muted-foreground">Registros</div><div className="text-2xl font-bold">{resumo.registros}</div></div>
            <div><div className="text-xs text-muted-foreground">Pedreiros</div><div className="text-2xl font-bold">{resumo.pedreiro}</div></div>
            <div><div className="text-xs text-muted-foreground">Serventes</div><div className="text-2xl font-bold">{resumo.servente}</div></div>
            <div><div className="text-xs text-muted-foreground">Carpinteiros</div><div className="text-2xl font-bold">{resumo.carpinteiro}</div></div>
            <div><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold">{resumo.total}</div></div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Empresa</TableHead><TableHead>Setor</TableHead><TableHead>Atividade</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {apontamentos.slice(0, 50).map((r) => (
                  <TableRow key={r.id}><TableCell>{r.data}</TableCell><TableCell>{r.empresa_nome}</TableCell><TableCell>{r.setor_nome}</TableCell><TableCell>{r.atividade_nome}</TableCell><TableCell className="text-right">{r.total}</TableCell></TableRow>
                ))}
                {apontamentos.length > 50 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">... e mais {apontamentos.length - 50} registros</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}