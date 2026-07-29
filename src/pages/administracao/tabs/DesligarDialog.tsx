import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { desligarFuncionario, type FuncionarioRow, type MotivoDemissao } from "@/lib/administracao/db";
import { todayISO } from "@/pages/apontamento/lib/date-utils";

const MOTIVO_OPCOES: { value: MotivoDemissao; label: string }[] = [
  { value: "pedido_demissao", label: "Pedido de demissão" },
  { value: "justa_causa", label: "Justa causa" },
  { value: "termino_contrato", label: "Término de contrato" },
  { value: "sem_justa_causa", label: "Sem justa causa" },
];

interface Props {
  organizacaoId: string;
  funcionario: FuncionarioRow | null;
  cargoNome: string | null;
  setorNome: string | null;
  onClose: () => void;
  onDesligado: () => void;
}

export default function DesligarDialog({ organizacaoId, funcionario, cargoNome, setorNome, onClose, onDesligado }: Props) {
  const [motivo, setMotivo] = useState<MotivoDemissao>("pedido_demissao");
  const [dataDemissao, setDataDemissao] = useState(todayISO());
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!funcionario) return;
    setSalvando(true);
    try {
      await desligarFuncionario({ organizacaoId, funcionario, cargoNome, setorNome, motivo, dataDemissao });
      toast.success(`${funcionario.nome} movido pra Demissões.`);
      onDesligado();
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
          <AlertDialogTitle>Desligar {funcionario?.nome}?</AlertDialogTitle>
          <AlertDialogDescription>
            Move o funcionário pra Demissões e remove ele da lista de Ativos. O histórico fica preservado.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as MotivoDemissao)}
            >
              {MOTIVO_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Data de demissão</Label>
            <input
              type="date"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={dataDemissao}
              onChange={(e) => setDataDemissao(e.target.value)}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmar} disabled={salvando} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {salvando ? "Desligando..." : "Desligar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
