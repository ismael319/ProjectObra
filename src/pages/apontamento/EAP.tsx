import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { toast } from "sonner";
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, Building2, Map as MapIcon, MapPin, Wrench,
  Clock, GitMerge, Save, FolderOpen, X, Loader2,
} from "lucide-react";

type Nivel = "setor" | "area" | "subarea" | "atividade";

interface TreeNode {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  nivel: Nivel;
  parentId: string | null;
  children: TreeNode[];
}

// Estrutura mínima gravada num modelo salvo — só forma da árvore, sem horas
// (horas são sempre recalculadas ao vivo a partir dos apontamentos validados).
type SnapshotNode = Pick<TreeNode, "id" | "nome" | "codigo" | "nivel"> & { children: SnapshotNode[] };

function toSnapshot(node: TreeNode): SnapshotNode {
  return { id: node.id, nome: node.nome, codigo: node.codigo, nivel: node.nivel, children: node.children.map(toSnapshot) };
}

const HORAS_DIA_PADRAO = 8; // fallback pra apontamentos validados antes de existir jornada salva

interface EapModelo {
  id: string;
  nome: string;
  estrutura: SnapshotNode[];
  criado_em: string;
}

const NIVEL_CONFIG: Record<Nivel, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; parentField: string | null }> = {
  setor: { label: "Setor", icon: Building2, color: "text-blue-600", parentField: null },
  area: { label: "Área", icon: MapIcon, color: "text-emerald-600", parentField: "setor_id" },
  subarea: { label: "Etapa", icon: MapPin, color: "text-orange-600", parentField: "area_id" },
  atividade: { label: "Atividade", icon: Wrench, color: "text-purple-600", parentField: "subarea_id" },
};

const EMPTY_FORM = { nome: "", codigo: "", ativo: true };

