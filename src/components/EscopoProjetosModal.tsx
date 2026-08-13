import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type EscopoProjetos = "todos" | "vinculados";

type ProjetoOption = { id: string; nome: string };

// Controla, por usuário, se ele enxerga TODOS os projetos da empresa (padrão
// — mesmo comportamento de sempre) ou só um subconjunto vinculado (uso
// típico: encarregado/auxiliar de campo restrito à(s) obra(s) em que atua).
// Não mexe no papel (edicao/visualizacao/insercao_pontual) — é uma dimensão
// separada. Grava em user_profiles.escopo_projetos + projeto_usuarios (ver
// migration 20260813000000_dashboard-portfolio-fase-a-migration.sql).
export default function EscopoProjetosModal({
  open,
  onOpenChange,
  usuarioId,
  usuarioEmail,
  organizacaoId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarioId: string;
  usuarioEmail: string | null;
  organizacaoId: string;
}) {
  const { user } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [projetos, setProjetos] = useState<ProjetoOption[]>([]);
  const [escopo, setEscopo] = useState<EscopoProjetos>("todos");
  const [vinculadosOriginais, setVinculadosOriginais] = useState<Set<string>>(new Set());
  const [vinculados, setVinculados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      const [{ data: projetosData, error: errProjetos }, { data: perfilData, error: errPerfil }, { data: vinculosData, error: errVinculos }] =
        await Promise.all([
          supabase.from("projetos").select("id, nome").eq("organizacao_id", organizacaoId).order("nome"),
          supabase.from("user_profiles").select("escopo_projetos").eq("id", usuarioId).maybeSingle(),
          supabase.from("projeto_usuarios").select("projeto_id").eq("user_id", usuarioId),
        ]);

      if (cancelado) return;
      if (errProjetos || errPerfil || errVinculos) {
        toast.error("Não foi possível carregar os projetos.");
        setCarregando(false);
        return;
      }

      const vinculadosSet = new Set(((vinculosData ?? []) as { projeto_id: string }[]).map((v) => v.projeto_id));
      setProjetos((projetosData ?? []) as ProjetoOption[]);
      setEscopo(((perfilData?.escopo_projetos as EscopoProjetos | undefined) ?? "todos"));
      setVinculadosOriginais(vinculadosSet);
      setVinculados(new Set(vinculadosSet));
      setCarregando(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [open, organizacaoId, usuarioId]);

  function toggleProjeto(id: string) {
    setVinculados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const { error: errPerfil } = await supabase
        .from("user_profiles")
        .update({ escopo_projetos: escopo })
        .eq("id", usuarioId);
      if (errPerfil) throw errPerfil;

      const aAdicionar = [...vinculados].filter((id) => !vinculadosOriginais.has(id));
      const aRemover = [...vinculadosOriginais].filter((id) => !vinculados.has(id));

      if (aAdicionar.length > 0) {
        const { error } = await supabase
          .from("projeto_usuarios")
          .upsert(
            aAdicionar.map((projeto_id) => ({ projeto_id, user_id: usuarioId, atribuido_por: user?.id ?? null })),
            { onConflict: "projeto_id,user_id" }
          );
        if (error) throw error;
      }
      if (aRemover.length > 0) {
        const { error } = await supabase
          .from("projeto_usuarios")
          .delete()
          .eq("user_id", usuarioId)
          .in("projeto_id", aRemover);
        if (error) throw error;
      }

      toast.success("Escopo de projetos atualizado.");
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
          <DialogTitle>Escopo de projetos</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {usuarioEmail ?? "Usuário"} — controla quais obras esta pessoa enxerga, sem alterar o papel dela.
        </p>
        {carregando ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Visibilidade</Label>
              <select
                value={escopo}
                onChange={(e) => setEscopo(e.target.value as EscopoProjetos)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="todos">Todos os projetos da empresa (padrão)</option>
                <option value="vinculados">Só os projetos vinculados abaixo</option>
              </select>
            </div>

            {escopo === "vinculados" && (
              projetos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Esta empresa não tem projetos cadastrados.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {projetos.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={vinculados.has(p.id)} onCheckedChange={() => toggleProjeto(p.id)} />
                      {p.nome}
                    </label>
                  ))}
                </div>
              )
            )}
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
