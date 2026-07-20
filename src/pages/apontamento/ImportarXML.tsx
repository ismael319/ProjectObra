import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { toast } from "sonner";
import { FileCode, CheckCircle2, AlertCircle, Loader2, ChevronRight, ChevronDown, Map as MapIcon, MapPin, Wrench, HardHat, Filter } from "lucide-react";

interface XmlTask {
  uid: string; name: string; wbs: string; outlineNumber: string; outlineLevel: number;
  type: number; duration: string | null; start: string | null; finish: string | null;
  isNull: boolean; customFields: Record<string, string>; children: XmlTask[]; selected: boolean;
}

const NIVEL_LABELS = ["", "Projeto", "Área", "Etapa", "Atividade"] as const;
const NIVEL_ICONS = [null, HardHat, MapIcon, MapPin, Wrench] as const;
const NIVEL_COLORS = ["", "text-blue-600", "text-emerald-600", "text-orange-600", "text-purple-600"] as const;

const COLUMN_TRANSLATIONS: Record<string, string> = {
  UID: "Código", Name: "Nome", WBS: "EDT", OutlineNumber: "Código estrutura", OutlineLevel: "Nível",
  Type: "Tipo", Duration: "Duração", Start: "Início", Finish: "Término", PercentComplete: "% Concluído",
};

function translateColumn(col: string, aliases?: Record<string, string>): string {
  if (aliases?.[col]) return aliases[col];
  if (COLUMN_TRANSLATIONS[col]) return COLUMN_TRANSLATIONS[col];
  const match = col.match(/^(Text|Flag|Number|Date|Cost|OutlineCode)(\d+)$/);
  if (match) {
    const pt: Record<string, string> = { Text: "Texto", Flag: "Marca", Number: "Número", Date: "Data", Cost: "Custo", OutlineCode: "Código estrutura" };
    return `${pt[match[1]]} ${match[2]}`;
  }
  return col;
}

function parseMsProjectXml(xmlText: string): { tasks: XmlTask[]; fieldAliases: Record<string, string> } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML inválido: " + parseError.textContent);
  const fieldAliases: Record<string, string> = {};
  doc.querySelectorAll("LocalCustomFields LocalField").forEach((lf) => {
    const fieldId = lf.querySelector("FieldID")?.textContent;
    const alias = lf.querySelector("Alias")?.textContent;
    if (fieldId && alias) fieldAliases[fieldId] = alias;
  });
  doc.querySelectorAll("ExtendedAttributes ExtendedAttribute").forEach((ea) => {
    const fieldId = ea.querySelector("FieldID")?.textContent;
    const alias = ea.querySelector("Alias")?.textContent;
    if (fieldId && alias && !fieldAliases[fieldId]) fieldAliases[fieldId] = alias;
  });
  const taskNodes = doc.querySelectorAll("Task");
  const rawTasks: Record<string, XmlTask> = {};
  taskNodes.forEach((node) => {
    const getText = (tag: string) => node.querySelector(tag)?.textContent ?? "";
    const getBool = (tag: string) => { const el = node.querySelector(tag); return el ? el.textContent === "1" || el.textContent?.toLowerCase() === "true" : false; };
    const uid = getText("UID");
    const isNull = getBool("IsNull");
    if (isNull || uid === "0") return;
    const customFields: Record<string, string> = {};
    for (const child of Array.from(node.children)) {
      if (child.children.length === 0 && child.textContent) customFields[child.tagName] = child.textContent;
    }
    rawTasks[uid] = { uid, name: getText("Name"), wbs: getText("WBS"), outlineNumber: getText("OutlineNumber"), outlineLevel: parseInt(getText("OutlineLevel") || "0", 10), type: parseInt(getText("Type") || "1", 10), duration: getText("Duration") || null, start: getText("Start") || null, finish: getText("Finish") || null, isNull, customFields, children: [], selected: true };
  });
  const allTasks = Object.values(rawTasks).sort((a, b) => {
    const aParts = a.outlineNumber.split(".").map(Number);
    const bParts = b.outlineNumber.split(".").map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) { const aVal = aParts[i] ?? 0; const bVal = bParts[i] ?? 0; if (aVal !== bVal) return aVal - bVal; }
    return 0;
  });
  const rootTasks: XmlTask[] = [];
  for (const task of allTasks) {
    const parts = task.outlineNumber.split(".");
    if (parts.length <= 1) { rootTasks.push(task); }
    else {
      const parentNumber = parts.slice(0, -1).join(".");
      let parent: XmlTask | null = null;
      for (const t of allTasks) { if (t.outlineNumber === parentNumber) { parent = t; break; } }
      if (parent) parent.children.push(task);
      else rootTasks.push(task);
    }
  }
  return { tasks: rootTasks, fieldAliases };
}

