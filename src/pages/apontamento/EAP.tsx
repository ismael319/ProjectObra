import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProjects } from "@/lib/project-store";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, Building2, Map as MapIcon, MapPin, Wrench,
  Clock, GitMerge, Save, FolderOpen, X, Loader2, IndentIncrease, IndentDecrease, MoveUp, MoveDown, Layers,
  ChevronsDownUp, ChevronsUpDown,
} from "lucide-react";

type Nivel = "setor" | "area" | "subarea" | "atividade";

interface TreeNode {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  nivel: Nivel;
  parentId: string | null;
  ordem: number;
  bloqueado: boolean;
  children: TreeNode[];
  // Itens do MESMO nível que foram mesclados pra dentro deste (ver mergeMut) —
  // não são apagados, só ficam inativos e aparecem aqui só pra referência visual.
  mescladoDe: TreeNode[];
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

const NIVEL_ORDER: Nivel[] = ["setor", "area", "subarea", "atividade"];
const NIVEL_PREFIX: Record<Nivel, string> = { setor: "S", area: "A", subarea: "SA", atividade: "AT" };
const NIVEL_TABLE: Record<Nivel, string> = { setor: "setores", area: "areas", subarea: "subareas", atividade: "atividades" };
const NIVEL_APONT_FIELD: Record<Nivel, string> = { setor: "setor_id", area: "area_id", subarea: "subarea_id", atividade: "atividade_id" };
const NIVEL_APONT_NOME_FIELD: Record<Nivel, string> = { setor: "setor_nome", area: "area_nome", subarea: "subarea_nome", atividade: "atividade_nome" };

const EMPTY_FORM = { nome: "", codigo: "", ativo: true };

// Nó + todos os descendentes, em ordem pai-antes-do-filho (útil pra inserir/mesclar
// respeitando FK) — o inverso (filho-antes-do-pai) é só ordenar por nível decrescente.
function collectSubtree(node: TreeNode): TreeNode[] {
  const result: TreeNode[] = [node];
  for (const child of node.children) result.push(...collectSubtree(child));
  return result;
}

// Troca o erro cru do Postgres (ex.: "duplicate key value violates unique
// constraint atividades_codigo_uniq") por uma mensagem que faz sentido pra quem
// está cadastrando — o Código EAP é único em cada nível.
function friendlyDbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("duplicate key value violates unique constraint") && msg.includes("codigo")) {
    return "Já existe um item com esse Código EAP nesse nível. Escolha outro código.";
  }
  return msg;
}

