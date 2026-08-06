import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, type PapelUsuario } from "@/lib/auth-context";
import { PAPEL_LABELS } from "@/pages/UserApprovalManagement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type ModuloAtivo = { key: string; nome: string };

const SENTINEL_PADRAO = "__padrao__";

// Configura, por usuário, um papel DIFERENTE do global em módulos específicos
// (ex.: visualizacao no geral, mas edicao só em Concreto) — grava em
// user_papel_modulos (ver 20260807000000_papel-por-modulo-fundacao-
// migration.sql). Ausência de override pra um módulo = usa o papel global do
// usuário, então "Padrão" aqui é literalmente "sem linha na tabela".
export default function PapelPorModuloModal({
  open,
  onOpenChange,
  usuarioId,
  usuarioEmail,
  papelGlobal,
  organizacaoId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarioId: string;
  usuarioEmail: string | null;
  papelGlobal: PapelUsuario | null;
  organizacaoId: string;
}) {
  const { user } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modulos, setModulos] = useState<ModuloAtivo[]>([]);
  const [overridesOriginais, setOverridesOriginais] = useState<Record<string, PapelUsuario>>({});
  const [selecao, setSelecao] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      const [{ data: modulosData, error: errModulos }, { data: restricoesData, error: errRestricoes }, { data: overridesData, error: errOverrides }] =
        await Promise.all([
          supabase
            .from("organizacao_modulos")
            .select("modulo_key, ativo, modulos(nome)")
            .eq("organizacao_id", organizacaoId)
            .eq("ativo", true),
          // Restrição adicional por usuário (além do contrato da empresa) —
          // mesma regra de user_ve_modulo(): ausência de linhas = sem
          // restrição (vê todos os módulos da empresa); com linhas, só os
          // listados. Sem isso, o modal ofereceria papel num módulo que o
          // usuário nem enxerga.
          supabase.from("user_modulos_visiveis").select("modulo_key").eq("user_id", usuarioId),
          supabase.from("user_papel_modulos").select("modulo_key, papel").eq("user_id", usuarioId),
        ]);

      if (cancelado) return;
      if (errModulos || errRestricoes || errOverrides) {
        toast.error("Não foi possível carregar os módulos/papéis.");
        setCarregando(false);
        return;
      }

      const restricoes = new Set(((restricoesData ?? []) as { modulo_key: string }[]).map((r) => r.modulo_key));
      const modulosAtivos = (modulosData ?? [])
        .filter((m) => restricoes.size === 0 || restricoes.has(m.modulo_key as string))
        .map((m) => {
          const modulo = Array.isArray(m.modulos) ? m.modulos[0] : m.modulos;
          return { key: m.modulo_key as string, nome: (modulo?.nome as string | undefined) ?? m.modulo_key };
        });
      const overrides = Object.fromEntries(
        ((overridesData ?? []) as { modulo_key: string; papel: PapelUsuario }[]).map((o) => [o.modulo_key, o.papel])
      );

      setModulos(modulosAtivos);
      setOverridesOriginais(overrides);
      setSelecao(Object.fromEntries(modulosAtivos.map((m) => [m.key, overrides[m.key] ?? SENTINEL_PADRAO])));
      setCarregando(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [open, organizacaoId, usuarioId]);

  async function handleSalvar() {
    setSalvando(true);
    try {
      const aCriarOuAtualizar = modulos
        .filter((m) => selecao[m.key] !== SENTINEL_PADRAO && selecao[m.key] !== overridesOriginais[m.key])
        .map((m) => ({ user_id: usuarioId, modulo_key: m.key, papel: selecao[m.key] as PapelUsuario, definido_por: user?.id ?? null }));
      const aRemover = modulos.filter((m) => selecao[m.key] === SENTINEL_PADRAO && overridesOriginais[m.key]).map((m) => m.key);

      if (aCriarOuAtualizar.length > 0) {
        const { error } = await supabase.from("user_papel_modulos").upsert(aCriarOuAtualizar, { onConflict: "user_id,modulo_key" });
        if (error) throw error;
      }
      if (aRemover.length > 0) {
        const { error } = await supabase.from("user_papel_modulos").delete().eq("user_id", usuarioId).in("modulo_key", aRemover);
        if (error) throw error;
      }
      toast.success("Papéis por módulo atualizados.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Papéis por módulo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {usuarioEmail ?? "Usuário"} — papel padrão: <strong>{papelGlobal ? PAPEL_LABELS[papelGlobal] : "—"}</strong>. Só defina um
          módulo aqui se ele precisar de um papel diferente do padrão.
        </p>
        {carregando ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : modulos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Esta organização não tem nenhum módulo ativo.</p>
        ) : (
          <div className="space-y-3">
            {modulos.map((m) => (
              <div key={m.key} className="space-y-1.5">
                <Label className="capitalize">{m.nome}</Label>
                <select
                  value={selecao[m.key] ?? SENTINEL_PADRAO}
                  onChange={(e) => setSelecao((prev) => ({ ...prev, [m.key]: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value={SENTINEL_PADRAO}>Padrão ({papelGlobal ? PAPEL_LABELS[papelGlobal] : "—"})</option>
                  {(Object.keys(PAPEL_LABELS) as PapelUsuario[]).map((p) => (
                    <option key={p} value={p}>
                      {PAPEL_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando || carregando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