function formatDuration(dur: string | null): string {
  if (!dur) return "";
  const matchH = dur.match(/(\d+)H/);
  if (matchH) return `${matchH[1]}h`;
  return dur.replace(/^PT/, "").replace(/M0S$/, "").replace(/H0M0S$/, "h");
}

function parseDurationHours(dur: string | null): number | null {
  if (!dur) return null;
  const matchH = dur.match(/(\d+)H/);
  if (matchH) return parseInt(matchH[1], 10);
  const matchD = dur.match(/(\d+)d/);
  if (matchD) return parseInt(matchD[1], 10) * 8;
  return null;
}

function outlineDepth(outlineNumber: string): number { return outlineNumber.split(".").length; }

function TreeNode({ node, levelMap, onToggleSelect }: { node: XmlTask; levelMap: Record<number, number>; onToggleSelect: (uid: string) => void }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const d = outlineDepth(node.outlineNumber);
  const indent = d - 1;
  const mappedLevel = levelMap[d] ?? 0;
  const isSubItem = d >= 5;
  const Icon = mappedLevel >= 1 && mappedLevel <= 4 ? NIVEL_ICONS[mappedLevel] : null;
  const colorClass = mappedLevel >= 1 && mappedLevel <= 4 ? NIVEL_COLORS[mappedLevel] : "text-muted-foreground";
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`flex items-center gap-1.5 py-1 px-2 rounded hover:bg-muted/50 group text-sm ${!node.selected ? "opacity-50" : ""} ${isSubItem ? "text-[13px]" : ""}`} style={{ paddingLeft: `${indent * 16 + 8}px` }}>
        <CollapsibleTrigger asChild>
          <button className="p-0 hover:bg-muted rounded" aria-label={open ? "Recolher" : "Expandir"}>
            {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : <span className="w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <input type="checkbox" checked={node.selected} onChange={() => onToggleSelect(node.uid)} className="h-3.5 w-3.5 shrink-0 cursor-pointer" />
        {!isSubItem && Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass}`} />}
        {isSubItem && <Wrench className="h-3 w-3 shrink-0 text-purple-600" />}
        <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1 rounded shrink-0">{node.outlineNumber}</span>
        <span className={`truncate ${isSubItem ? "text-[13px] text-muted-foreground" : ""} ${d === 1 ? "font-semibold" : ""}`}>{node.name}</span>
        {mappedLevel > 0 && <Badge variant="outline" className="ml-auto text-[10px] shrink-0">{NIVEL_LABELS[mappedLevel]}</Badge>}
        {node.duration && <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">{formatDuration(node.duration)}</span>}
      </div>
      {hasChildren && <CollapsibleContent>{node.children.map((child) => <TreeNode key={child.uid} node={child} levelMap={levelMap} onToggleSelect={onToggleSelect} />)}</CollapsibleContent>}
    </Collapsible>
  );
}

function flattenTree(list: XmlTask[]): XmlTask[] { const flat: XmlTask[] = []; for (const t of list) { flat.push(t); flat.push(...flattenTree(t.children)); } return flat; }

export default function ImportarXmlPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [tasks, setTasks] = useState<XmlTask[]>([]);
  const [fieldAliases, setFieldAliases] = useState<Record<string, string>>({});
  const [levelMap, setLevelMap] = useState<Record<number, number>>({ 1: 1, 2: 2, 3: 3, 4: 4 });
  const [parsing, setParsing] = useState(false);
  const [saveAsCronograma, setSaveAsCronograma] = useState(true);

  function toggleSelect(uid: string) {
    function toggleInList(list: XmlTask[]): XmlTask[] {
      return list.map((t) => {
        if (t.uid === uid) {
          if (!t.selected) return { ...t, selected: true };
          function deselectAll(node: XmlTask): XmlTask { return { ...node, selected: false, children: node.children.map(deselectAll) }; }
          return deselectAll(t);
        }
        return { ...t, children: toggleInList(t.children) };
      });
    }
    setTasks((prev) => toggleInList(prev));
  }

  const flatTasks = useMemo(() => flattenTree(tasks), [tasks]);
  const selectedTasks = useMemo(() => flatTasks.filter((t) => t.selected), [flatTasks]);

  const stats = useMemo(() => {
    const s = { projetos: 0, areas: 0, etapas: 0, atividades: 0, unmapped: 0, total: flatTasks.length, selected: 0 };
    for (const t of flatTasks) { const d = outlineDepth(t.outlineNumber); const mapped = levelMap[d] ?? 0; if (t.selected) s.selected++; if (mapped === 1) s.projetos++; else if (mapped === 2) s.areas++; else if (mapped === 3) s.etapas++; else if (mapped === 4 || d >= 5) s.atividades++; else s.unmapped++; }
    return s;
  }, [flatTasks, levelMap]);

  async function handleFile(file: File) {
    setParsing(true);
    try { const text = await file.text(); const result = parseMsProjectXml(text); setTasks(result.tasks); setFieldAliases(result.fieldAliases); setFileName(file.name); }
    catch (e: any) { toast.error("Erro ao ler XML: " + e.message); }
    finally { setParsing(false); }
  }

  const importMut = useMutation({
    mutationFn: async () => {
      const [s, a, sa, at] = await Promise.all([
        supabase.from("setores").select("id,codigo"),
        supabase.from("areas").select("id,codigo"),
        supabase.from("subareas").select("id,codigo"),
        supabase.from("atividades").select("id,codigo"),
      ]);
      const existingCodes: Record<number, Set<string>> = {
        1: new Set((s.data ?? []).filter((x) => x.codigo).map((x) => x.codigo!)),
        2: new Set((a.data ?? []).filter((x) => x.codigo).map((x) => x.codigo!)),
        3: new Set((sa.data ?? []).filter((x) => x.codigo).map((x) => x.codigo!)),
        4: new Set((at.data ?? []).filter((x) => x.codigo).map((x) => x.codigo!)),
      };
      const codeToId = new Map<string, string>();
      let inserted = 0, skipped = 0, failed = 0;
      const sortedTasks = [...selectedTasks].sort((a, b) => outlineDepth(a.outlineNumber) - outlineDepth(b.outlineNumber));
      for (const task of sortedTasks) {
        const d = outlineDepth(task.outlineNumber);
        const mappedLevel = levelMap[d] ?? 0;
        const isSubItem = d >= 5;
        if (mappedLevel === 0 && !isSubItem) { skipped++; continue; }
        const table = isSubItem ? "atividades" : mappedLevel === 1 ? "setores" : mappedLevel === 2 ? "areas" : mappedLevel === 4 ? "atividades" : "subareas";
        const code = task.outlineNumber;
        const dbLevel = isSubItem ? 4 : mappedLevel;
        if (existingCodes[dbLevel].has(code)) { skipped++; continue; }
        const payload: Record<string, any> = { nome: task.name, codigo: code, ativo: true, obs: task.duration ? `Duração: ${formatDuration(task.duration)}` : null };
        if (isSubItem || mappedLevel === 4) { const parentCode = task.outlineNumber.split(".").slice(0, -1).join("."); payload.subarea_id = codeToId.get(parentCode); }
        else if (mappedLevel === 3) { const parentCode = task.outlineNumber.split(".").slice(0, -1).join("."); payload.area_id = codeToId.get(parentCode); }
        else if (mappedLevel === 2) { const parentCode = task.outlineNumber.split(".").slice(0, -1).join("."); payload.setor_id = codeToId.get(parentCode); }
        if ((isSubItem || mappedLevel === 4) && !payload.subarea_id) { skipped++; continue; }
        else if (mappedLevel === 3 && !payload.area_id) { skipped++; continue; }
        else if (mappedLevel === 2 && !payload.setor_id) { skipped++; continue; }
        const { data, error } = await supabase.from(table).insert(payload).select("id").single();
        if (error) { failed++; toast.error(`Erro ao importar "${task.name}": ${error.message}`); }
        else if (data?.id) { codeToId.set(code, data.id); existingCodes[dbLevel].add(code); inserted++; }
      }
      if (saveAsCronograma) {
        const cronogramaName = fileName.replace(/\.xml$/i, "");
        const { data: cronogramaData, error: cronogramaErr } = await supabase.from("cronogramas").insert({ nome: cronogramaName }).select("id").single();
        if (!cronogramaErr && cronogramaData?.id) {
          const cronogramaId = cronogramaData.id;
          const codeToItemId = new Map<string, string>();
          let cronInserts = 0;
          for (const task of sortedTasks) {
            const code = task.outlineNumber;
            const parentCode = code.split(".").slice(0, -1).join(".");
            const parentId = codeToItemId.get(parentCode) ?? null;
            const hhTotal = task.duration ? parseDurationHours(task.duration) : null;
            const { data: itemData, error: itemErr } = await supabase.from("cronograma_itens").insert({ cronograma_id: cronogramaId, indice: code, nome: task.name, nivel: task.outlineLevel, pai_id: parentId, hh_total: hhTotal, hh_ganho: null, hh_consumido: null, status: null, produtividade: null, aderencia: null, projecao_hh: null, atividade_id: null, ativo: true }).select("id").single();
            if (!itemErr && itemData?.id) { codeToItemId.set(code, itemData.id); cronInserts++; }
          }
          toast.success(`Cronograma "${cronogramaName}" criado com ${cronInserts} itens`);
        }
      }
      return { inserted, skipped, failed };
    },
    onSuccess: (r) => { toast.success(`Importação concluída: ${r.inserted} inseridos, ${r.skipped} ignorados, ${r.failed} falhas`); qc.invalidateQueries(); setTasks([]); setFileName(""); if (fileRef.current) fileRef.current.value = ""; },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const canImport = tasks.length > 0 && !importMut.isPending && stats.selected > 0 && stats.projetos > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Importar XML (MS Project)</h1>
          <p className="text-sm text-muted-foreground">Importe o cronograma do MS Project para montar a EAP automaticamente.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Selecione o arquivo XML</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCode className="mr-2 h-4 w-4" />}
            Escolher arquivo XML
          </Button>
          {fileName && <span className="text-sm text-muted-foreground flex items-center gap-2"><FileCode className="h-4 w-4" /> {fileName}</span>}
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">2. Configure o mapeamento de níveis</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((depth) => (
                  <div key={depth} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Profundidade {depth}</Label>
                    <select value={levelMap[depth] ?? 0} onChange={(e) => setLevelMap((p) => ({ ...p, [depth]: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5 text-sm">
                      <option value={0}>Não usar</option>
                      <option value={1}>Nível 1 (Setor)</option>
                      <option value={2}>Nível 2 (Área)</option>
                      <option value={3}>Nível 3 (Etapa)</option>
                      <option value={4}>Nível 4 (Atividade)</option>
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Revise e importe</CardTitle>
              <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                <span>Total: {stats.total}</span>
                <span>Selecionados: {stats.selected}</span>
                <span>Projetos: {stats.projetos}</span>
                <span>Áreas: {stats.areas}</span>
                <span>Etapas: {stats.etapas}</span>
                <span>Atividades: {stats.atividades}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[400px] overflow-y-auto space-y-0.5">
                {tasks.map((task) => <TreeNode key={task.uid} node={task} levelMap={levelMap} onToggleSelect={toggleSelect} />)}
              </div>
              <div className="flex items-center gap-3 pt-2 border-t">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={saveAsCronograma} onChange={(e) => setSaveAsCronograma(e.target.checked)} className="rounded" />
                  Salvar como cronograma
                </label>
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
    </div>
  );
}