export default function EapPage() {
  const qc = useQueryClient();
  const { currentProject } = useProjects();
  const [search, setSearch] = useState("");
  // Cada EapNode guarda seu próprio "aberto/fechado" (useState local, não é um Set
  // compartilhado) — pra expandir/recolher tudo de uma vez, força a árvore inteira a
  // remontar (treeVersion no key) já nascendo com o novo defaultOpen, em vez de
  // tentar sincronizar centenas de estados locais individualmente.
  const [treeExpanded, setTreeExpanded] = useState(true);
  const [treeVersion, setTreeVersion] = useState(0);
  function handleToggleExpandAll() {
    setTreeExpanded((v) => !v);
    setTreeVersion((v) => v + 1);
  }
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; nome: string; codigo: string | null; ativo: boolean; nivel: Nivel; parentId?: string } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nivel, setNivel] = useState<Nivel>("setor");
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<{ node: TreeNode; descendantCount: number } | null>(null);
  const [mergeNewName, setMergeNewName] = useState("");

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeNivel, setMergeNivel] = useState<Nivel | null>(null);
  const [mergeSelected, setMergeSelected] = useState<Map<string, string>>(new Map()); // id -> nome
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteSelected, setDeleteSelected] = useState<Map<string, TreeNode>>(new Map());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const [bulkMoveMode, setBulkMoveMode] = useState(false);
  const [bulkMoveSelected, setBulkMoveSelected] = useState<Map<string, TreeNode>>(new Map());

  const [modeloDialogOpen, setModeloDialogOpen] = useState(false);
  const [modeloNome, setModeloNome] = useState("");
  const [viewingModelo, setViewingModelo] = useState<EapModelo | null>(null);

  const { data: setores = [] } = useQuery({
    queryKey: ["cadastro", "setores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").order("ordem", { nullsFirst: false }).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["cadastro", "areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").order("ordem", { nullsFirst: false }).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: subareas = [] } = useQuery({
    queryKey: ["cadastro", "subareas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subareas").select("*").order("ordem", { nullsFirst: false }).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: atividades = [] } = useQuery({
    queryKey: ["cadastro", "atividades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("atividades").select("*").order("ordem", { nullsFirst: false }).order("nome");
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

  // Todas as atividades com pelo menos 1 apontamento (validado ou não) — é o que
  // trava a exclusão via "apontamentos_diarios_atividade_id_fkey". Sem isso a EAP
  // deixava tentar apagar e só descobria o erro depois, vindo do banco.
  const { data: apontamentosAtividadeIds = [] } = useQuery({
    queryKey: ["apontamentos_diarios", "atividade_ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("apontamentos_diarios").select("atividade_id").not("atividade_id", "is", null);
      if (error) throw error;
      return data as { atividade_id: string }[];
    },
  });
  const atividadesComApontamento = useMemo(
    () => new Set(apontamentosAtividadeIds.map((a) => a.atividade_id)),
    [apontamentosAtividadeIds],
  );

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

  // id -> id do pai direto (ou null), pra qualquer nível — usado só pra achar o "avô"
  // ao recuar o nível de um item (vira filho do pai do seu pai atual).
  const parentIdByNodeId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const s of setores) map.set(s.id, null);
    for (const a of areas) map.set(a.id, a.setor_id ?? null);
    for (const sa of subareas) map.set(sa.id, sa.area_id ?? null);
    for (const at of atividades) map.set(at.id, at.subarea_id ?? null);
    return map;
  }, [setores, areas, subareas, atividades]);

  // "Irmãos" (mesmo nível, mesmo pai) já ordenados por `ordem` — usado pra achar o
  // item logo acima (avançar/indent vira filho dele), pra trocar de posição (mover
  // pra cima/baixo) e pra calcular a próxima ordem livre (novo item / recuar).
  function siblingsOf(nvl: Nivel, parentId: string | null): { id: string; ordem: number }[] {
    const parentField = NIVEL_CONFIG[nvl].parentField;
    const source = nvl === "setor" ? setores : nvl === "area" ? areas : nvl === "subarea" ? subareas : atividades;
    return source
      .filter((r: any) => (parentField ? r[parentField] === parentId : true))
      .map((r: any) => ({ id: r.id as string, ordem: (r.ordem ?? 0) as number }))
      .sort((a, b) => a.ordem - b.ordem);
  }

  function nextOrdem(nvl: Nivel, parentId: string | null): number {
    const siblings = siblingsOf(nvl, parentId);
    return siblings.length > 0 ? Math.max(...siblings.map((s) => s.ordem)) + 1 : 0;
  }

  // Sugere o próximo código livre pro nível (S01, S02.../A01, A02.../SA01.../AT01...)
  // — olha todos os itens já cadastrados nesse nível (o Código EAP é único por
  // tabela) e propõe o número seguinte ao maior já usado com esse prefixo.
  function suggestCodigo(nvl: Nivel): string {
    const prefix = NIVEL_PREFIX[nvl];
    const source = nvl === "setor" ? setores : nvl === "area" ? areas : nvl === "subarea" ? subareas : atividades;
    const re = new RegExp(`^${prefix}(\\d+)$`, "i");
    let max = 0;
    for (const r of source as { codigo: string | null }[]) {
      const m = r.codigo?.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${prefix}${String(max + 1).padStart(2, "0")}`;
  }

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

  // Total do Projeto (nível 0, acima do Setor) — soma TODAS as horas apontadas
  // validadas, independente do nível/item em que foram lançadas.
  const totalHorasProjeto = useMemo(() => {
    const horasDiaMap = new Map(diasTrabalho.map((d) => [d.data, d.horas_dia]));
    return apontamentosValidados.reduce((acc, a) => acc + a.total * (horasDiaMap.get(a.data) ?? HORAS_DIA_PADRAO), 0);
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

    // Agrupa, por nível, quem foi mesclado pra dentro de quem — usado só pra
    // anexar essas linhas (inativas, sem filhos/apontamentos próprios mais) como
    // referência visual embaixo do item que "ganhou" a mesclagem.
    function mescladosPorAlvo(source: any[]): Map<string, any[]> {
      const map = new Map<string, any[]>();
      for (const r of source) {
        if (!r.mesclado_em) continue;
        const list = map.get(r.mesclado_em) ?? [];
        list.push(r);
        map.set(r.mesclado_em, list);
      }
      return map;
    }
    const setoresMescladosPorAlvo = mescladosPorAlvo(setores);
    const areasMescladasPorAlvo = mescladosPorAlvo(areas);
    const subareasMescladasPorAlvo = mescladosPorAlvo(subareas);
    const atividadesMescladasPorAlvo = mescladosPorAlvo(atividades);

    function toMescladoNode(r: any, nivel: Nivel): TreeNode {
      return {
        id: r.id, nome: r.nome, codigo: r.codigo, ativo: r.ativo, nivel, parentId: null, ordem: r.ordem ?? 0,
        bloqueado: false, children: [], mescladoDe: [],
      };
    }

    return setores
      .filter((s) => !s.mesclado_em && (s.ativo || !search))
      .map((s) => {
        const areaChildren = areas
          .filter((a) => !a.mesclado_em && a.setor_id === s.id && (a.ativo || !search))
          .map((a) => {
            const subareaChildren = subareas
              .filter((sa) => !sa.mesclado_em && sa.area_id === a.id && (sa.ativo || !search))
              .map((sa) => {
                const atividadeChildren = (ativBySubarea.get(sa.id) ?? [])
                  .filter((at) => !at.mesclado_em && (at.ativo || !search))
                  .map((at) => ({
                    id: at.id, nome: at.nome, codigo: at.codigo, ativo: at.ativo, nivel: "atividade" as Nivel, parentId: sa.id, ordem: at.ordem ?? 0,
                    bloqueado: atividadesComApontamento.has(at.id), children: [] as TreeNode[],
                    mescladoDe: (atividadesMescladasPorAlvo.get(at.id) ?? []).map((r) => toMescladoNode(r, "atividade")),
                  }));
                return {
                  id: sa.id, nome: sa.nome, codigo: sa.codigo, ativo: sa.ativo, nivel: "subarea" as Nivel, parentId: a.id, ordem: sa.ordem ?? 0,
                  bloqueado: atividadeChildren.some((c) => c.bloqueado), children: atividadeChildren,
                  mescladoDe: (subareasMescladasPorAlvo.get(sa.id) ?? []).map((r) => toMescladoNode(r, "subarea")),
                };
              });
            return {
              id: a.id, nome: a.nome, codigo: a.codigo, ativo: a.ativo, nivel: "area" as Nivel, parentId: s.id, ordem: a.ordem ?? 0,
              bloqueado: subareaChildren.some((c) => c.bloqueado), children: subareaChildren,
              mescladoDe: (areasMescladasPorAlvo.get(a.id) ?? []).map((r) => toMescladoNode(r, "area")),
            };
          });
        return {
          id: s.id, nome: s.nome, codigo: s.codigo, ativo: s.ativo, nivel: "setor" as Nivel, parentId: null, ordem: s.ordem ?? 0,
          bloqueado: areaChildren.some((c) => c.bloqueado), children: areaChildren,
          mescladoDe: (setoresMescladosPorAlvo.get(s.id) ?? []).map((r) => toMescladoNode(r, "setor")),
        };
      });
  }, [setores, areas, subareas, atividades, search, atividadesComApontamento]);

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
        // Item novo entra no fim da lista de irmãos (não no meio, por ordem alfabética).
        payload.ordem = nextOrdem(nivel, nivel === "setor" ? null : (parentId ?? null));
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Atualizado" : "Cadastrado"); setOpen(false); setEditing(null); setForm(EMPTY_FORM); invalidateAll(); },
    onError: (e: Error) => toast.error(friendlyDbError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, nivel: n, ativo }: { id: string; nivel: Nivel; ativo: boolean }) => {
      const table = n === "setor" ? "setores" : n === "area" ? "areas" : n === "subarea" ? "subareas" : "atividades";
      const { error } = await supabase.from(table).update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  // Apaga o nó e todos os descendentes, do mais profundo pro mais raso — apagar um
  // "setor"/"área"/"etapa" que ainda tem filhos direto dava "violates foreign key
  // constraint" (ex.: subareas_area_id_fkey), porque os filhos continuavam
  // referenciando o pai. Não toca em apontamentos_diarios: o histórico de horas
  // continua no banco, só some da árvore (nada mais referencia aquele id).
  const deleteMut = useMutation({
    mutationFn: async (node: TreeNode) => {
      const subtree = collectSubtree(node);
      const byNivelDesc = [...subtree].sort(
        (a, b) => NIVEL_ORDER.indexOf(b.nivel) - NIVEL_ORDER.indexOf(a.nivel),
      );
      for (const n of byNivelDesc) {
        const { error } = await supabase.from(NIVEL_TABLE[n.nivel]).delete().eq("id", n.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Excluído"); invalidateAll(); setConfirm(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mescla N itens do mesmo nível em 1: reatribui filhos e apontamentos históricos
  // pro item de destino. Os itens de origem NÃO são apagados — ficam inativos
  // (ativo=false) e marcados com mesclado_em apontando pro alvo, só pra
  // referência visual (aparecem embaixo do item resultante na árvore). Preserva
  // o total de horas já apontado — ele passa a contar pro item resultante.
  const mergeMut = useMutation({
    mutationFn: async () => {
      if (!mergeNivel || !mergeTargetId) throw new Error("Selecione o item de destino");
      const sourceIds = [...mergeSelected.keys()].filter((id) => id !== mergeTargetId);
      if (sourceIds.length === 0) throw new Error("Selecione pelo menos 2 itens pra mesclar");
      // Nome customizado (opcional): se preenchido, o agrupamento resultante recebe
      // esse nome em vez de manter o nome do item escolhido como destino.
      const targetNome = mergeNewName.trim() || mergeSelected.get(mergeTargetId)!;

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
      const { error: mescladoErr } = await supabase
        .from(table)
        .update({ ativo: false, mesclado_em: mergeTargetId })
        .in("id", sourceIds);
      if (mescladoErr) throw mescladoErr;

      if (mergeNewName.trim()) {
        const { error: renameErr } = await supabase.from(table).update({ nome: targetNome }).eq("id", mergeTargetId);
        if (renameErr) throw renameErr;
      }
    },
    onSuccess: () => {
      toast.success("Itens mesclados — histórico de horas preservado no item resultante. Origens ficam inativas, listadas abaixo dele.");
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["apontamentos_diarios"] });
      cancelMerge();
    },
    onError: (e: Error) => toast.error(friendlyDbError(e)),
  });

  // Recua ("up"/outdent) ou avança ("down"/indent) o nível de um item e de toda a
  // subárvore junto — preserva o MESMO id em todas as linhas ao mover de tabela,
  // então nenhuma FK de filho/apontamento precisa ser remapeada: só muda a coluna
  // (nome do nível) que guarda esse id. "up": vira filho do avô atual (determinístico
  // — recuar sempre sobe pro nível do próprio pai). "down": vira filho do item
  // IMEDIATAMENTE ACIMA dele no mesmo nível (newParentId já vem calculado pelo
  // chamador — ver handleIndent) — igual ao Tab do MS Project/Excel.
  const changeLevelMut = useMutation({
    mutationFn: async ({ node, direction, newParentId }: { node: TreeNode; direction: "up" | "down"; newParentId?: string }) => {
      const delta = direction === "up" ? -1 : 1;
      const subtree = collectSubtree(node);

      for (const n of subtree) {
        const newIdx = NIVEL_ORDER.indexOf(n.nivel) + delta;
        if (newIdx < 0 || newIdx > 3) {
          throw new Error(
            direction === "up"
              ? `"${n.nome}" já está no nível Setor — não dá pra recuar mais.`
              : `"${n.nome}" já está no nível Atividade — não existe nível abaixo disso.`,
          );
        }
      }
      if (direction === "down" && !newParentId) throw new Error("Não há item acima no mesmo nível pra virar o pai.");

      const newNivelRoot = NIVEL_ORDER[NIVEL_ORDER.indexOf(node.nivel) + delta];
      const newParentIdRoot: string | null = direction === "up" ? (parentIdByNodeId.get(node.parentId ?? "") ?? null) : newParentId!;
      // A raiz da operação entra no fim dos filhos do novo pai; os descendentes
      // mantêm sua própria ordem relativa (todos se movem juntos, na mesma leva).
      const rootNewOrdem = nextOrdem(newNivelRoot, newParentIdRoot);

      // Insere de cima pra baixo (raiz da operação primeiro) na tabela NOVA — garante
      // que o pai já existe lá antes do filho ser inserido referenciando ele.
      for (const n of subtree) {
        const newNivel = NIVEL_ORDER[NIVEL_ORDER.indexOf(n.nivel) + delta];
        const newParentField = NIVEL_CONFIG[newNivel].parentField;
        const isRoot = n.id === node.id;

        const parentValue: string | null = isRoot ? newParentIdRoot : n.parentId; // descendente: valor do FK não muda, só a coluna/tabela

        const payload: Record<string, unknown> = { id: n.id, nome: n.nome, codigo: n.codigo, ativo: n.ativo, ordem: isRoot ? rootNewOrdem : n.ordem };
        if (newParentField) payload[newParentField] = parentValue;

        const { error: insErr } = await supabase.from(NIVEL_TABLE[newNivel]).insert(payload);
        if (insErr) throw insErr;

        const oldApontField = NIVEL_APONT_FIELD[n.nivel];
        const newApontField = NIVEL_APONT_FIELD[newNivel];
        const { error: apontErr } = await supabase
          .from("apontamentos_diarios")
          .update({ [newApontField]: n.id, [NIVEL_APONT_NOME_FIELD[newNivel]]: n.nome, [oldApontField]: null, [NIVEL_APONT_NOME_FIELD[n.nivel]]: null })
          .eq(oldApontField, n.id);
        if (apontErr) throw apontErr;

        if (n.nivel === "atividade" && newNivel !== "atividade") {
          await supabase.from("cronograma_itens").update({ atividade_id: null }).eq("atividade_id", n.id);
        }
      }

      // Remove as linhas antigas de baixo pra cima (nível mais profundo primeiro) —
      // senão a FK do nível raso (ex.: subareas_area_id_fkey) barra apagar o pai
      // antes do filho.
      const byOldNivelDesc = [...subtree].sort((a, b) => NIVEL_ORDER.indexOf(b.nivel) - NIVEL_ORDER.indexOf(a.nivel));
      for (const n of byOldNivelDesc) {
        const { error: delErr } = await supabase.from(NIVEL_TABLE[n.nivel]).delete().eq("id", n.id);
        if (delErr) throw delErr;
      }
    },
    onSuccess: () => {
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["apontamentos_diarios"] });
    },
    onError: (e: Error) => toast.error(friendlyDbError(e)),
  });

  // Troca a ordem entre dois irmãos adjacentes (mesmo nível, mesmo pai) — mover um
  // "resumo" (setor/área/etapa) pra cima/baixo leva os filhos junto de graça, porque
  // eles são renderizados aninhados sob o pai, não reordenados por conta própria.
  const moveMut = useMutation({
    mutationFn: async ({ node, direction }: { node: TreeNode; direction: "up" | "down" }) => {
      const siblings = siblingsOf(node.nivel, node.parentId);
      const idx = siblings.findIndex((s) => s.id === node.id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) {
        throw new Error(direction === "up" ? "Já é o primeiro do grupo." : "Já é o último do grupo.");
      }
      const other = siblings[swapIdx];
      const table = NIVEL_TABLE[node.nivel];
      const { error: e1 } = await supabase.from(table).update({ ordem: other.ordem }).eq("id", node.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from(table).update({ ordem: siblings[idx].ordem }).eq("id", other.id);
      if (e2) throw e2;
    },
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  // Move vários itens de uma vez (mesma leva, um clique só) — agrupa por
  // (nível, pai), já que só faz sentido reordenar entre irmãos, e desloca o bloco
  // selecionado de cada grupo um passo pra cima/baixo, preservando a ordem
  // relativa entre eles (igual a "mover linhas selecionadas" de uma planilha).
  const moveBulkMut = useMutation({
    mutationFn: async ({ nodes, direction }: { nodes: TreeNode[]; direction: "up" | "down" }) => {
      const groups = new Map<string, TreeNode[]>();
      for (const n of nodes) {
        const key = `${n.nivel}::${n.parentId ?? ""}`;
        const arr = groups.get(key) ?? [];
        arr.push(n);
        groups.set(key, arr);
      }
      const updates: { table: string; id: string; ordem: number }[] = [];
      for (const [key, groupNodes] of groups) {
        const nvl = key.split("::")[0] as Nivel;
        const parentId = key.split("::")[1] || null;
        const siblings = siblingsOf(nvl, parentId);
        const selectedIds = new Set(groupNodes.map((n) => n.id));
        const ordens = siblings.map((s) => s.ordem);
        const order = [...siblings];
        if (direction === "up") {
          for (let i = 1; i < order.length; i++) {
            if (selectedIds.has(order[i].id) && !selectedIds.has(order[i - 1].id)) {
              [order[i - 1], order[i]] = [order[i], order[i - 1]];
            }
          }
        } else {
          for (let i = order.length - 2; i >= 0; i--) {
            if (selectedIds.has(order[i].id) && !selectedIds.has(order[i + 1].id)) {
              [order[i], order[i + 1]] = [order[i + 1], order[i]];
            }
          }
        }
        for (let i = 0; i < order.length; i++) {
          if (order[i].ordem !== ordens[i]) {
            updates.push({ table: NIVEL_TABLE[nvl], id: order[i].id, ordem: ordens[i] });
          }
        }
      }
      for (const u of updates) {
        const { error } = await supabase.from(u.table).update({ ordem: u.ordem }).eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  // Recua/avança vários itens de uma vez. Recuar é sempre seguro em lote (o alvo é
  // o avô, não depende de outros itens selecionados). Avançar depende do item
  // IMEDIATAMENTE ACIMA virar pai — se esse item acima também estiver selecionado
  // (e por isso também estiver se movendo nesta mesma leva), pula com aviso em vez
  // de arriscar quebrar a referência (o "pai" escolhido mudaria de tabela debaixo
  // do item que acabou de apontar pra ele).
  const changeLevelBulkMut = useMutation({
    mutationFn: async ({ nodes, direction }: { nodes: TreeNode[]; direction: "up" | "down" }) => {
      const selectedIds = new Set(nodes.map((n) => n.id));
      function hasSelectedAncestor(n: TreeNode): boolean {
        let pId = n.parentId;
        while (pId) {
          if (selectedIds.has(pId)) return true;
          pId = parentIdByNodeId.get(pId) ?? null;
        }
        return false;
      }
      const roots = nodes.filter((n) => !hasSelectedAncestor(n));

      let done = 0;
      let skipped = 0;
      for (const node of roots) {
        if (direction === "up") {
          if (node.nivel === "setor") {
            skipped++;
            toast.error(`"${node.nome}" já está no nível mais alto — não dá pra recuar.`);
            continue;
          }
          await changeLevelMut.mutateAsync({ node, direction: "up" });
          done++;
        } else {
          if (node.nivel === "atividade") {
            skipped++;
            toast.error(`"${node.nome}" já está no nível mais baixo — não dá pra avançar.`);
            continue;
          }
          const siblings = siblingsOf(node.nivel, node.parentId);
          const idx = siblings.findIndex((s) => s.id === node.id);
          if (idx <= 0) {
            skipped++;
            toast.error(`"${node.nome}" é o primeiro do grupo — não há item acima pra virar pai.`);
            continue;
          }
          const aboveId = siblings[idx - 1].id;
          if (selectedIds.has(aboveId)) {
            skipped++;
            toast.error(`"${node.nome}" não foi avançado: o item acima dele também está selecionado — avance um de cada vez nesse caso.`);
            continue;
          }
          await changeLevelMut.mutateAsync({ node, direction: "down", newParentId: aboveId });
          done++;
        }
      }
      return { done, skipped };
    },
    onSuccess: ({ done }) => {
      if (done > 0) toast.success(`${done} item(ns) atualizado(s)`);
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["apontamentos_diarios"] });
    },
    onError: (e: Error) => toast.error(friendlyDbError(e)),
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

  function openNew(n: Nivel, pId?: string) { setEditing(null); setForm({ ...EMPTY_FORM, codigo: suggestCodigo(n) }); setNivel(n); setParentId(pId); setOpen(true); }
  function openEdit(node: TreeNode) { setEditing({ id: node.id, nome: node.nome, codigo: node.codigo, ativo: node.ativo, nivel: node.nivel, parentId: node.parentId ?? undefined }); setForm({ nome: node.nome, codigo: node.codigo ?? "", ativo: node.ativo }); setNivel(node.nivel); setParentId(node.parentId ?? undefined); setOpen(true); }
  function handleDelete(node: TreeNode) {
    if (node.bloqueado) {
      toast.error("Não é possível excluir: este item (ou algum sub-item) já tem apontamentos de horas registrados.");
      return;
    }
    setConfirm({ node, descendantCount: collectSubtree(node).length - 1 });
  }

  // Avançar (indent): o item vira filho do item IMEDIATAMENTE ACIMA dele no mesmo
  // nível — igual ao Tab do MS Project/Excel. Instantâneo, sem diálogo: se não há
  // item acima (já é o primeiro do grupo), só avisa e não faz nada.
  function handleIndent(node: TreeNode) {
    const siblings = siblingsOf(node.nivel, node.parentId);
    const idx = siblings.findIndex((s) => s.id === node.id);
    if (idx <= 0) {
      toast.error("Já é o primeiro do grupo — não há item acima pra virar pai.");
      return;
    }
    changeLevelMut.mutate({ node, direction: "down", newParentId: siblings[idx - 1].id });
  }

  // Recuar (outdent): o item vira irmão do seu pai atual (sobe pro nível de cima) —
  // igual ao Shift+Tab do MS Project/Excel. Também instantâneo.
  function handleOutdent(node: TreeNode) {
    changeLevelMut.mutate({ node, direction: "up" });
  }

  function cancelMerge() { setMergeMode(false); setMergeNivel(null); setMergeSelected(new Map()); setMergeTargetId(null); setMergeNewName(""); }

  function cancelDeleteMode() { setDeleteMode(false); setDeleteSelected(new Map()); setBulkConfirmOpen(false); }

  function toggleDeleteSelect(node: TreeNode) {
    if (node.bloqueado) {
      toast.error("Este item (ou algum sub-item) já tem apontamentos de horas — não pode ser selecionado para exclusão.");
      return;
    }
    const next = new Map(deleteSelected);
    if (next.has(node.id)) next.delete(node.id);
    else next.set(node.id, node);
    setDeleteSelected(next);
  }

  function cancelBulkMove() { setBulkMoveMode(false); setBulkMoveSelected(new Map()); }

  function toggleBulkMoveSelect(node: TreeNode) {
    const next = new Map(bulkMoveSelected);
    if (next.has(node.id)) next.delete(node.id);
    else next.set(node.id, node);
    setBulkMoveSelected(next);
  }

  // Some vários itens selecionados de uma vez: descarta os que já estão "dentro" de
  // outro item selecionado (o pai apaga o filho em cascata) e apaga cada raiz restante
  // do mais profundo pro mais raso, igual ao deleteMut de item único.
  const deleteBulkMut = useMutation({
    mutationFn: async (nodes: TreeNode[]) => {
      const selectedIds = new Set(nodes.map((n) => n.id));
      function hasSelectedAncestor(n: TreeNode): boolean {
        let pId = n.parentId;
        while (pId) {
          if (selectedIds.has(pId)) return true;
          pId = parentIdByNodeId.get(pId) ?? null;
        }
        return false;
      }
      const roots = nodes.filter((n) => !hasSelectedAncestor(n));
      const all = roots.flatMap((n) => collectSubtree(n));
      const uniqueById = new Map(all.map((n) => [n.id, n]));
      const byNivelDesc = [...uniqueById.values()].sort(
        (a, b) => NIVEL_ORDER.indexOf(b.nivel) - NIVEL_ORDER.indexOf(a.nivel),
      );
      for (const n of byNivelDesc) {
        const { error } = await supabase.from(NIVEL_TABLE[n.nivel]).delete().eq("id", n.id);
        if (error) throw error;
      }
      return roots.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} item(ns) excluído(s)`);
      invalidateAll();
      cancelDeleteMode();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
            <Button variant="outline" onClick={() => setMergeMode(true)} disabled={deleteMode || bulkMoveMode}><GitMerge className="h-4 w-4" /> Mesclar</Button>
          )}
          {deleteMode ? (
            <Button variant="outline" onClick={cancelDeleteMode}><X className="h-4 w-4" /> Cancelar exclusão</Button>
          ) : (
            <Button variant="outline" onClick={() => setDeleteMode(true)} disabled={mergeMode || bulkMoveMode}><Trash2 className="h-4 w-4" /> Excluir em massa</Button>
          )}
          {bulkMoveMode ? (
            <Button variant="outline" onClick={cancelBulkMove}><X className="h-4 w-4" /> Cancelar seleção</Button>
          ) : (
            <Button variant="outline" onClick={() => setBulkMoveMode(true)} disabled={mergeMode || deleteMode}><MoveUp className="h-4 w-4" /> Mover em lote</Button>
          )}
          <Button onClick={() => openNew("setor")}><Plus className="h-4 w-4" /> Novo Setor</Button>
        </div>
      </div>

      {mergeMode && (
        <Card className="border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-3 space-y-3">
            <p className="text-sm">
              {mergeSelected.size === 0
                ? "Clique em itens do mesmo nível na árvore pra selecionar quais mesclar."
                : `${mergeSelected.size} ${mergeNivel ? NIVEL_CONFIG[mergeNivel].label.toLowerCase() : ""}(s) selecionado(s). Escolha qual vira o item final ou dê um nome novo pro agrupamento:`}
            </p>
            {mergeSelected.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {[...mergeSelected.entries()].map(([id, nome]) => (
                  <label key={id} className="flex items-center gap-1.5 text-sm rounded-full border px-2.5 py-1 cursor-pointer bg-background">
                    <input type="radio" name="mergeTarget" checked={mergeTargetId === id} onChange={() => setMergeTargetId(id)} />
                    {nome}
                  </label>
                ))}
                <Input
                  value={mergeNewName}
                  onChange={(e) => setMergeNewName(e.target.value)}
                  placeholder="Nome novo pro agrupamento (opcional)"
                  className="h-8 max-w-xs text-sm bg-background"
                />
                <Button
                  size="sm"
                  onClick={() => mergeMut.mutate()}
                  disabled={mergeSelected.size < 2 || !mergeTargetId || mergeMut.isPending}
                >
                  {mergeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                  Mesclar em "{mergeNewName.trim() || (mergeTargetId ? mergeSelected.get(mergeTargetId) : "")}"
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {deleteMode && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 space-y-3">
            <p className="text-sm">
              {deleteSelected.size === 0
                ? "Clique nos itens da árvore pra selecionar quais excluir (qualquer nível, dá pra misturar). Itens com apontamentos de horas não podem ser selecionados."
                : `${deleteSelected.size} item(ns) selecionado(s) para exclusão.`}
            </p>
            {deleteSelected.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {[...deleteSelected.values()].map((n) => (
                  <span key={n.id} className="flex items-center gap-1.5 text-sm rounded-full border px-2.5 py-1 bg-background">
                    {n.nome}
                    <button onClick={() => toggleDeleteSelect(n)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setBulkConfirmOpen(true)}
                  disabled={deleteBulkMut.isPending}
                >
                  {deleteBulkMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Excluir {deleteSelected.size} item(ns)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {bulkMoveMode && (
        <Card className="border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-3 space-y-3">
            <p className="text-sm">
              {bulkMoveSelected.size === 0
                ? "Clique nos itens da árvore pra selecionar quais mover/recuar/avançar juntos, de uma vez."
                : `${bulkMoveSelected.size} item(ns) selecionado(s).`}
            </p>
            {bulkMoveSelected.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {[...bulkMoveSelected.values()].map((n) => (
                  <span key={n.id} className="flex items-center gap-1.5 text-sm rounded-full border px-2.5 py-1 bg-background">
                    {n.nome}
                    <button onClick={() => toggleBulkMoveSelect(n)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <Button
                  size="sm" variant="outline"
                  onClick={() => moveBulkMut.mutate({ nodes: [...bulkMoveSelected.values()], direction: "up" })}
                  disabled={moveBulkMut.isPending || changeLevelBulkMut.isPending}
                >
                  <MoveUp className="h-3.5 w-3.5" /> Mover pra cima
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => moveBulkMut.mutate({ nodes: [...bulkMoveSelected.values()], direction: "down" })}
                  disabled={moveBulkMut.isPending || changeLevelBulkMut.isPending}
                >
                  <MoveDown className="h-3.5 w-3.5" /> Mover pra baixo
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => changeLevelBulkMut.mutate({ nodes: [...bulkMoveSelected.values()], direction: "up" })}
                  disabled={moveBulkMut.isPending || changeLevelBulkMut.isPending}
                >
                  <IndentDecrease className="h-3.5 w-3.5" /> Recuar
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => changeLevelBulkMut.mutate({ nodes: [...bulkMoveSelected.values()], direction: "down" })}
                  disabled={moveBulkMut.isPending || changeLevelBulkMut.isPending}
                >
                  {changeLevelBulkMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IndentIncrease className="h-3.5 w-3.5" />} Avançar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"><Layers className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Nível 0 · Projeto</div>
            <div className="text-lg font-bold truncate">{currentProject?.nome ?? "Projeto"}</div>
          </div>
          <div className="ml-auto text-right shrink-0">
            <div className="text-lg font-bold">{totalHorasProjeto.toLocaleString("pt-BR")}h</div>
            <div className="text-xs text-muted-foreground">total apontado (todos os níveis)</div>
          </div>
        </CardContent>
      </Card>

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
          <div className="flex flex-wrap items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar na árvore..." className="max-w-sm" />
            <Button variant="outline" size="sm" onClick={handleToggleExpandAll} className="ml-auto">
              {treeExpanded ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              {treeExpanded ? "Recolher tudo" : "Expandir tudo"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {filteredTree.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">Nenhum registro encontrado. Comece cadastrando um Setor.</p>
          )}
          {filteredTree.map((setor) => (
            <EapNode
              key={`${setor.id}-${treeVersion}`} node={setor} depth={0}
              onEdit={openEdit} onAdd={openNew} onDelete={handleDelete} onToggle={toggleMut.mutate}
              onIndent={handleIndent} onOutdent={handleOutdent}
              onMoveUp={(n) => moveMut.mutate({ node: n, direction: "up" })}
              onMoveDown={(n) => moveMut.mutate({ node: n, direction: "down" })}
              getHoras={getHoras}
              mergeMode={mergeMode} mergeNivel={mergeNivel} mergeSelected={mergeSelected} onMergeToggle={toggleMergeSelect}
              deleteMode={deleteMode} deleteSelected={deleteSelected} onDeleteToggle={toggleDeleteSelect}
              bulkMoveMode={bulkMoveMode} bulkMoveSelected={bulkMoveSelected} onBulkMoveToggle={toggleBulkMoveSelect}
              defaultOpen={treeExpanded}
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
            <div className="space-y-1.5"><Label>Código EAP</Label><Input value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} placeholder={`Ex: ${NIVEL_PREFIX[nivel]}01 (sugerido automaticamente)`} /></div>
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
            <AlertDialogTitle>Excluir {confirm ? NIVEL_CONFIG[confirm.node.nivel].label : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{confirm?.node.nome}</strong>?
              {confirm && confirm.descendantCount > 0 && (
                <> Isso também vai excluir <strong>{confirm.descendantCount} sub-item(ns)</strong> dentro dele (áreas, etapas e/ou atividades).</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && deleteMut.mutate(confirm.node)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteSelected.size} item(ns)?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir os itens selecionados? Itens que forem "resumo" (setor/área/etapa) levam
              todos os sub-itens dentro deles junto na exclusão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBulkMut.mutate([...deleteSelected.values()])}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
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

function EapNode({ node, depth, onEdit, onAdd, onDelete, onToggle, onIndent, onOutdent, onMoveUp, onMoveDown, getHoras, mergeMode, mergeNivel, mergeSelected, onMergeToggle, deleteMode, deleteSelected, onDeleteToggle, bulkMoveMode, bulkMoveSelected, onBulkMoveToggle, defaultOpen = true }: {
  node: TreeNode; depth: number; onEdit: (node: TreeNode) => void; onAdd: (nivel: Nivel, parentId?: string) => void;
  onDelete: (node: TreeNode) => void; onToggle: (args: { id: string; nivel: Nivel; ativo: boolean }) => void;
  onIndent: (node: TreeNode) => void; onOutdent: (node: TreeNode) => void;
  onMoveUp: (node: TreeNode) => void; onMoveDown: (node: TreeNode) => void;
  getHoras: (nivel: Nivel, id: string) => number;
  mergeMode: boolean; mergeNivel: Nivel | null; mergeSelected: Map<string, string>; onMergeToggle: (node: TreeNode) => void;
  deleteMode: boolean; deleteSelected: Map<string, TreeNode>; onDeleteToggle: (node: TreeNode) => void;
  bulkMoveMode: boolean; bulkMoveSelected: Map<string, TreeNode>; onBulkMoveToggle: (node: TreeNode) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = NIVEL_CONFIG[node.nivel];
  const Icon = cfg.icon;
  const hasChildren = node.children.length > 0 || node.mescladoDe.length > 0;
  const nextNivel: Nivel | null = node.nivel === "setor" ? "area" : node.nivel === "area" ? "subarea" : node.nivel === "subarea" ? "atividade" : null;
  const horas = getHoras(node.nivel, node.id);
  const desabilitadoNoMerge = mergeMode && mergeNivel !== null && mergeNivel !== node.nivel && !mergeSelected.has(node.id);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`group flex min-w-0 flex-wrap items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/50 ${!node.ativo ? "opacity-50" : ""} ${desabilitadoNoMerge ? "opacity-40" : ""} ${deleteMode && node.bloqueado ? "opacity-40" : ""}`} style={{ marginLeft: `${Math.min(depth * 20, 80)}px` }}>
        {mergeMode && (
          <input
            type="checkbox"
            className="mr-1"
            checked={mergeSelected.has(node.id)}
            disabled={desabilitadoNoMerge}
            onChange={() => onMergeToggle(node)}
          />
        )}
        {bulkMoveMode && (
          <input
            type="checkbox"
            className="mr-1"
            checked={bulkMoveSelected.has(node.id)}
            onChange={() => onBulkMoveToggle(node)}
          />
        )}
        {deleteMode && (
          <input
            type="checkbox"
            className="mr-1"
            checked={deleteSelected.has(node.id)}
            disabled={node.bloqueado}
            title={node.bloqueado ? "Item (ou sub-item) com apontamentos de horas — não pode ser excluído" : undefined}
            onChange={() => onDeleteToggle(node)}
          />
        )}
        <CollapsibleTrigger asChild>
          <button className="p-0.5 hover:bg-muted rounded" aria-label={open ? "Recolher" : "Expandir"}>
            {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
        {node.codigo && <span className="shrink-0 rounded bg-muted px-1 font-mono text-xs text-muted-foreground sm:text-[11px]">{node.codigo}</span>}
        <span
          className={`min-w-0 flex-1 truncate text-sm ${node.nivel === "setor" ? "font-semibold" : ""} ${mergeMode || deleteMode || bulkMoveMode ? "cursor-pointer" : ""}`}
          onClick={() => { if (mergeMode) onMergeToggle(node); else if (deleteMode) onDeleteToggle(node); else if (bulkMoveMode) onBulkMoveToggle(node); }}
        >
          {node.nome}
        </span>
        {horas > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:text-[11px]" title="Horas apontadas (validadas)">
            <Clock className="h-3 w-3" /> {horas.toLocaleString("pt-BR")}h
          </span>
        )}
        {!mergeMode && !deleteMode && !bulkMoveMode && (
          <div className="flex w-full items-center justify-end gap-0.5 opacity-100 transition-opacity sm:ml-auto sm:w-auto sm:opacity-0 sm:group-hover:opacity-100">
            <Switch checked={node.ativo} onCheckedChange={() => onToggle({ id: node.id, nivel: node.nivel, ativo: !node.ativo })} className="scale-75" />
            {nextNivel && (
              <button onClick={() => onAdd(nextNivel, node.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={`Adicionar ${NIVEL_CONFIG[nextNivel].label}`}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onMoveUp(node)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Mover para cima"
            >
              <MoveUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onMoveDown(node)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Mover para baixo"
            >
              <MoveDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onOutdent(node)}
              disabled={node.nivel === "setor"}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              title={node.nivel === "setor" ? "Já está no nível mais alto" : `Recuar para ${NIVEL_CONFIG[NIVEL_ORDER[NIVEL_ORDER.indexOf(node.nivel) - 1]].label}`}
            >
              <IndentDecrease className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onIndent(node)}
              disabled={node.nivel === "atividade"}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              title={node.nivel === "atividade" ? "Já está no nível mais baixo" : `Avançar para ${NIVEL_CONFIG[NIVEL_ORDER[NIVEL_ORDER.indexOf(node.nivel) + 1]].label} (vira sub-item do item acima)`}
            >
              <IndentIncrease className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onEdit(node)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
            <button
              onClick={() => onDelete(node)}
              disabled={node.bloqueado}
              className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              title={node.bloqueado ? "Não é possível excluir: item (ou sub-item) já tem apontamentos de horas registrados" : "Excluir"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
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
                onIndent={onIndent} onOutdent={onOutdent} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
                getHoras={getHoras}
                mergeMode={mergeMode} mergeNivel={mergeNivel} mergeSelected={mergeSelected} onMergeToggle={onMergeToggle}
                deleteMode={deleteMode} deleteSelected={deleteSelected} onDeleteToggle={onDeleteToggle}
                bulkMoveMode={bulkMoveMode} bulkMoveSelected={bulkMoveSelected} onBulkMoveToggle={onBulkMoveToggle}
                defaultOpen={defaultOpen}
              />
            ))}
            {node.mescladoDe.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-1.5 py-1 px-2 opacity-50"
                style={{ marginLeft: `${(depth + 1) * 20}px` }}
              >
                <span className="w-3.5 shrink-0" />
                <GitMerge className="h-3 w-3 text-muted-foreground shrink-0" />
                {m.codigo && <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1 rounded">{m.codigo}</span>}
                <span className="text-sm line-through decoration-muted-foreground/50">{m.nome}</span>
                <span className="text-[10px] text-muted-foreground">(mesclado aqui)</span>
                {!mergeMode && !deleteMode && !bulkMoveMode && (
                  <button
                    onClick={() => onDelete(m)}
                    className="ml-auto p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Remover esta referência definitivamente"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
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
