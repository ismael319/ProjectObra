import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2, AlertCircle, Loader2, ChevronRight,
  ChevronDown, Map as MapIcon, MapPin, Wrench, Building2,
  Calendar, ListTree,
} from "lucide-react";
import { useProjects } from "@/lib/project-store";
import { useAuth } from "@/lib/auth-context";
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
    // "selected" (já existe na EAP) só é decidido depois, por resolveExistingMatches
    // — aqui ainda não dá pra saber, porque depende de casar com o banco.
    return { id: `act-${a.uid}`, nome: a.name, codigo, nivel, parentCodigo, ativo: true, selected: false };
  });
}

interface ExistingIndex {
  setorIdByNome: Map<string, string>;
  areaIdByKey: Map<string, string>; // `${setor_id}::${codigo}` -> id
  subareaIdByKey: Map<string, string>; // `${area_id}::${codigo}` -> id
  atividadeIdByKey: Map<string, string>; // `${subarea_id}::${codigo}` -> id
}

// Resolve, pra cada linha (respeitando nível pai->filho), se ela já existe no banco
// — sem nenhuma escrita. O Setor (nível 1, sem pai) casa pelo NOME, não pelo
// código: o código é o número WBS do cronograma, e cronogramas diferentes quase
// sempre têm "1" na raiz — casar por código fazia o import de um cronograma novo
// entrar dentro do setor de outro só por coincidência de numeração. Nível 2+ casa
// pelo par (pai já resolvido + código), nunca pelo código isolado, pelo mesmo
// motivo (duas Áreas "1.1" de setores diferentes não podem colidir).
// forcedSetorId: quando o usuário escolhe explicitamente "importar pra dentro
// do Setor X" (em vez de deixar casar pelo nome/criar um novo), TODA linha de
// nível 1 vira filha desse setor, sem nem olhar o nome — dá controle manual pra
// quando o nome do setor raiz do cronograma não é o que se quer usar como chave.
function resolveExistingMatches(rows: EapRow[], index: ExistingIndex, forcedSetorId?: string): Map<string, string> {
  const matched = new Map<string, string>(); // row.id -> id existente no banco
  const dbIdByCodigo = new Map<string, string>(); // código (nesta leva) -> id já resolvido (só p/ casados)
  const sorted = [...rows].sort((a, b) => a.nivel - b.nivel);
  for (const row of sorted) {
    let existingId: string | undefined;
    if (row.nivel === 1) {
      existingId = forcedSetorId || index.setorIdByNome.get(row.nome.trim().toLowerCase());
    } else if (row.parentCodigo) {
      const parentDbId = dbIdByCodigo.get(row.parentCodigo);
      if (parentDbId) {
        const map = row.nivel === 2 ? index.areaIdByKey : row.nivel === 3 ? index.subareaIdByKey : index.atividadeIdByKey;
        existingId = map.get(`${parentDbId}::${row.codigo}`);
      }
    }
    if (existingId) {
      matched.set(row.id, existingId);
      dbIdByCodigo.set(row.codigo, existingId);
    }
  }
  return matched;
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
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? null;
  const projetoId = currentProject?.id ?? null;
  const hasScope = !!organizacaoId && !!projetoId;
  const cadastroQueryKey = ["cadastro", organizacaoId, projetoId] as const;
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
  // "" = criar um Setor novo (comportamento padrão, casa pelo nome). Qualquer
  // outro valor = id de um Setor já existente pra onde TUDO deste cronograma
  // (a partir do nível 1) deve ir, ignorando o nome do WBS raiz.
  const [targetSetorId, setTargetSetorId] = useState<string>("");

  const selectedCronograma = useMemo(
    () => cronogramas.find((c) => c.id === selectedCronogramaId) ?? cronogramas[0] ?? null,
    [cronogramas, selectedCronogramaId],
  );

  const { data: existingSetores = [] } = useQuery({
    queryKey: [...cadastroQueryKey, "setores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("id,codigo,nome").eq("organizacao_id", organizacaoId!).eq("projeto_id", projetoId!);
      if (error) return [];
      return (data ?? []) as { id: string; codigo: string | null; nome: string }[];
    },
    enabled: hasScope,
  });
  const { data: existingAreas = [] } = useQuery({
    queryKey: [...cadastroQueryKey, "areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id,codigo,setor_id").eq("organizacao_id", organizacaoId!).eq("projeto_id", projetoId!);
      if (error) return [];
      return (data ?? []) as { id: string; codigo: string | null; setor_id: string | null }[];
    },
    enabled: hasScope,
  });
  const { data: existingSubareas = [] } = useQuery({
    queryKey: [...cadastroQueryKey, "subareas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subareas").select("id,codigo,area_id").eq("organizacao_id", organizacaoId!).eq("projeto_id", projetoId!);
      if (error) return [];
      return (data ?? []) as { id: string; codigo: string | null; area_id: string | null }[];
    },
    enabled: hasScope,
  });
  const { data: existingAtividades = [] } = useQuery({
    queryKey: [...cadastroQueryKey, "atividades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("atividades").select("id,codigo,subarea_id").eq("organizacao_id", organizacaoId!).eq("projeto_id", projetoId!);
      if (error) return [];
      return (data ?? []) as { id: string; codigo: string | null; subarea_id: string | null }[];
    },
    enabled: hasScope,
  });

  const existingIndex = useMemo<ExistingIndex>(() => {
    const setorIdByNome = new Map<string, string>();
    for (const s of existingSetores) setorIdByNome.set(s.nome.trim().toLowerCase(), s.id);
    const areaIdByKey = new Map<string, string>();
    for (const a of existingAreas) if (a.codigo && a.setor_id) areaIdByKey.set(`${a.setor_id}::${a.codigo}`, a.id);
    const subareaIdByKey = new Map<string, string>();
    for (const sa of existingSubareas) if (sa.codigo && sa.area_id) subareaIdByKey.set(`${sa.area_id}::${sa.codigo}`, sa.id);
    const atividadeIdByKey = new Map<string, string>();
    for (const at of existingAtividades) if (at.codigo && at.subarea_id) atividadeIdByKey.set(`${at.subarea_id}::${at.codigo}`, at.id);
    return { setorIdByNome, areaIdByKey, subareaIdByKey, atividadeIdByKey };
  }, [existingSetores, existingAreas, existingSubareas, existingAtividades]);

  // Ao marcar um item, marca também toda a cadeia de ancestrais — sem isso, o item
  // pode ser inserido sem setor_id/area_id/subarea_id resolvido (órfão, nunca
  // aparece na árvore da EAP, que só renderiza filhos com o pai encadeado). Ao
  // desmarcar, desmarca também os descendentes — não faz sentido manter um filho
  // selecionado se o pai não vai ser importado.
  function toggleSelect(id: string) {
    setRows((prev) => {
      const target = prev.find((r) => r.id === id);
      if (!target) return prev;
      const turningOn = !target.selected;

      if (turningOn) {
        const byCodigo = new Map(prev.map((r) => [r.codigo, r]));
        const toSelect = new Set<string>([id]);
        let cur: EapRow | undefined = target;
        while (cur?.parentCodigo) {
          const parent: EapRow | undefined = byCodigo.get(cur.parentCodigo);
          if (!parent) break;
          toSelect.add(parent.id);
          cur = parent;
        }
        return prev.map((r) => (toSelect.has(r.id) ? { ...r, selected: true } : r));
      }

      const childrenByCodigo = new Map<string, EapRow[]>();
      for (const r of prev) {
        if (!r.parentCodigo) continue;
        const arr = childrenByCodigo.get(r.parentCodigo) ?? [];
        arr.push(r);
        childrenByCodigo.set(r.parentCodigo, arr);
      }
      const toDeselect = new Set<string>();
      const queue: EapRow[] = [target];
      while (queue.length > 0) {
        const node = queue.pop()!;
        toDeselect.add(node.id);
        for (const child of childrenByCodigo.get(node.codigo) ?? []) queue.push(child);
      }
      return prev.map((r) => (toDeselect.has(r.id) ? { ...r, selected: false } : r));
    });
  }

  function selectAll() { setRows((prev) => prev.map((r) => ({ ...r, selected: true }))); }
  function deselectAll() { setRows((prev) => prev.map((r) => ({ ...r, selected: false }))); }

  // Os checkboxes de nível no topo da "Estrutura de Tópicos" filtram o que
  // aparece na árvore, mas também precisam marcar/desmarcar pra importação os
  // itens daquele nível — senão o usuário tem que clicar item por item mesmo
  // depois de já ter dito "quero todas as Atividades", por exemplo.
  function toggleNivelFilter(nivel: number, checked: boolean) {
    setNivelFilter((p) => ({ ...p, [nivel]: checked }));
    setRows((prev) => {
      if (!checked) {
        return prev.map((r) => (r.nivel === nivel ? { ...r, selected: false } : r));
      }
      // Marca o nível inteiro e também a cadeia de ancestrais de cada item —
      // senão entrariam órfãos (sem pai selecionado nem já existente) no import.
      const byCodigo = new Map(prev.map((r) => [r.codigo, r]));
      const toSelect = new Set<string>();
      for (const r of prev) {
        if (r.nivel !== nivel) continue;
        toSelect.add(r.id);
        let cur: EapRow | undefined = r;
        while (cur?.parentCodigo) {
          const parent: EapRow | undefined = byCodigo.get(cur.parentCodigo);
          if (!parent) break;
          toSelect.add(parent.id);
          cur = parent;
        }
      }
      return prev.map((r) => (toSelect.has(r.id) ? { ...r, selected: true } : r));
    });
  }

  const matchedIds = useMemo(
    () => resolveExistingMatches(rows, existingIndex, targetSetorId || undefined),
    [rows, existingIndex, targetSetorId],
  );

  const stats = useMemo(() => {
    const s = { setores: 0, areas: 0, etapas: 0, atividades: 0, total: rows.length, selected: 0, duplicados: 0 };
    for (const r of rows) {
      if (r.selected) s.selected++;
      if (r.nivel === 1) s.setores++;
      else if (r.nivel === 2) s.areas++;
      else if (r.nivel === 3) s.etapas++;
      else if (r.nivel === 4) s.atividades++;
      if (matchedIds.has(r.id)) s.duplicados++;
    }
    return s;
  }, [rows, matchedIds]);

  // Exibe a estrutura/WBS do cronograma selecionado automaticamente — não precisa
  // mais de um botão "Carregar atividades" separado. Reprocessa sempre que o
  // cronograma, o deslocamento de nível ou o cadastro já existente na EAP mudarem.
  // Só vem pré-selecionado o que resolveExistingMatches reconhece como já
  // existente na EAP — todo o resto (inclusive folhas novas) começa desmarcado.
  useEffect(() => {
    if (!selectedCronograma) {
      setRows([]);
      setFileName("");
      return;
    }
    const acts = selectedCronograma.dados?.activities ?? [];
    if (acts.length === 0) {
      setRows([]);
      setFileName("");
      return;
    }
    const parsed = activitiesToEapRows(acts, levelOffset);
    const matched = resolveExistingMatches(parsed, existingIndex, targetSetorId || undefined);
    setRows(parsed.map((r) => ({ ...r, selected: matched.has(r.id) })));
    setFileName(`Cronograma: ${selectedCronograma.nome}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCronograma, levelOffset, existingIndex, targetSetorId]);

  const importMut = useMutation({
    mutationFn: async () => {
      if (!organizacaoId || !projetoId) throw new Error("Selecione uma obra para continuar.");
      const selectedBase = rows.filter((r) => r.selected);
      if (selectedBase.length === 0) throw new Error("Nenhum item selecionado para importação.");

      // Garante que a cadeia de pais de qualquer item selecionado entre junto na
      // importação, mesmo que o checkbox do pai não tenha sido marcado — a seleção
      // pode ter vindo de vários caminhos (clique individual, checkbox de nível em
      // lote, "Selecionar Todos") e nem sempre é óbvio pro usuário que precisa
      // marcar cada ancestral manualmente. Sem isso, o item citado na mensagem de
      // erro simplesmente não era importado.
      const byCodigo = new Map(rows.map((r) => [r.codigo, r]));
      const effectiveIds = new Set(selectedBase.map((r) => r.id));
      let autoIncluidos = 0;
      for (const r of selectedBase) {
        let cur: EapRow | undefined = r;
        while (cur?.parentCodigo) {
          const parent = byCodigo.get(cur.parentCodigo);
          if (!parent || effectiveIds.has(parent.id)) break;
          effectiveIds.add(parent.id);
          autoIncluidos++;
          cur = parent;
        }
      }
      const selected = rows.filter((r) => effectiveIds.has(r.id));

      // Recalcula o casamento com o banco (não confia em matchedIds, que pode estar
      // um tick desatualizado) e semeia dbIdByCodigo só com os ids REALMENTE
      // casados (Setor por nome, nível 2+ por pai+código) — nunca por código cru
      // global, senão volta o bug de setor de um cronograma "herdar" os filhos de
      // outro só por coincidência de numeração WBS. Ainda assim precisa ir
      // crescendo esse mapa conforme insere, senão um item cujo pai já estava
      // cadastrado (e por isso foi pulado como duplicado) ficava sem setor_id/
      // area_id/subarea_id no insert: entrava na tabela mas ficava órfão, e a
      // árvore da EAP (que só desce por FK) nunca mostrava esse item.
      const matched = resolveExistingMatches(rows, existingIndex, targetSetorId || undefined);
      const dbIdByCodigo = new Map<string, string>();
      for (const r of rows) {
        const existingId = matched.get(r.id);
        if (existingId) dbIdByCodigo.set(r.codigo, existingId);
      }

      // O Código EAP é único por TABELA inteira (não só entre irmãos) — e o código
      // vindo do cronograma é só o número WBS, que reinicia em cada cronograma
      // diferente (ex.: "1.9.1" existe em qualquer cronograma que tenha uma 9ª
      // Área com uma 1ª Etapa). Duas linhas de cronogramas DIFERENTES podem ter o
      // mesmo WBS sem serem o mesmo item (resolveExistingMatches já trata isso
      // certo), mas ao inserir as duas como itens NOVOS, a segunda violava a
      // constraint de unicidade do banco. Aqui garante um código final único,
      // testando contra tudo que já existe na tabela + tudo que este import já
      // inseriu, e desambiguando com um sufixo "-2", "-3"... quando precisa.
      const usedCodigos: Record<string, Set<string>> = {
        setores: new Set(existingSetores.map((s) => s.codigo).filter((c): c is string => !!c)),
        areas: new Set(existingAreas.map((a) => a.codigo).filter((c): c is string => !!c)),
        subareas: new Set(existingSubareas.map((s) => s.codigo).filter((c): c is string => !!c)),
        atividades: new Set(existingAtividades.map((a) => a.codigo).filter((c): c is string => !!c)),
      };
      function dedupeCodigo(table: string, codigo: string): string {
        if (!codigo) return codigo;
        let candidate = codigo;
        let n = 2;
        while (usedCodigos[table].has(candidate)) {
          candidate = `${codigo}-${n}`;
          n++;
        }
        usedCodigos[table].add(candidate);
        return candidate;
      }

      let inserted = 0;
      let skipped = 0;
      let failed = 0;

      const sorted = [...selected].sort((a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo));

      for (const row of sorted) {
        const table = row.nivel === 1 ? "setores" : row.nivel === 2 ? "areas" : row.nivel === 3 ? "subareas" : "atividades";
        if (matched.has(row.id)) {
          skipped++;
          continue;
        }

        // Nível > 1 sem o pai resolvido (nem já existente, nem importado antes dele
        // nesta mesma leva) viraria um órfão sem setor_id/area_id/subarea_id — a
        // árvore da EAP nunca mostraria esse item. Em vez de inserir assim
        // silenciosamente, marca como falha com uma mensagem clara: normalmente não
        // deveria acontecer, já que marcar um item também marca os ancestrais.
        if (row.nivel > 1 && row.parentCodigo && !dbIdByCodigo.has(row.parentCodigo)) {
          failed++;
          toast.error(`"${row.nome}" não foi importado: o item pai (${row.parentCodigo}) não está selecionado nem já existe na EAP.`);
          continue;
        }

        const payload: Record<string, any> = {
          nome: row.nome,
          codigo: dedupeCodigo(table, row.codigo),
          ativo: row.ativo,
          organizacao_id: organizacaoId,
          projeto_id: projetoId,
        };

        if (row.nivel === 2 && row.parentCodigo) payload.setor_id = dbIdByCodigo.get(row.parentCodigo);
        if (row.nivel === 3 && row.parentCodigo) payload.area_id = dbIdByCodigo.get(row.parentCodigo);
        if (row.nivel === 4 && row.parentCodigo) payload.subarea_id = dbIdByCodigo.get(row.parentCodigo);

        const { data, error } = await supabase.from(table).insert(payload).select("id").single();
        if (error) {
          failed++;
          toast.error(`Erro ao importar "${row.nome}": ${error.message}`);
        } else if (data?.id) {
          // dbIdByCodigo usa o código ORIGINAL do WBS (o que os filhos referenciam
          // via parentCodigo), não o código final (possivelmente desambiguado)
          // gravado no banco — são dois códigos diferentes de propósito.
          dbIdByCodigo.set(row.codigo, data.id);
          inserted++;
        }
      }
      return { inserted, skipped, failed, autoIncluidos };
    },
    onSuccess: (r) => {
      const extra = r.autoIncluidos > 0 ? ` (${r.autoIncluidos} pai(s) incluído(s) automaticamente)` : "";
      toast.success(`Importação concluída: ${r.inserted} inseridos, ${r.skipped} ignorados, ${r.failed} falhas${extra}`);
      qc.invalidateQueries({ queryKey: cadastroQueryKey });
      setRows([]);
      setFileName("");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const canImport = hasScope && rows.length > 0 && !importMut.isPending && stats.selected > 0;

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

                    <div className="flex items-center gap-4 pt-1">
                      <Label className="text-xs text-muted-foreground shrink-0">Setor de destino</Label>
                      <Select value={targetSetorId || "__novo__"} onValueChange={(v) => setTargetSetorId(v === "__novo__" ? "" : v)}>
                        <SelectTrigger className="w-full max-w-xs h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__novo__">+ Criar novo Setor</SelectItem>
                          {existingSetores
                            .slice()
                            .sort((a, b) => a.nome.localeCompare(b.nome))
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {targetSetorId && (
                      <p className="text-xs text-amber-600">
                        Tudo a partir do nível 1 deste cronograma vai entrar dentro do Setor escolhido acima — o
                        item raiz do WBS não vira um Setor novo, mesmo que o nome seja diferente.
                      </p>
                    )}
                  </div>
                )}

                {fileName && fileName.startsWith("Cronograma:") && (
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Estrutura de "{selectedCronograma?.nome}" — {rows.length} itens ({stats.selected} pré-selecionados)
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
          <p className="text-xs text-muted-foreground -mt-2">
            Marcar/desmarcar um nível abaixo também marca/desmarca pra importação todos os itens desse nível
            (e a cadeia de pais, quando marca).
          </p>
          <div className="flex flex-wrap gap-3 py-2 border-b">
            {[1, 2, 3, 4].map((nivel) => (
              <label key={nivel} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={nivelFilter[nivel]}
                  onChange={(e) => toggleNivelFilter(nivel, e.target.checked)}
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
