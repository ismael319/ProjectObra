import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2, AlertCircle, Loader2, ChevronRight,
  ChevronDown, Map as MapIcon, MapPin, Wrench, Building2,
  FolderOpen, Calendar, ListTree,
} from "lucide-react";
import { useProjects } from "@/lib/project-store";
import type { WBSActivity } from "@/lib/xml-parser";

interface EapRow {
  id: string;
  nome: string;
  codigo: string;
  nivel: number;
  parentCodigo: string | null;
  ativo: boolean;
  selected: boolean;
}

const NIVEL_LABELS = ["", "Setor", "Área", "Etapa", "Atividade"] as const;
const NIVEL_ICONS = [null, Building2, MapIcon, MapPin, Wrench] as const;
const NIVEL_COLORS = ["", "text-blue-600", "text-emerald-600", "text-orange-600", "text-purple-600"] as const;

function activitiesToEapRows(activities: WBSActivity[], levelOffset: number): EapRow[] {
  const valid = activities.filter((a) => a.outlineLevel > 0 && a.name.trim());
  return valid.map((a) => {
    const rawNivel = a.outlineLevel + levelOffset;
    const nivel = Math.min(4, Math.max(1, rawNivel));
    const parts = a.outlineNumber ? a.outlineNumber.split(".") : [];
    const parentOutline = parts.length > 1 ? parts.slice(0, -1).join(".") : null;
    const codigo = (a.wbs || a.outlineNumber || a.id).trim();
    const parentCodigo = parentOutline
      ? valid.find((b) => b.outlineNumber === parentOutline)?.wbs || parentOutline
      : null;
    return {
      id: `act-${a.uid}`,
      nome: a.name,
      codigo,
      nivel,
      parentCodigo,
      ativo: true,
      selected: !a.isSummary,
    };
  });
}

function buildTree(rows: EapRow[]) {
  const byCodigo = new Map<string, EapRow>();
  for (const r of rows) byCodigo.set(r.codigo, r);
  const roots: EapRow[] = [];
  for (const r of rows) {
    if (!r.parentCodigo || !byCodigo.has(r.parentCodigo)) {
      roots.push(r);
    }
  }
  return { roots, byCodigo };
}

