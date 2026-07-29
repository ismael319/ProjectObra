import type { StatusBdr, StatusFs } from "@/lib/administracao/db";

const TONS = {
  green: "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  amber: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  red: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  gray: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
};

function Pill({ tom, children }: { tom: keyof typeof TONS; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${TONS[tom]}`}>
      {children}
    </span>
  );
}

const STATUS_BDR_LABEL: Record<StatusBdr, string> = {
  liberado_fs: "Liberado FS",
  integracao: "Integração",
  aguardando_documentacao: "Aguardando documentação",
};

const STATUS_BDR_TOM: Record<StatusBdr, keyof typeof TONS> = {
  liberado_fs: "green",
  integracao: "gray",
  aguardando_documentacao: "amber",
};

export function StatusBdrPill({ status }: { status: StatusBdr }) {
  return <Pill tom={STATUS_BDR_TOM[status]}>{STATUS_BDR_LABEL[status]}</Pill>;
}

const STATUS_FS_LABEL: Record<StatusFs, string> = {
  liberado: "Liberado",
  bloqueado: "Bloqueado",
};

export function StatusFsPill({ status }: { status: StatusFs }) {
  return <Pill tom={status === "liberado" ? "green" : "red"}>{STATUS_FS_LABEL[status]}</Pill>;
}

export function VencimentoPill({ diasParaVencer }: { diasParaVencer: number }) {
  if (diasParaVencer < 0) return <Pill tom="red">Vencido há {Math.abs(diasParaVencer)} dia(s)</Pill>;
  if (diasParaVencer === 0) return <Pill tom="red">Vence hoje</Pill>;
  return <Pill tom="amber">Vence em {diasParaVencer} dia(s)</Pill>;
}
