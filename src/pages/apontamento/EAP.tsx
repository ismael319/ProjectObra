import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, PowerOff, Building2, Map as MapIcon, MapPin, Wrench } from "lucide-react";

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

  function openNew(n: Nivel, pId?: string) { setEditing(null); setForm(EMPTY_FORM); setNivel(n); setParentId(pId); setOpen(true); }
  function openEdit(node: TreeNode) { setEditing({ id: node.id, nome: node.nome, codigo: node.codigo, ativo: node.ativo, nivel: node.nivel, parentId: node.parentId ?? undefined }); setForm({ nome: node.nome, codigo: node.codigo ?? "", ativo: node.ativo }); setNivel(node.nivel); setParentId(node.parentId ?? undefined); setOpen(true); }
  function handleDelete(node: TreeNode) { setConfirm({ id: node.id, nome: node.nome, nivel: node.nivel }); }

  const stats = useMemo(() => ({
    setores: setores.length, areas: areas.length, subareas: subareas.length, atividades: atividades.length,
  }), [setores, areas, subareas, atividades]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">EAP - Estrutura Analítica</h1>
          <p className="text-sm text-muted-foreground">Visualize e gerencie a hierarquia do projeto.</p>
        </div>
        <Button onClick={() => openNew("setor")}><Plus className="h-4 w-4" /> Novo Setor</Button>
      </div>

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
            <EapNode key={setor.id} node={setor} depth={0} onEdit={openEdit} onAdd={openNew} onDelete={handleDelete} onToggle={toggleMut.mutate} />
          ))}
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
    </div>
  );
}

function EapNode({ node, depth, onEdit, onAdd, onDelete, onToggle, defaultOpen = true }: {
  node: TreeNode; depth: number; onEdit: (node: TreeNode) => void; onAdd: (nivel: Nivel, parentId?: string) => void;
  onDelete: (node: TreeNode) => void; onToggle: (args: { id: string; nivel: Nivel; ativo: boolean }) => void; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = NIVEL_CONFIG[node.nivel];
  const Icon = cfg.icon;
  const hasChildren = node.children.length > 0;
  const nextNivel: Nivel | null = node.nivel === "setor" ? "area" : node.nivel === "area" ? "subarea" : node.nivel === "subarea" ? "atividade" : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`flex items-center gap-1 rounded-md py-1 px-2 hover:bg-muted/50 group ${!node.ativo ? "opacity-50" : ""}`} style={{ marginLeft: `${depth * 20}px` }}>
        <CollapsibleTrigger asChild>
          <button className="p-0.5 hover:bg-muted rounded" aria-label={open ? "Recolher" : "Expandir"}>
            {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
        {node.codigo && <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1 rounded">{node.codigo}</span>}
        <span className={`text-sm ${node.nivel === "setor" ? "font-semibold" : ""}`}>{node.nome}</span>
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
      </div>
      {hasChildren && (
        <CollapsibleContent>
          <div className="border-l" style={{ marginLeft: `${depth * 20 + 12}px` }}>
            {node.children.map((child) => (
              <EapNode key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onAdd={onAdd} onDelete={onDelete} onToggle={onToggle} />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
