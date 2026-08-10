import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EffortKpiCardProps = {
  title: string;
  value: number | string;
  icon: LucideIcon;
  accent: string;
  iconClassName: string;
  iconBackgroundClassName: string;
  detail?: string;
};

export function EffortKpiCard({
  title,
  value,
  icon: Icon,
  accent,
  iconClassName,
  iconBackgroundClassName,
  detail,
}: EffortKpiCardProps) {
  return (
    <div className="relative min-h-[124px] overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 shadow-card dark:border-gray-700/80 dark:bg-gray-800 sm:min-h-0 sm:rounded-xl sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] opacity-80" style={{ backgroundColor: accent }} />
      <div className={cn("flex size-9 items-center justify-center rounded-xl sm:size-11", iconBackgroundClassName)}>
        <Icon className={cn("size-5", iconClassName)} strokeWidth={2.25} />
      </div>
      <div className="mt-2.5 sm:mt-3">
        <p className="text-[1.625rem] font-extrabold leading-none tracking-tight text-gray-900 dark:text-white sm:text-3xl">
          {value}
        </p>
        <p className="mt-1.5 text-xs font-semibold leading-tight text-gray-600 dark:text-gray-300 sm:text-sm sm:font-medium sm:text-gray-500 sm:dark:text-gray-400">
          {title}
        </p>
        {detail && <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground sm:text-xs">{detail}</p>}
      </div>
    </div>
  );
}

export function EffortDashboardSkeleton({ kpiCount, desktopColumns = 4 }: { kpiCount: number; desktopColumns?: 4 | 6 }) {
  return (
    <div className="space-y-4 sm:space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando dados...</span>
      <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", desktopColumns === 6 ? "lg:grid-cols-6" : "lg:grid-cols-4")}>
        {Array.from({ length: kpiCount }, (_, index) => (
          <div key={index} className="h-[124px] animate-pulse rounded-2xl bg-muted sm:h-32 sm:rounded-xl" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-muted sm:rounded-xl" />
    </div>
  );
}
