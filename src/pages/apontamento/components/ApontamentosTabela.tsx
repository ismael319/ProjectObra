import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Layers, RefreshCw, Download, Upload, ChevronDown, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import * as XLSX from "xlsx";
import type { CronogramaItem, Atividade } from "../lib/catalog";

interface ApontamentosTabelaProps {
  items: CronogramaItem[];
  atividades?: Atividade[];
  onMapAtividade?: (itemId: string, atividadeId: string | null) => void;
  onToggleAtivo?: (itemId: string, ativo: boolean) => void;
  onDelete?: (itemId: string) => void;
  onReload?: () => void;
  onUpload?: () => void;
}

type GroupBy = "none" | "status" | "nivel" | "indice";

interface GroupInfo {
  key: string;
  label: string;
  items: CronogramaItem[];
}

function groupItems(items: CronogramaItem[], groupBy: GroupBy): GroupInfo[] {
  if (groupBy === "none") return [{ key: "all", label: "Todos", items }];
  const map = new Map<string, CronogramaItem[]>();
  for (const item of items) {
    let key: string;
    if (groupBy === "status") key = item.status ?? "Sem status";
    else if (groupBy === "nivel") key = item.nivel != null ? `Nível ${item.nivel}` : "Sem nível";
    else key = item.indice.split(".").slice(0, 2).join(".");
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, list]) => ({ key, label: key, items: list }));
}

function sumField(items: CronogramaItem[], field: keyof CronogramaItem): number {
  return items.reduce((s, i) => s + ((i[field] as unknown as number) ?? 0), 0);
}

function buildExcel(items: CronogramaItem[], atividades: Atividade[]) {
  const wb = XLSX.utils.book_new();
  const atvMap = new Map(atividades.map((a) => [a.id, a.nome]));
  const headers = [["ÍNDICE", "NOME", "NÍVEL", "HH TOTAL", "HH GANHO", "HH CONSUMIDO", "STATUS", "PRODUTIVIDADE", "ADERÊNCIA", "PROJEÇÃO HH", "ATIVIDADE", "ATIVO"]];
  const rows = items.map((i) => [
    i.indice, i.nome, i.nivel ?? "", i.hh_total ?? "", i.hh_ganho ?? "", i.hh_consumido ?? "",
    i.status ?? "", i.produtividade ?? "", i.aderencia ?? "", i.projecao_hh ?? "",
    i.atividade_id ? (atvMap.get(i.atividade_id) ?? "") : "", i.ativo ? "Sim" : "Não",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Cronograma");
  XLSX.writeFile(wb, "cronograma.xlsx");
}

export function ApontamentosTabela({
  items,
  atividades = [],
  onMapAtividade,
  onToggleAtivo,
  onDelete,
  onReload,
}: ApontamentosTabelaProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const groups = useMemo(() => groupItems(items, groupBy), [items, groupBy]);

  const totalHhTotal = useMemo(() => sumField(items, "hh_total"), [items]);
  const totalHhGanho = useMemo(() => sumField(items, "hh_ganho"), [items]);
  const totalHhConsumido = useMemo(() => sumField(items, "hh_consumido"), [items]);
  const totalProjecao = useMemo(() => sumField(items, "projecao_hh"), [items]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            <Layers className="inline h-4 w-4 mr-1" />
            Itens do Cronograma ({items.length})
          </CardTitle>
          <div className="flex gap-2">
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="text-sm border rounded px-2 py-1">
              <option value="none">Sem agrupamento</option>
              <option value="status">Agrupar por status</option>
              <option value="nivel">Agrupar por nível</option>
              <option value="indice">Agrupar por índice</option>
            </select>
            {onReload && <Button size="sm" variant="outline" onClick={onReload}><RefreshCw className="h-3.5 w-3.5" /></Button>}
            <Button size="sm" variant="outline" onClick={() => buildExcel(items, atividades)}><Download className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground mt-2">
          <span>HH Total: <strong>{totalHhTotal.toFixed(1)}</strong></span>
          <span>HH Ganho: <strong>{totalHhGanho.toFixed(1)}</strong></span>
          <span>HH Consumido: <strong>{totalHhConsumido.toFixed(1)}</strong></span>
          <span>Projeção: <strong>{totalProjecao.toFixed(1)}</strong></span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Índice</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead className="text-right">HH Total</TableHead>
                <TableHead className="text-right">HH Ganho</TableHead>
                <TableHead className="text-right">HH Consumido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Atividade</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                g.items.map((item, idx) => (
                  <TableRow key={item.id} className={!item.ativo ? "opacity-50" : ""}>
                    {idx === 0 && groupBy !== "none" && (
                      <TableCell colSpan={10} className="font-semibold text-xs bg-muted/50 py-1">
                        {g.label} ({g.items.length} itens)
                      </TableCell>
                    )}
                    {!(idx === 0 && groupBy !== "none") && (
                      <>
                        <TableCell className="font-mono text-xs">{item.indice}</TableCell>
                        <TableCell>{item.nome}</TableCell>
                        <TableCell>{item.nivel ?? "—"}</TableCell>
                        <TableCell className="text-right">{item.hh_total?.toFixed(1) ?? "—"}</TableCell>
                        <TableCell className="text-right">{item.hh_ganho?.toFixed(1) ?? "—"}</TableCell>
                        <TableCell className="text-right">{item.hh_consumido?.toFixed(1) ?? "—"}</TableCell>
                        <TableCell>{item.status ? <Badge variant="outline">{item.status}</Badge> : "—"}</TableCell>
                        <TableCell>
                          {onMapAtividade ? (
                            <select
                              value={item.atividade_id ?? ""}
                              onChange={(e) => onMapAtividade(item.id, e.target.value || null)}
                              className="text-xs border rounded px-1 py-0.5"
                            >
                              <option value="">—</option>
                              {atividades.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                            </select>
                          ) : (item.atividade_id ? (atividades.find((a) => a.id === item.atividade_id)?.nome ?? "—") : "—")}
                        </TableCell>
                        <TableCell>
                          {onToggleAtivo ? (
                            <button onClick={() => onToggleAtivo(item.id, !item.ativo)} className="text-muted-foreground hover:text-foreground">
                              {item.ativo ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                            </button>
                          ) : (item.ativo ? "Sim" : "Não")}
                        </TableCell>
                        <TableCell>
                          {onDelete && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7"><ChevronDown className="h-3.5 w-3.5" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { if (confirm(`Excluir "${item.nome}"?`)) onDelete(item.id); }} className="text-destructive">
                                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum item selecionado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
