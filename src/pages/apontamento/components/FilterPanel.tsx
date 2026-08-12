import { useState, type ReactNode } from "react";
import { ChevronDown, Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type FilterPanelProps = {
  isMobile: boolean;
  activeCount: number;
  summary?: string;
  onClear: () => void;
  children: ReactNode;
};

export function FilterPanel({ isMobile, activeCount, summary, onClear, children }: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return (
      <Card>
        <CardContent className="pt-6">{children}</CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border bg-card shadow-card">
      <div className="flex items-center gap-2 p-3">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="group h-11 flex-1 justify-between px-2">
            <span className="flex items-center gap-2 font-semibold">
              <Filter className="size-4 text-primary" />
              Filtros
              {activeCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        {activeCount > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-11 px-2 text-xs text-muted-foreground">
            <RotateCcw className="size-3.5" />
            Limpar
          </Button>
        )}
      </div>
      {!open && summary && (
        <p className="px-5 pb-3 text-xs leading-relaxed text-muted-foreground">{summary}</p>
      )}
      <CollapsibleContent>
        <div className="border-t p-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
