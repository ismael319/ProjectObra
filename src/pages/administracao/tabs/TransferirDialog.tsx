import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { transferirFuncionario, type FuncionarioRow } from "@/lib/administracao/db";
import { todayISO } from "@/pages/apontamento/lib/date-utils";

interface Props {
  organizacaoId: string;
  funcionario: FuncionarioRow | null;
  cargoNome: string | null;
  setorNome: string | null;
  obrasDisponiveis: { id: string; nome: string }[];
  onClose: () => void;
  onTransferido: () => void;
}

export default function TransferirDialog({
  organizacaoId, funcionario, cargoNome, setorNome, obrasDisponiveis, onClose, onTransferido,
}: Props) {
  const [projetoDestinoId, setProjetoDestinoId] = useState<string | null>(null);
  const [dataTransferencia, setDataTransferencia] = useState(todayISO());
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!funcionario || !projetoDestinoId) return;
    setSalvando(true);
    try {
      await transferirFuncionario({
        organizacaoId,
        funcionario,
        cargoNome,
        setorNome,
        projetoDestinoId,
        dataTransferencia,
        motivo: motivo.trim() || null,
      });
      toast.success(`${funcionario.nome} transferido.`);
      onTransferido();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AlertDialog open={!!funcionario} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Transferir {funcionario?.nome}?</AlertDialogTitle>
          <AlertDialogDescription>
            Move o funcionário para outra obra. Ele passa a aparecer na aba Funcionários da obra de destino, e este registro fica no histórico de Transferências.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Obra de destino</Label>
            <Combobox
              options={obrasDisponiveis.map((o) => ({ value: o.id, label: o.nome }))}
              value={projetoDestinoId}
              onChange={(v) => setProjetoDestinoId(v)}
              placeholder="Selecione a obra..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data da transferência</Label>
            <input
              type="date"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={dataTransferencia}
              onChange={(e) => setDataTransferencia(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: necessidade de obra, remanejamento..." />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmar} disabled={salvando || !projetoDestinoId}>
            {salvando ? "Transferindo..." : "Transferir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