export default function EapPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; nome: string; codigo: string | null; ativo: boolean; nivel: Nivel; parentId?: string } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nivel, setNivel] = useState<Nivel>("setor");
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<{ id: string; nome: string; nivel: Nivel } | null>(null);

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeNivel, setMergeNivel] = useState<Nivel | null>(null);
  const [mergeSelected, setMergeSelected] = useState<Map<string, string>>(new Map()); // id -> nome
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

  const [modeloDialogOpen, setModeloDialogOpen] = useState(false);
  const [modeloNome, setModeloNome] = useState("");
  const [viewingModelo, setViewingModelo] = useState<EapModelo | null>(null);

  const { data: setores = [] } = useQuery({
    queryKey: ["cadastro", "setores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["cadastro", "areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: subareas = [] } = useQuery({
    queryKey: ["cadastro", "subareas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subareas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: atividades = [] } = useQuery({
    queryKey: ["cadastro", "atividades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("atividades").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Apontamentos já validados — só o que passou pela tela de Validação conta
  // como horas "oficiais" na EAP. Cada linha já carrega setor_id/area_id/
  // subarea_id/atividade_id diretamente, então dá pra somar por nível sem
  // precisar percorrer a árvore (robusto a mesclagens/renomeações).
  const { data: apontamentosValidados = [] } = useQuery({
    queryKey: ["apontamentos_diarios", "validados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apontamentos_diarios")
        .select("setor_id,area_id,subarea_id,atividade_id,total,data")
        .eq("validado", true);
      if (error) throw error;
      return data as { setor_id: string | null; area_id: string | null; subarea_id: string | null; atividade_id: string | null; total: number; data: string }[];
    },
  });

  const { data: diasTrabalho = [] } = useQuery({
    queryKey: ["dias_trabalho"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dias_trabalho").select("data,horas_dia");
      if (error) throw error;
      return data as { data: string; horas_dia: number }[];
    },
  });

  const { data: modelos = [] } = useQuery({
    queryKey: ["eap_modelos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("eap_modelos").select("*").order("criado_em", { ascending: false });
      if (error) throw error;
      return data as EapModelo[];
    },
  });

  const horasPorNivel = useMemo(() => {
    const horasDiaMap = new Map(diasTrabalho.map((d) => [d.data, d.horas_dia]));
    const maps: Record<Nivel, Map<string, number>> = {
      setor: new Map(), area: new Map(), subarea: new Map(), atividade: new Map(),
    };
    const campoPorNivel: Record<Nivel, "setor_id" | "area_id" | "subarea_id" | "atividade_id"> = {
      setor: "setor_id", area: "area_id", subarea: "subarea_id", atividade: "atividade_id",
    };
    for (const a of apontamentosValidados) {
      const horasHomem = a.total * (horasDiaMap.get(a.data) ?? HORAS_DIA_PADRAO);
      for (const n of Object.keys(maps) as Nivel[]) {
        const id = a[campoPorNivel[n]];
        if (!id) continue;
        maps[n].set(id, (maps[n].get(id) ?? 0) + horasHomem);
      }
    }
    return maps;
  }, [apontamentosValidados, diasTrabalho]);

  function getHoras(nivel: Nivel, id: string): number {
    return horasPorNivel[nivel].get(id) ?? 0;
  }

  const atividadesComHoras = useMemo(() => {
    const setorById = new Map(setores.map((s) => [s.id, s.nome]));
    const areaById = new Map(areas.map((a) => [a.id, a as any]));
    const subareaById = new Map(subareas.map((sa) => [sa.id, sa as any]));
    return atividades
      .map((at) => {
        const subarea = at.subarea_id ? subareaById.get(at.subarea_id) : null;
        const area = subarea?.area_id ? areaById.get(subarea.area_id) : null;
        const setorNome = area?.setor_id ? setorById.get(area.setor_id) : null;
        const caminho = [setorNome, area?.nome, subarea?.nome].filter(Boolean).join(" / ");
        return { id: at.id, nome: at.nome, caminho, horas: getHoras("atividade", at.id) };
      })
      .sort((a, b) => b.horas - a.horas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atividades, subareas, areas, setores, horasPorNivel]);

  const tree = useMemo(() => {
    const ativBySubarea = new Map<string | null, any[]>();
    for (const at of atividades) {
      const key = at.subarea_id ?? null;
      const list = ativBySubarea.get(key) ?? [];
      list.push(at);
      ativBySubarea.set(key, list);
    }
    return setores
      .filter((s) => s.ativo || !search)
      .map((s) => ({
        id: s.id, nome: s.nome, codigo: s.codigo, ativo: s.ativo, nivel: "setor" as Nivel, parentId: null,
        children: areas
          .filter((a) => a.setor_id === s.id && (a.ativo || !search))
          .map((a) => ({
            id: a.id, nome: a.nome, codigo: a.codigo, ativo: a.ativo, nivel: "area" as Nivel, parentId: s.id,
            children: subareas
              .filter((sa) => sa.area_id === a.id && (sa.ativo || !search))
              .map((sa) => ({
                id: sa.id, nome: sa.nome, codigo: sa.codigo, ativo: sa.ativo, nivel: "subarea" as Nivel, parentId: a.id,
                children: (ativBySubarea.get(sa.id) ?? [])
                  .filter((at) => at.ativo || !search)
                  .map((at) => ({
                    id: at.id, nome: at.nome, codigo: at.codigo, ativo: at.ativo, nivel: "atividade" as Nivel, parentId: sa.id, children: [],
                  })),
              })),
          })),
      }));
  }, [setores, areas, subareas, atividades, search]);

  const filteredTree = useMemo(() => {
    if (!search) return tree;
    const term = search.toLowerCase();
    function filterNode(node: TreeNode): TreeNode | null {
      if (node.nome.toLowerCase().includes(term) || (node.codigo ?? "").toLowerCase().includes(term)) return node;
      const filteredChildren = node.children.map(filterNode).filter(Boolean) as TreeNode[];
      if (filteredChildren.length > 0) return { ...node, children: filteredChildren };
      return null;
    }
    return tree.map(filterNode).filter(Boolean) as TreeNode[];
  }, [tree, search]);

  const invalidateAll = () => { qc.invalidateQueries({ queryKey: ["cadastro"] }); };

  const saveMut = useMutation({
    mutationFn: async () => {
      const table = nivel === "setor" ? "setores" : nivel === "area" ? "areas" : nivel === "subarea" ? "subareas" : "atividades";
      const payload: Record<string, any> = { nome: form.nome, codigo: form.codigo || null, ativo: form.ativo };
      if (nivel === "area") payload.setor_id = parentId;
      if (nivel === "subarea") payload.area_id = parentId;
      if (nivel === "atividade") payload.subarea_id = parentId;
      if (editing) {
        const { error } = await supabase.from(table).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Atualizado" : "Cadastrado"); setOpen(false); setEditing(null); setForm(EMPTY_FORM); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, nivel: n, ativo }: { id: string; nivel: Nivel; ativo: boolean }) => {
      const table = n === "setor" ? "setores" : n === "area" ? "areas" : n === "subarea" ? "subareas" : "atividades";
      const { error } = await supabase.from(table).update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const deleteMut = useMutation({
    mutationFn: async ({ id, nivel: n }: { id: string; nivel: Nivel }) => {
      const table = n === "setor" ? "setores" : n === "area" ? "areas" : n === "subarea" ? "subareas" : "atividades";
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Excluído"); invalidateAll(); setConfirm(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mescla N itens do mesmo nível em 1: reatribui filhos e apontamentos históricos
  // pro item de destino, depois apaga os itens de origem. Preserva o total de
  // horas já apontado — ele passa a contar pro item resultante.
  const mergeMut = useMutation({
    mutationFn: async () => {
      if (!mergeNivel || !mergeTargetId) throw new Error("Selecione o item de destino");
      const sourceIds = [...mergeSelected.keys()].filter((id) => id !== mergeTargetId);
      if (sourceIds.length === 0) throw new Error("Selecione pelo menos 2 itens pra mesclar");
      const targetNome = mergeSelected.get(mergeTargetId)!;

      const table = mergeNivel === "setor" ? "setores" : mergeNivel === "area" ? "areas" : mergeNivel === "subarea" ? "subareas" : "atividades";
      const childTable = mergeNivel === "setor" ? "areas" : mergeNivel === "area" ? "subareas" : mergeNivel === "subarea" ? "atividades" : null;
      const childField = mergeNivel === "setor" ? "setor_id" : mergeNivel === "area" ? "area_id" : mergeNivel === "subarea" ? "subarea_id" : null;
      const apontField = mergeNivel === "setor" ? "setor_id" : mergeNivel === "area" ? "area_id" : mergeNivel === "subarea" ? "subarea_id" : "atividade_id";
      const apontNomeField = mergeNivel === "setor" ? "setor_nome" : mergeNivel === "area" ? "area_nome" : mergeNivel === "subarea" ? "subarea_nome" : "atividade_nome";

      if (childTable && childField) {
        const { error } = await supabase.from(childTable).update({ [childField]: mergeTargetId }).in(childField, sourceIds);
        if (error) throw error;
      }
      const { error: apontErr } = await supabase
        .from("apontamentos_diarios")
        .update({ [apontField]: mergeTargetId, [apontNomeField]: targetNome })
        .in(apontField, sourceIds);
      if (apontErr) throw apontErr;
      if (mergeNivel === "atividade") {
        await supabase.from("cronograma_itens").update({ atividade_id: mergeTargetId }).in("atividade_id", sourceIds);
      }
      const { error: delErr } = await supabase.from(table).delete().in("id", sourceIds);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      toast.success("Itens mesclados — histórico de horas preservado no item resultante");
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["apontamentos_diarios"] });
      cancelMerge();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveModeloMut = useMutation({
    mutationFn: async () => {
      if (!modeloNome.trim()) throw new Error("Dê um nome ao modelo");
      const estrutura = tree.map(toSnapshot);
      const { error } = await supabase.from("eap_modelos").insert({ nome: modeloNome.trim(), estrutura });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modelo salvo");
      setModeloDialogOpen(false);
      setModeloNome("");
      qc.invalidateQueries({ queryKey: ["eap_modelos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteModeloMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eap_modelos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Modelo excluído"); qc.invalidateQueries({ queryKey: ["eap_modelos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew(n: Nivel, pId?: string) { setEditing(null); setForm(EMPTY_FORM); setNivel(n); setParentId(pId); setOpen(true); }
  function openEdit(node: TreeNode) { setEditing({ id: node.id, nome: node.nome, codigo: node.codigo, ativo: node.ativo, nivel: node.nivel, parentId: node.parentId ?? undefined }); setForm({ nome: node.nome, codigo: node.codigo ?? "", ativo: node.ativo }); setNivel(node.nivel); setParentId(node.parentId ?? undefined); setOpen(true); }
  function handleDelete(node: TreeNode) { setConfirm({ id: node.id, nome: node.nome, nivel: node.nivel }); }

  function cancelMerge() { setMergeMode(false); setMergeNivel(null); setMergeSelected(new Map()); setMergeTargetId(null); }

  function toggleMergeSelect(node: TreeNode) {
    const isSelected = mergeSelected.has(node.id);
    if (!isSelected && mergeSelected.size > 0 && mergeNivel !== node.nivel) {
      toast.error(`Selecione apenas itens do nível "${NIVEL_CONFIG[mergeNivel as Nivel].label}" para mesclar`);
      return;
    }
    const next = new Map(mergeSelected);
    if (isSelected) next.delete(node.id);
    else next.set(node.id, node.nome);
    setMergeSelected(next);
    setMergeNivel(next.size > 0 ? node.nivel : null);
    if (next.size === 0) setMergeTargetId(null);
    else if (!mergeTargetId || !next.has(mergeTargetId)) setMergeTargetId([...next.keys()][0]);
  }

  const stats = useMemo(() => ({
    setores: setores.length, areas: areas.length, subareas: subareas.length, atividades: atividades.length,
  }), [setores, areas, subareas, atividades]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">EAP - Estrutura Analítica</h1>
          <p className="text-sm text-muted-foreground">Visualize e gerencie a hierarquia do projeto. Horas apontadas (validadas) aparecem ao lado de cada item.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline"><FolderOpen className="h-4 w-4" /> Modelos salvos {modelos.length > 0 && `(${modelos.length})`}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-2">
                <p className="text-sm font-medium">Modelos de EAP salvos</p>
                {modelos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum modelo salvo ainda.</p>}
                {modelos.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{m.nome}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(m.criado_em).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setViewingModelo(m)}>Ver</Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => { if (window.confirm(`Excluir o modelo "${m.nome}"?`)) deleteModeloMut.mutate(m.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={() => setModeloDialogOpen(true)}><Save className="h-4 w-4" /> Salvar modelo</Button>
          {mergeMode ? (
            <Button variant="outline" onClick={cancelMerge}><X className="h-4 w-4" /> Cancelar mesclagem</Button>
          ) : (
            <Button variant="outline" onClick={() => setMergeMode(true)}><GitMerge className="h-4 w-4" /> Mesclar</Button>
          )}
          <Button onClick={() => openNew("setor")}><Plus className="h-4 w-4" /> Novo Setor</Button>
        </div>
      </div>

      {mergeMode && (
        <Card className="border-blue-300 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm">
              {mergeSelected.size === 0
                ? "Clique em itens do mesmo nível na árvore pra selecionar quais mesclar."
                : `${mergeSelected.size} ${mergeNivel ? NIVEL_CONFIG[mergeNivel].label.toLowerCase() : ""}(s) selecionado(s). Escolha qual vira o item final:`}
            </p>
            {mergeSelected.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {[...mergeSelected.entries()].map(([id, nome]) => (
                  <label key={id} className="flex items-center gap-1.5 text-sm rounded-full border px-2.5 py-1 cursor-pointer bg-background">
                    <input type="radio" name="mergeTarget" checked={mergeTargetId === id} onChange={() => setMergeTargetId(id)} />
                    {nome}
                  </label>
                ))}
                <Button
                  size="sm"
                  onClick={() => mergeMut.mutate()}
                  disabled={mergeSelected.size < 2 || !mergeTargetId || mergeMut.isPending}
                >
                  {mergeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />} Mesclar em "{mergeTargetId ? mergeSelected.get(mergeTargetId) : ""}"
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["setor", "area", "subarea", "atividade"] as Nivel[]).map((n) => {
          const cfg = NIVEL_CONFIG[n];
          const Icon = cfg.icon;
          return (
            <Card key={n}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-md bg-muted ${cfg.color}`}><Icon className="h-4 w-4" /></div>
                <div>
                  <div className="text-lg font-bold">{stats[n + "s" as keyof typeof stats]}</div>
                  <div className="text-xs text-muted-foreground">{cfg.label}s</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar na árvore..." className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {filteredTree.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">Nenhum registro encontrado. Comece cadastrando um Setor.</p>
          )}
          {filteredTree.map((setor) => (
            <EapNode
              key={setor.id} node={setor} depth={0}
              onEdit={openEdit} onAdd={openNew} onDelete={handleDelete} onToggle={toggleMut.mutate}
              getHoras={getHoras}
              mergeMode={mergeMode} mergeNivel={mergeNivel} mergeSelected={mergeSelected} onMergeToggle={toggleMergeSelect}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Atividades — horas apontadas</CardTitle>
        </CardHeader>
        <CardContent>
          {atividadesComHoras.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nenhuma atividade cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Atividade</TableHead>
                  <TableHead>Setor / Área / Etapa</TableHead>
                  <TableHead className="text-right">Horas apontadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atividadesComHoras.map((at) => (
                  <TableRow key={at.id}>
                    <TableCell className="font-medium">{at.nome}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{at.caminho || "—"}</TableCell>
                    <TableCell className="text-right">
                      {at.horas > 0 ? (
                        <Badge variant="secondary">{at.horas.toLocaleString("pt-BR")}h</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} {NIVEL_CONFIG[nivel].label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Código EAP</Label><Input value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} placeholder="Ex: S01, A01, SA01" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={(v) => setForm((p) => ({ ...p, ativo: v }))} /><Label>Ativo</Label></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.nome || saveMut.isPending}>{saveMut.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {confirm ? NIVEL_CONFIG[confirm.nivel].label : ""}?</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir <strong>{confirm?.nome}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && deleteMut.mutate({ id: confirm.id, nivel: confirm.nivel })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={modeloDialogOpen} onOpenChange={setModeloDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Salvar modelo de EAP</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Salva a estrutura atual da árvore (setores/áreas/etapas/atividades) sob um nome. As horas continuam
              sendo calculadas ao vivo toda vez que o modelo for aberto.
            </p>
            <div className="space-y-1.5">
              <Label>Nome do modelo *</Label>
              <Input value={modeloNome} onChange={(e) => setModeloNome(e.target.value)} placeholder="Ex: EAP para apresentação — Julho/2026" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModeloDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveModeloMut.mutate()} disabled={!modeloNome.trim() || saveModeloMut.isPending}>
              {saveModeloMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingModelo} onOpenChange={(o) => !o && setViewingModelo(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingModelo?.nome}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Salvo em {viewingModelo && new Date(viewingModelo.criado_em).toLocaleString("pt-BR")} · horas ao vivo (atualizadas com os apontamentos validados de hoje)
          </p>
          <div className="space-y-1">
            {viewingModelo?.estrutura.map((n) => (
              <SnapshotNodeView key={n.id} node={n} depth={0} getHoras={getHoras} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EapNode({ node, depth, onEdit, onAdd, onDelete, onToggle, getHoras, mergeMode, mergeNivel, mergeSelected, onMergeToggle, defaultOpen = true }: {
  node: TreeNode; depth: number; onEdit: (node: TreeNode) => void; onAdd: (nivel: Nivel, parentId?: string) => void;
  onDelete: (node: TreeNode) => void; onToggle: (args: { id: string; nivel: Nivel; ativo: boolean }) => void;
  getHoras: (nivel: Nivel, id: string) => number;
  mergeMode: boolean; mergeNivel: Nivel | null; mergeSelected: Map<string, string>; onMergeToggle: (node: TreeNode) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = NIVEL_CONFIG[node.nivel];
  const Icon = cfg.icon;
  const hasChildren = node.children.length > 0;
  const nextNivel: Nivel | null = node.nivel === "setor" ? "area" : node.nivel === "area" ? "subarea" : node.nivel === "subarea" ? "atividade" : null;
  const horas = getHoras(node.nivel, node.id);
  const desabilitadoNoMerge = mergeMode && mergeNivel !== null && mergeNivel !== node.nivel && !mergeSelected.has(node.id);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`flex items-center gap-1 rounded-md py-1 px-2 hover:bg-muted/50 group ${!node.ativo ? "opacity-50" : ""} ${desabilitadoNoMerge ? "opacity-40" : ""}`} style={{ marginLeft: `${depth * 20}px` }}>
        {mergeMode && (
          <input
            type="checkbox"
            className="mr-1"
            checked={mergeSelected.has(node.id)}
            disabled={desabilitadoNoMerge}
            onChange={() => onMergeToggle(node)}
          />
        )}
        <CollapsibleTrigger asChild>
          <button className="p-0.5 hover:bg-muted rounded" aria-label={open ? "Recolher" : "Expandir"}>
            {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
        {node.codigo && <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1 rounded">{node.codigo}</span>}
        <span
          className={`text-sm ${node.nivel === "setor" ? "font-semibold" : ""} ${mergeMode ? "cursor-pointer" : ""}`}
          onClick={() => mergeMode && onMergeToggle(node)}
        >
          {node.nome}
        </span>
        {horas > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full" title="Horas apontadas (validadas)">
            <Clock className="h-3 w-3" /> {horas.toLocaleString("pt-BR")}h
          </span>
        )}
        {!mergeMode && (
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Switch checked={node.ativo} onCheckedChange={() => onToggle({ id: node.id, nivel: node.nivel, ativo: !node.ativo })} className="scale-75" />
            {nextNivel && (
              <button onClick={() => onAdd(nextNivel, node.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={`Adicionar ${NIVEL_CONFIG[nextNivel].label}`}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => onEdit(node)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => onDelete(node)} className="p-1 rounded hover:bg-destructive/10 text-destructive" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
      {hasChildren && (
        <CollapsibleContent>
          <div className="border-l" style={{ marginLeft: `${depth * 20 + 12}px` }}>
            {node.children.map((child) => (
              <EapNode
                key={child.id} node={child} depth={depth + 1}
                onEdit={onEdit} onAdd={onAdd} onDelete={onDelete} onToggle={onToggle}
                getHoras={getHoras}
                mergeMode={mergeMode} mergeNivel={mergeNivel} mergeSelected={mergeSelected} onMergeToggle={onMergeToggle}
              />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function SnapshotNodeView({ node, depth, getHoras }: { node: SnapshotNode; depth: number; getHoras: (nivel: Nivel, id: string) => number }) {
  const [open, setOpen] = useState(true);
  const cfg = NIVEL_CONFIG[node.nivel];
  const Icon = cfg.icon;
  const hasChildren = node.children.length > 0;
  const horas = getHoras(node.nivel, node.id);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1 rounded-md py-1 px-2" style={{ marginLeft: `${depth * 20}px` }}>
        <CollapsibleTrigger asChild>
          <button className="p-0.5 hover:bg-muted rounded" aria-label={open ? "Recolher" : "Expandir"}>
            {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
        {node.codigo && <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1 rounded">{node.codigo}</span>}
        <span className={`text-sm ${node.nivel === "setor" ? "font-semibold" : ""}`}>{node.nome}</span>
        {horas > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            <Clock className="h-3 w-3" /> {horas.toLocaleString("pt-BR")}h
          </span>
        )}
      </div>
      {hasChildren && (
        <CollapsibleContent>
          <div className="border-l" style={{ marginLeft: `${depth * 20 + 12}px` }}>
            {node.children.map((child) => (
              <SnapshotNodeView key={child.id} node={child} depth={depth + 1} getHoras={getHoras} />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
