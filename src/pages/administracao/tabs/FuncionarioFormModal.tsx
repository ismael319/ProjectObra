import { useState } from "react";
import { toast } from "sonner";
import { X, Plus, Loader2, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useProjects } from "@/lib/project-store";
import { useRhCargos, useRhSetores, useRhEncarregados, useRhGrupos } from "@/lib/administracao/catalog";
import {
  salvarFuncionario,
  criarItemCatalogo,
  type FuncionarioRow,
  type FuncionarioInput,
  type Local,
  type StatusBdr,
  type StatusFs,
  type Categoria,
} from "@/lib/administracao/db";

const LOCAL_OPCOES: { value: Local; label: string }[] = [
  { value: "obra", label: "Obra" },
  { value: "alojamento", label: "Alojamento" },
  { value: "em_viagem", label: "Em viagem" },
  { value: "turno_noite", label: "Turno à noite" },
];

const STATUS_BDR_OPCOES: { value: StatusBdr; label: string }[] = [
  { value: "liberado_fs", label: "Liberado FS" },
  { value: "integracao", label: "Integração" },
  { value: "aguardando_documentacao", label: "Aguardando documentação" },
];

const STATUS_FS_OPCOES: { value: StatusFs; label: string }[] = [
  { value: "liberado", label: "Liberado" },
  { value: "bloqueado", label: "Bloqueado" },
];

const CATEGORIA_OPCOES: { value: Categoria; label: string }[] = [
  { value: "D", label: "D — Direta" },
  { value: "I", label: "I — Indireta" },
];

