import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Search, Plus, Upload, Download, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { useFuncionarios, useRhCargos, useRhSetores, useRhEncarregados, useRhGrupos } from "@/lib/administracao/catalog";
import type { FuncionarioRow, Local, StatusBdr, StatusFs } from "@/lib/administracao/db";
import { buildFuncionariosWorkbook, downloadFuncionariosWorkbook } from "@/lib/administracao/excel-export";
import { StatusBdrPill, StatusFsPill } from "../status-pills";
import FuncionarioFormModal from "./FuncionarioFormModal";
import DesligarDialog from "./DesligarDialog";

const OPCOES_PAGE_SIZE = [10, 25, 50, 100] as const;

const LOCAL_LABEL: Record<Local, string> = {
  obra: "Obra",
  alojamento: "Alojamento",
  em_viagem: "Em viagem",
  turno_noite: "Turno à noite",
};

type Filtros = {
  busca: string;
  statusBdr: StatusBdr | null;
  statusFs: StatusFs | null;
  local: Local | null;
  grupoId: string | null;
  setorId: string | null;
};

const FILTROS_INICIAIS: Filtros = { busca: "", statusBdr: null, statusFs: null, local: null, grupoId: null, setorId: null };

export default function FuncionariosAtivos() {
  const qc = useQueryClient();
  const { user, userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const { data: funcionarios = [], isLoading } = useFuncionarios(organizacaoId);
  const { data: cargos = [] } = useRhCargos(organizacaoId);
  const { data: setores = [] } = useRhSetores(organizacaoId);
  const { data: encarregados = [] } = useRhEncarregados(organizacaoId);
  const { data: grupos = [] } = useRhGrupos(organizacaoId);

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [page, setPage] = useState(0);
  // "todos" desativa a paginação (mostra tudo, com scroll normal da página).
  const [pageSize, setPageSize] = useState<number | "todos">(25);
  const [editando, setEditando] = useState<FuncionarioRow | null | "novo">(null);
  const [desligando, setDesligando] = useState<FuncionarioRow | null>(null);

  const cargoNomePorId = useMemo(() => new Map(cargos.map((c) => [c.id, c.nome])), [cargos]);
  const setorNomePorId = useMemo(() => new Map(setores.map((s) => [s.id, s.nome])), [setores]);
  const encarregadoNomePorId = useMemo(() => new Map(encarregados.map((e) => [e.id, e.nome])), [encarregados]);
  const grupoNomePorId = useMemo(() => new Map(grupos.map((g) => [g.id, g.nome])), [grupos]);

  const filtrados = useMemo(() => {
    const busca = filtros.busca.trim().toLowerCase();
    return funcionarios.filter((f) => {
      if (busca && !f.nome.toLowerCase().includes(busca) && !f.matricula.toLowerCase().includes(busca) && !(f.cpf ?? "").includes(busca)) return false;
      if (filtros.statusBdr && f.status_bdr !== filtros.statusBdr) return false;
      if (filtros.statusFs && f.status_fs !== filtros.statusFs) return false;
      if (filtros.local && f.local !== filtros.local) return false;
      if (filtros.grupoId && f.grupo_id !== filtros.grupoId) return false;
      if (filtros.setorId && f.setor_id !== filtros.setorId) return false;
      return true;
    });
  }, [funcionarios, filtros]);

  const totalPages = pageSize === "todos" ? 1 : Math.max(1, Math.ceil(filtrados.length / pageSize));
  const pagina = pageSize === "todos" ? filtrados : filtrados.slice(page * pageSize, page * pageSize + pageSize);

  const resumo = useMemo(() => ({
    total: funcionarios.length,
    liberadoFs: funcionarios.filter((f) => f.status_bdr === "liberado_fs").length,
    aguardandoDoc: funcionarios.filter((f) => f.status_bdr === "aguardando_documentacao").length,
    bloqueado: funcionarios.filter((f) => f.status_fs === "bloqueado").length,
  }), [funcionarios]);

  function setF<K extends keyof Filtros>(k: K, v: Filtros[K]) {
    setPage(0);
    setFiltros((p) => ({ ...p, [k]: v }));
  }

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["funcionarios", organizacaoId] });
    qc.invalidateQueries({ queryKey: ["demissoes", organizacaoId] });
  }

  // O toggle "Ativo" é só um atalho pra abrir o mesmo fluxo de Desligar (com
  // motivo + data) — não existe um estado "inativo mas ainda em Funcionários"
  // nesse modelo: ou o funcionário está na lista de Ativos, ou já foi
  // desligado e está em Demissões.
  function handleToggleAtivo(f: FuncionarioRow) {
    setDesligando(f);
  }

  function handleExportar() {
    if (filtrados.length === 0) {
      toast.warning("Nenhum funcionário no filtro atual.");
      return;
    }
    const wb = buildFuncionariosWorkbook(filtrados, {
      cargo: cargoNomePorId,
      setor: setorNomePorId,
      encarregado: encarregadoNomePorId,
      grupo: grupoNomePorId,
    });
    downloadFuncionariosWorkbook(wb);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Total ativos</div><div className="mt-1 text-3xl font-bold">{resumo.total}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Liberado FS</div><div className="mt-1 text-3xl font-bold text-green-600">{resumo.liberadoFs}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Aguardando doc.</div><div className="mt-1 text-3xl font-bold text-amber-600">{resumo.aguardandoDoc}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Bloqueado</div><div className="mt-1 text-3xl font-bold text-red-600">{resumo.bloqueado}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Nome, matrícula ou CPF..." value={filtros.busca} onChange={(e) => setF("busca", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status BDR</Label>
              <Combobox
                options={[
                  { value: "liberado_fs", label: "Liberado FS" },
                  { value: "integracao", label: "Integração" },
                  { value: "aguardando_documentacao", label: "Aguardando documentação" },
                ]}
                value={filtros.statusBdr}
                onChange={(v) => setF("statusBdr", v as StatusBdr | null)}
                placeholder="Todos"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status FS</Label>
              <Combobox
                options={[{ value: "liberado", label: "Liberado" }, { value: "bloqueado", label: "Bloqueado" }]}
                value={filtros.statusFs}
                onChange={(v) => setF("statusFs", v as StatusFs | null)}
                placeholder="Todos"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Local</Label>
              <Combobox
                options={(Object.keys(LOCAL_LABEL) as Local[]).map((l) => ({ value: l, label: LOCAL_LABEL[l] }))}
                value={filtros.local}
                onChange={(v) => setF("local", v as Local | null)}
                placeholder="Todos"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <Combobox options={setores.map((s) => ({ value: s.id, label: s.nome }))} value={filtros.setorId} onChange={(v) => setF("setorId", v)} placeholder="Todos" />
            </div>
            <div className="space-y-1.5">
              <Label>Grupo</Label>
              <Combobox options={grupos.map((g) => ({ value: g.id, label: g.nome }))} value={filtros.grupoId} onChange={(v) => setF("grupoId", v)} placeholder="Todos" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => { setFiltros(FILTROS_INICIAIS); setPage(0); }}>Limpar filtros</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportar}><Download size={16} /> Exportar</Button>
              <Link to="/dashboard/administracao/importar-efetivo">
                <Button variant="outline"><Upload size={16} /> Importar Efetivo</Button>
              </Link>
              <Button onClick={() => setEditando("novo")}><Plus size={16} /> Novo Funcionário</Button>
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
                  <TableHead>Mat.</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Status BDR</TableHead>
                  <TableHead>Status FS</TableHead>
                  <TableHead className="w-[80px]">Ativo</TableHead>
                  <TableHead className="w-[60px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
                {!isLoading && pagina.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum funcionário encontrado</TableCell></TableRow>}
                {pagina.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">{f.matricula}</TableCell>
                    <TableCell className="font-medium">{f.nome}</TableCell>
                    <TableCell>{f.cargo_id ? cargoNomePorId.get(f.cargo_id) ?? "—" : "—"}</TableCell>
                    <TableCell>{f.setor_id ? setorNomePorId.get(f.setor_id) ?? "—" : "—"}</TableCell>
                    <TableCell>{f.local ? LOCAL_LABEL[f.local] : "—"}</TableCell>
                    <TableCell><StatusBdrPill status={f.status_bdr} /></TableCell>
                    <TableCell><StatusFsPill status={f.status_fs} /></TableCell>
                    <TableCell>
                      <Switch checked={true} onCheckedChange={() => handleToggleAtivo(f)} title="Desligar" />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(f)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Linhas por página</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={pageSize}
            onChange={(e) => { setPage(0); setPageSize(e.target.value === "todos" ? "todos" : Number(e.target.value)); }}
          >
            {OPCOES_PAGE_SIZE.map((n) => <option key={n} value={n}>{n}</option>)}
            <option value="todos">Todos ({filtrados.length})</option>
          </select>
        </div>

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
      </div>

      {editando && organizacaoId && (
        <FuncionarioFormModal
          organizacaoId={organizacaoId}
          userId={user?.id}
          funcionario={editando === "novo" ? null : editando}
          onClose={() => setEditando(null)}
          onSaved={invalidar}
        />
      )}

      {desligando && organizacaoId && (
        <DesligarDialog
          organizacaoId={organizacaoId}
          funcionario={desligando}
          cargoNome={desligando.cargo_id ? cargoNomePorId.get(desligando.cargo_id) ?? null : null}
          setorNome={desligando.setor_id ? setorNomePorId.get(desligando.setor_id) ?? null : null}
          onClose={() => setDesligando(null)}
          onDesligado={invalidar}
        />
      )}
    </div>
  );
}