function EapPreviewNode({
  row, allRows, depth, onToggle,
}: {
  row: EapRow; allRows: EapRow[]; depth: number; onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const children = allRows.filter((r) => r.parentCodigo === row.codigo);
  const hasChildren = children.length > 0;
  const Icon = NIVEL_ICONS[row.nivel] ?? Wrench;
  const colorClass = NIVEL_COLORS[row.nivel] ?? "text-muted-foreground";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded hover:bg-muted/50 group text-sm ${!row.selected ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <CollapsibleTrigger asChild>
          <button className="p-0 hover:bg-muted rounded" aria-label={open ? "Recolher" : "Expandir"}>
            {hasChildren
              ? open
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              : <span className="w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <input
          type="checkbox"
          checked={row.selected}
          onChange={() => onToggle(row.id)}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer"
        />
        <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass}`} />
        {row.codigo && (
          <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1 rounded shrink-0">
            {row.codigo}
          </span>
        )}
        <span className={`truncate ${depth === 0 ? "font-semibold" : ""}`}>{row.nome}</span>
        <Badge variant="outline" className="ml-auto text-[10px] shrink-0">
          {NIVEL_LABELS[row.nivel]}
        </Badge>
      </div>
      {hasChildren && (
        <CollapsibleContent>
          {children.map((child) => (
            <EapPreviewNode key={child.id} row={child} allRows={allRows} depth={depth + 1} onToggle={onToggle} />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export default function ImportarEapPage() {
  const qc = useQueryClient();
  const { currentProject } = useProjects();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<EapRow[]>([]);
  const [defaultLevelMap, setDefaultLevelMap] = useState<Record<number, number>>({ 1: 1, 2: 2, 3: 3, 4: 4 });
  const [showEstrutura, setShowEstrutura] = useState(false);
  const [nivelFilter, setNivelFilter] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true });

  const cronogramas = useMemo(
    () => (currentProject?.cronogramas ?? []).filter((c) => c.ativo),
    [currentProject],
  );
  const [selectedCronogramaId, setSelectedCronogramaId] = useState<string>("");
  const [levelOffset, setLevelOffset] = useState(0);

  const selectedCronograma = useMemo(
    () => cronogramas.find((c) => c.id === selectedCronogramaId) ?? cronogramas[0] ?? null,
    [cronogramas, selectedCronogramaId],
  );

  const { data: existingSetores = [] } = useQuery({
    queryKey: ["cadastro", "setores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("id,codigo");
      if (error) return [];
      return (data ?? []) as { id: string; codigo: string | null }[];
    },
  });
  const { data: existingAreas = [] } = useQuery({
    queryKey: ["cadastro", "areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id,codigo");
      if (error) return [];
      return (data ?? []) as { id: string; codigo: string | null }[];
    },
  });
  const { data: existingSubareas = [] } = useQuery({
    queryKey: ["cadastro", "subareas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subareas").select("id,codigo");
      if (error) return [];
      return (data ?? []) as { id: string; codigo: string | null }[];
    },
  });
  const { data: existingAtividades = [] } = useQuery({
    queryKey: ["cadastro", "atividades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("atividades").select("id,codigo");
      if (error) return [];
      return (data ?? []) as { id: string; codigo: string | null }[];
    },
  });

  const existingCodes = useMemo(() => {
    const map: Record<number, Set<string>> = {
      1: new Set(existingSetores.filter((x) => x.codigo).map((x) => x.codigo!)),
      2: new Set(existingAreas.filter((x) => x.codigo).map((x) => x.codigo!)),
      3: new Set(existingSubareas.filter((x) => x.codigo).map((x) => x.codigo!)),
      4: new Set(existingAtividades.filter((x) => x.codigo).map((x) => x.codigo!)),
    };
    return map;
  }, [existingSetores, existingAreas, existingSubareas, existingAtividades]);

  function toggleSelect(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  }

  function selectAll() { setRows((prev) => prev.map((r) => ({ ...r, selected: true }))); }
  function deselectAll() { setRows((prev) => prev.map((r) => ({ ...r, selected: false }))); }

  const stats = useMemo(() => {
    const s = { setores: 0, areas: 0, etapas: 0, atividades: 0, total: rows.length, selected: 0, duplicados: 0 };
    for (const r of rows) {
      if (r.selected) s.selected++;
      if (r.nivel === 1) s.setores++;
      else if (r.nivel === 2) s.areas++;
      else if (r.nivel === 3) s.etapas++;
      else if (r.nivel === 4) s.atividades++;
      if (existingCodes[r.nivel]?.has(r.codigo)) s.duplicados++;
    }
    return s;
  }, [rows, existingCodes]);

  function handleLoadFromCronograma() {
    if (!selectedCronograma) {
      toast.error("Nenhum cronograma selecionado.");
      return;
    }
    const acts = selectedCronograma.dados?.activities ?? [];
    if (acts.length === 0) {
      toast.error("O cronograma selecionado não possui atividades.");
      return;
    }
    const parsed = activitiesToEapRows(acts, levelOffset);
    if (parsed.length === 0) {
      toast.error("Nenhuma atividade válida encontrada no cronograma.");
      return;
    }
    setRows(parsed);
    setFileName(`Cronograma: ${selectedCronograma.nome}`);
    toast.success(`${parsed.length} atividades carregadas de "${selectedCronograma.nome}"`);
  }

  const importMut = useMutation({
    mutationFn: async () => {
      const selected = rows.filter((r) => r.selected);
      if (selected.length === 0) throw new Error("Nenhum item selecionado para importação.");

      const codeToId = new Map<string, string>();
      let inserted = 0;
      let skipped = 0;
      let failed = 0;

      const existingByCode = new Map<string, string>();
      for (const [nivel, codes] of Object.entries(existingCodes)) {
        for (const code of codes) existingByCode.set(code, nivel);
      }

      const sorted = [...selected].sort((a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo));

      for (const row of sorted) {
        const table = row.nivel === 1 ? "setores" : row.nivel === 2 ? "areas" : row.nivel === 3 ? "subareas" : "atividades";
        if (existingCodes[row.nivel]?.has(row.codigo)) {
          skipped++;
          continue;
        }

        const payload: Record<string, any> = {
          nome: row.nome,
          codigo: row.codigo,
          ativo: row.ativo,
        };

        if (row.nivel === 2 && row.parentCodigo) {
          if (codeToId.has(row.parentCodigo)) payload.setor_id = codeToId.get(row.parentCodigo);
        }
        if (row.nivel === 3 && row.parentCodigo) {
          if (codeToId.has(row.parentCodigo)) payload.area_id = codeToId.get(row.parentCodigo);
        }
        if (row.nivel === 4 && row.parentCodigo) {
          if (codeToId.has(row.parentCodigo)) payload.subarea_id = codeToId.get(row.parentCodigo);
        }

        const { data, error } = await supabase.from(table).insert(payload).select("id").single();
        if (error) {
          failed++;
          toast.error(`Erro ao importar "${row.nome}": ${error.message}`);
        } else if (data?.id) {
          codeToId.set(row.codigo, data.id);
          existingCodes[row.nivel].add(row.codigo);
          inserted++;
        }
      }
      return { inserted, skipped, failed };
    },
    onSuccess: (r) => {
      toast.success(`Importação concluída: ${r.inserted} inseridos, ${r.skipped} ignorados, ${r.failed} falhas`);
      qc.invalidateQueries({ queryKey: ["cadastro"] });
      setRows([]);
      setFileName("");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const canImport = rows.length > 0 && !importMut.isPending && stats.selected > 0;

  const estruturaTree = useMemo(() => {
    const filtered = rows.filter((r) => nivelFilter[r.nivel]);
    return buildTree(filtered);
  }, [rows, nivelFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Importar EAP</h1>
          <p className="text-sm text-muted-foreground">
            Importe a Estrutura Analítica do Projeto a partir do cronograma XML do projeto.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            1. Selecione o cronograma do projeto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
            {cronogramas.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nenhum cronograma ativo encontrado no projeto atual. Faça o upload de um arquivo XML em <strong>Cronogramas</strong> primeiro.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Cronograma</Label>
                  <Select
                    value={selectedCronogramaId || (cronogramas[0]?.id ?? "")}
                    onValueChange={setSelectedCronogramaId}
                  >
                    <SelectTrigger className="w-full max-w-lg">
                      <SelectValue placeholder="Selecione um cronograma..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cronogramas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                            <span>{c.nome}</span>
                            <span className="text-xs text-muted-foreground ml-1">
                              ({c.dados?.activities?.filter((a) => !a.isSummary).length ?? 0} atividades)
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCronograma && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedCronograma.cor }} />
                      <span className="font-semibold text-sm">{selectedCronograma.nome}</span>
                      <Badge variant="outline" className="text-[10px]">{selectedCronograma.tipo}</Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Total de atividades</p>
                        <p className="font-bold text-lg">{selectedCronograma.dados?.activities?.length ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Atividades folha</p>
                        <p className="font-bold text-lg text-emerald-600">
                          {selectedCronograma.dados?.activities?.filter((a) => !a.isSummary).length ?? 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Resumos (WBS)</p>
                        <p className="font-bold text-lg text-blue-600">
                          {selectedCronograma.dados?.activities?.filter((a) => a.isSummary).length ?? 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Upload em</p>
                        <p className="font-medium">{new Date(selectedCronograma.dataUpload).toLocaleDateString("pt-BR")}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-1">
                      <Label className="text-xs text-muted-foreground shrink-0">Deslocamento de nível</Label>
                      <Select value={String(levelOffset)} onValueChange={(v) => setLevelOffset(Number(v))}>
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[-2, -1, 0, 1, 2, 3].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n === 0 ? "0 (sem ajuste)" : n > 0 ? `+${n} nível(is)` : `${n} nível(is)`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">
                        OutlineLevel 1 → Nível {Math.min(4, Math.max(1, 1 + levelOffset))}
                      </span>
                    </div>
                  </div>
                )}

                <Button onClick={handleLoadFromCronograma} disabled={!selectedCronograma} className="gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Carregar atividades do cronograma
                </Button>

                {fileName && fileName.startsWith("Cronograma:") && (
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {fileName} — {rows.length} itens carregados
                  </span>
                )}
              </>
            )}
          </CardContent>
        </Card>

      {rows.length > 0 && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">2. Mapeamento de Níveis</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((nivel) => {
                  const Icon = NIVEL_ICONS[nivel] ?? Wrench;
                  return (
                    <div key={nivel} className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Icon className={`h-3 w-3 ${NIVEL_COLORS[nivel]}`} /> {NIVEL_LABELS[nivel]}
                      </Label>
                      <Select
                        value={String(defaultLevelMap[nivel] ?? nivel)}
                        onValueChange={(v) => setDefaultLevelMap((p) => ({ ...p, [nivel]: Number(v) }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4].map((n) => (
                            <SelectItem key={n} value={String(n)}>{NIVEL_LABELS[n]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Revise e importe</CardTitle>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                <span>Total: {stats.total}</span>
                <span>Selecionados: {stats.selected}</span>
                <span>Setores: {stats.setores}</span>
                <span>Áreas: {stats.areas}</span>
                <span>Etapas: {stats.etapas}</span>
                <span>Atividades: {stats.atividades}</span>
                {stats.duplicados > 0 && <span className="text-amber-600">Duplicados: {stats.duplicados}</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>Selecionar Todos</Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>Desmarcar Todos</Button>
                <Button variant="outline" size="sm" onClick={() => setShowEstrutura(true)} className="gap-2">
                  <ListTree className="h-4 w-4" />
                  Estrutura de Tópicos
                </Button>
              </div>
              <div className="max-h-[400px] overflow-y-auto space-y-0.5 border rounded-md p-2">
                {buildTree(rows).roots.map((row) => (
                  <EapPreviewNode key={row.id} row={row} allRows={rows} depth={0} onToggle={toggleSelect} />
                ))}
              </div>
              <div className="flex items-center gap-3 pt-2 border-t">
                <div className="ml-auto">
                  <Button onClick={() => importMut.mutate()} disabled={!canImport}>
                    {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Importar {stats.selected} itens
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={showEstrutura} onOpenChange={setShowEstrutura}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTree className="h-5 w-5" />
              Estrutura de Tópicos
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-3 py-2 border-b">
            {[1, 2, 3, 4].map((nivel) => (
              <label key={nivel} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={nivelFilter[nivel]}
                  onChange={(e) => setNivelFilter((p) => ({ ...p, [nivel]: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                {React.createElement(NIVEL_ICONS[nivel]!, { className: `h-3.5 w-3.5 ${NIVEL_COLORS[nivel]}` })}
                <span>{NIVEL_LABELS[nivel]} (Nível {nivel})</span>
              </label>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5 py-2">
            {estruturaTree.roots.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum item para exibir com os filtros selecionados.</p>
            ) : (
              estruturaTree.roots.map((row) => (
                <EstruturaNode key={row.id} row={row} allRows={rows} depth={0} onToggle={toggleSelect} />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EstruturaNode({ row, allRows, depth, onToggle }: { row: EapRow; allRows: EapRow[]; depth: number; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  const children = allRows.filter((r) => r.parentCodigo === row.codigo);
  const hasChildren = children.length > 0;
  const Icon = NIVEL_ICONS[row.nivel] ?? Wrench;
  const colorClass = NIVEL_COLORS[row.nivel] ?? "text-muted-foreground";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded hover:bg-muted/50 text-sm ${!row.selected ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <CollapsibleTrigger asChild>
          <button className="p-0 hover:bg-muted rounded" aria-label={open ? "Recolher" : "Expandir"}>
            {hasChildren
              ? open
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              : <span className="w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <input
          type="checkbox"
          checked={row.selected}
          onChange={() => onToggle(row.id)}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer"
        />
        <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass}`} />
        {row.codigo && (
          <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1 rounded shrink-0">
            {row.codigo}
          </span>
        )}
        <span className={`truncate ${depth === 0 ? "font-semibold" : ""}`}>{row.nome}</span>
        <Badge variant="outline" className="ml-auto text-[10px] shrink-0">
          {NIVEL_LABELS[row.nivel]}
        </Badge>
      </div>
      {hasChildren && (
        <CollapsibleContent>
          {children.map((child) => (
            <EstruturaNode key={child.id} row={child} allRows={allRows} depth={depth + 1} onToggle={onToggle} />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