function CampoCatalogo({
  label,
  options,
  value,
  onChange,
  onCriar,
}: {
  label: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCriar: (nome: string) => Promise<{ id: string; nome: string }>;
}) {
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmarCriacao() {
    if (!novoNome.trim()) return;
    setSalvando(true);
    try {
      const criado = await onCriar(novoNome.trim());
      onChange(criado.id);
      setCriando(false);
      setNovoNome("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {criando ? (
        <div className="flex gap-1.5">
          <Input
            autoFocus
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder={`Novo ${label.toLowerCase()}`}
            onKeyDown={(e) => e.key === "Enter" && confirmarCriacao()}
          />
          <Button type="button" size="sm" onClick={confirmarCriacao} disabled={salvando || !novoNome.trim()}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : "Criar"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCriando(false)}>
            <X size={14} />
          </Button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <Combobox options={options} value={value} onChange={onChange} placeholder={`Selecione ${label.toLowerCase()}`} className="flex-1" />
          <Button type="button" size="icon" variant="outline" className="shrink-0" onClick={() => setCriando(true)} title={`Criar ${label.toLowerCase()} novo`}>
            <Plus size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

interface Props {
  organizacaoId: string;
  userId?: string | null;
  funcionario: FuncionarioRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function FuncionarioFormModal({ organizacaoId, userId, funcionario, onClose, onSaved }: Props) {
  const editando = !!funcionario;

  const { data: cargos = [], refetch: refetchCargos } = useRhCargos(organizacaoId);
  const { data: setores = [], refetch: refetchSetores } = useRhSetores(organizacaoId);
  const { data: encarregados = [], refetch: refetchEncarregados } = useRhEncarregados(organizacaoId);
  const { data: grupos = [], refetch: refetchGrupos } = useRhGrupos(organizacaoId);
  const { projects } = useProjects();

  const [form, setForm] = useState<FuncionarioInput>(() => ({
    id: funcionario?.id,
    matricula: funcionario?.matricula ?? "",
    nome: funcionario?.nome ?? "",
    cpf: funcionario?.cpf ?? null,
    cargoId: funcionario?.cargo_id ?? null,
    setorId: funcionario?.setor_id ?? null,
    encarregadoId: funcionario?.encarregado_id ?? null,
    indicacao: funcionario?.indicacao ?? null,
    dataAdmissao: funcionario?.data_admissao ?? "",
    obraCodigo: funcionario?.obra_codigo ?? null,
    projetoId: funcionario?.projeto_id ?? null,
    local: funcionario?.local ?? null,
    statusBdr: funcionario?.status_bdr ?? "aguardando_documentacao",
    statusFs: funcionario?.status_fs ?? "bloqueado",
    grupoId: funcionario?.grupo_id ?? null,
    categoria: funcionario?.categoria ?? null,
    fotoUrl: funcionario?.foto_url ?? null,
  }));
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof FuncionarioInput>(key: K, value: FuncionarioInput[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function handleCargoChange(cargoId: string | null) {
    set("cargoId", cargoId);
    const cargo = cargos.find((c) => c.id === cargoId);
    if (cargo) {
      // Autopreenche a partir do cargo escolhido — usuário ainda pode
      // sobrescrever depois, o cargo só sugere um padrão.
      if (cargo.setor_padrao_id) set("setorId", cargo.setor_padrao_id);
      if (cargo.grupo_id) set("grupoId", cargo.grupo_id);
      if (cargo.categoria) set("categoria", cargo.categoria);
    }
  }

  async function handleSalvar() {
    if (!form.matricula.trim() || !form.nome.trim() || !form.dataAdmissao) {
      toast.error("Matrícula, Nome e Data de admissão são obrigatórios.");
      return;
    }
    if (!form.statusBdr || !form.statusFs) {
      toast.error("Status BDR e Status FS são obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      await salvarFuncionario({ organizacaoId, userId, input: form });
      toast.success(editando ? "Funcionário atualizado." : "Funcionário cadastrado.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{editando ? "Editar funcionário" : "Novo funcionário"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Matrícula *</Label>
            <Input value={form.matricula} onChange={(e) => set("matricula", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>CPF</Label>
            <Input value={form.cpf ?? ""} onChange={(e) => set("cpf", e.target.value || null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data de admissão *</Label>
            <Input type="date" value={form.dataAdmissao} onChange={(e) => set("dataAdmissao", e.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Foto (URL)</Label>
            <Input
              placeholder="https://servidor-da-empresa/fotos/123.jpg"
              value={form.fotoUrl ?? ""}
              onChange={(e) => set("fotoUrl", e.target.value || null)}
            />
            {form.fotoUrl ? (
              <div className="flex items-center gap-3 pt-1">
                <img
                  src={form.fotoUrl}
                  alt={form.nome || "Foto do funcionário"}
                  className="h-16 w-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <a
                  href={form.fotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Ver foto
                </a>
              </div>
            ) : null}
          </div>

          <CampoCatalogo
            label="Cargo"
            options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
            value={form.cargoId}
            onChange={handleCargoChange}
            onCriar={async (nome) => {
              const criado = await criarItemCatalogo("rh_cargos", organizacaoId, nome);
              await refetchCargos();
              return criado;
            }}
          />
          <CampoCatalogo
            label="Setor"
            options={setores.map((s) => ({ value: s.id, label: s.nome }))}
            value={form.setorId}
            onChange={(v) => set("setorId", v)}
            onCriar={async (nome) => {
              const criado = await criarItemCatalogo("rh_setores", organizacaoId, nome);
              await refetchSetores();
              return criado;
            }}
          />
          <CampoCatalogo
            label="Encarregado (F.S.)"
            options={encarregados.map((e) => ({ value: e.id, label: e.nome }))}
            value={form.encarregadoId}
            onChange={(v) => set("encarregadoId", v)}
            onCriar={async (nome) => {
              const criado = await criarItemCatalogo("rh_encarregados", organizacaoId, nome);
              await refetchEncarregados();
              return criado;
            }}
          />
          <CampoCatalogo
            label="Grupo"
            options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
            value={form.grupoId}
            onChange={(v) => set("grupoId", v)}
            onCriar={async (nome) => {
              const criado = await criarItemCatalogo("rh_grupos", organizacaoId, nome);
              await refetchGrupos();
              return criado;
            }}
          />

          <div className="space-y-1.5">
            <Label>Indicação</Label>
            <Input value={form.indicacao ?? ""} onChange={(e) => set("indicacao", e.target.value || null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Obra</Label>
            <Input value={form.obraCodigo ?? ""} onChange={(e) => set("obraCodigo", e.target.value || null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Projeto</Label>
            <Combobox
              options={projects.map((p) => ({ value: p.id, label: p.nome }))}
              value={form.projetoId}
              onChange={(v) => set("projetoId", v)}
              placeholder="Selecione o projeto"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Local</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.local ?? ""}
              onChange={(e) => set("local", (e.target.value || null) as Local | null)}
            >
              <option value="">—</option>
              {LOCAL_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.categoria ?? ""}
              onChange={(e) => set("categoria", (e.target.value || null) as Categoria | null)}
            >
              <option value="">—</option>
              {CATEGORIA_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Status BDR *</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.statusBdr}
              onChange={(e) => set("statusBdr", e.target.value as StatusBdr)}
            >
              {STATUS_BDR_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Status FS *</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.statusFs}
              onChange={(e) => set("statusFs", e.target.value as StatusFs)}
            >
              {STATUS_FS_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
