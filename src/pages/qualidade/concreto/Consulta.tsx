import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useFornecedoresConcreto, useTracosConcreto } from "./lib/catalog";
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
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { todayISO } from "./lib/concreto-utils";

function formatBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

type Filters = {
  dataInicio: string;
  dataFim: string;
  fornecedorId: string | null;
  tracoId: string | null;
  numeroCarga: string;
};

const PAGE_SIZE = 25;

function defaultFilters(): Filters {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const toISO = (x: Date) => x.toISOString().slice(0, 10);
  return { dataInicio: toISO(start), dataFim: todayISO(), fornecedorId: null, tracoId: null, numeroCarga: "" };
}

type DestinoRow = { quantidade_m3_aplicada: number; observacao: string | null; areas: { nome: string } | null; subareas: { nome: string } | null };

type CargaRow = {
  id: string;
  data: string;
  numero_carga: string | null;
  quantidade_m3: number;
  tipo_origem: "propria" | "externa";
  peso_balanca_kg: number | null;
  preco_total: number | null;
  validado: boolean;
  criado_por_nome: string | null;
  fornecedores_concreto: { nome: string } | null;
  tracos_concreto: { nome: string; fck_mpa: number } | null;
  destinos_carga: DestinoRow[];
};

export default function ConcretoConsulta() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const [filters, setFilters] = useState<Filters>(defaultFilters());
  const [page, setPage] = useState(0);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const { data: fornecedores = [] } = useFornecedoresConcreto(organizacaoId, false);
  const { data: tracos = [] } = useTracosConcreto(organizacaoId, false);

  const queryKey = ["cargas-concreto-consulta", organizacaoId, filters, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("cargas_concreto")
        .select(
          `id, data, numero_carga, quantidade_m3, tipo_origem, peso_balanca_kg, preco_total, validado, criado_por_nome,
           fornecedores_concreto(nome),
           tracos_concreto(nome, fck_mpa),
           destinos_carga(quantidade_m3_aplicada, observacao, areas(nome), subareas(nome))`,
          { count: "exact" }
        )
        .eq("organizacao_id", organizacaoId!)
        .gte("data", filters.dataInicio)
        .lte("data", filters.dataFim)
        .order("data", { ascending: false });
      if (filters.fornecedorId) q = q.eq("fornecedor_id", filters.fornecedorId);
      if (filters.tracoId) q = q.eq("traco_id", filters.tracoId);
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Todos os lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                  <TableHead>Validado</TableHead>
                  <TableHead>Lançado por</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                )}
                {!isLoading && (data?.rows ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado</TableCell></TableRow>
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
                    <TableCell className="text-xs max-w-[240px]">
                      {r.destinos_carga.length === 0
                        ? "—"
                        : r.destinos_carga.map((d, i) => (
                            <div key={i} className="whitespace-nowrap">
                              {d.areas?.nome ?? "Sem área"}{d.subareas?.nome ? ` / ${d.subareas.nome}` : ""} — {d.quantidade_m3_aplicada.toLocaleString("pt-BR")}m³
                            </div>
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
