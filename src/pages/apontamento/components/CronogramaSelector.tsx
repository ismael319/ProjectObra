import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, Settings2 } from "lucide-react";
import { useCronogramaItens, type CronogramaItem } from "../lib/catalog";

const EMPTY_ITEMS: CronogramaItem[] = [];

interface CronogramaSelectorProps {
  cronogramaId: string | null;
  onCronogramaChange: (id: string | null) => void;
  selectedItems: CronogramaItem[];
  onSelectionChange: (items: CronogramaItem[]) => void;
}

function CheckboxList({
  items,
  selected,
  onToggle,
  level,
}: {
  items: CronogramaItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  level: number;
}) {
  return (
    <ScrollArea className="h-[200px]">
      <div className="space-y-0.5 p-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 text-sm">
            <Checkbox
              checked={selected.has(item.id)}
              onCheckedChange={() => onToggle(item.id)}
            />
            <span className="font-mono text-[11px] text-muted-foreground">{item.indice}</span>
            <span className="truncate">{item.nome}</span>
            <Badge variant="outline" className="ml-auto text-[10px]">
              Nv.{level}
            </Badge>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum item disponível</p>
        )}
      </div>
    </ScrollArea>
  );
}

export function CronogramaSelector({
  cronogramaId,
  selectedItems,
  onSelectionChange,
}: CronogramaSelectorProps) {
  const { data: allItems = EMPTY_ITEMS } = useCronogramaItens(cronogramaId);

  const [levelMap, setLevelMap] = useState<Record<number, number>>({ 1: 1, 2: 2, 3: 3 });
  const [selectedL1, setSelectedL1] = useState<Set<string>>(new Set());
  const [selectedL2, setSelectedL2] = useState<Set<string>>(new Set());
  const [selectedL3, setSelectedL3] = useState<Set<string>>(new Set());

  const mappedLevelMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const [depth, level] of Object.entries(levelMap)) {
      if (level > 0) map[Number(depth)] = level;
    }
    return map;
  }, [levelMap]);

  const itemsByMappedLevel = useMemo(() => {
    const byLevel: Record<number, CronogramaItem[]> = {};
    for (const item of allItems) {
      const depth = item.indice.split(".").length;
      const mapped = mappedLevelMap[depth] ?? 0;
      if (mapped > 0) {
        if (!byLevel[mapped]) byLevel[mapped] = [];
        byLevel[mapped].push(item);
      }
    }
    return byLevel;
  }, [allItems, mappedLevelMap]);

  const rebuildSelection = useCallback(() => {
    const items: CronogramaItem[] = [];
    const addRecursive = (ids: Set<string>, level: number) => {
      for (const id of ids) {
        const item = allItems.find((i) => i.id === id);
        if (item) items.push(item);
      }
      if (level < 3) {
        const nextIds = level === 1 ? selectedL2 : selectedL3;
        addRecursive(nextIds, level + 1);
      }
    };
    addRecursive(selectedL1, 1);
    onSelectionChange(items);
  }, [allItems, selectedL1, selectedL2, selectedL3, onSelectionChange]);

  useEffect(() => { rebuildSelection(); }, [rebuildSelection]);

  const toggleLevel = (level: number, id: string) => {
    const setter = level === 1 ? setSelectedL1 : level === 2 ? setSelectedL2 : setSelectedL3;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (level === 1) {
          const children = (itemsByMappedLevel[2] ?? []).filter((i) => i.pai_id === id);
          for (const c of children) {
            setSelectedL2((p) => { const n = new Set(p); n.delete(c.id); return n; });
          }
        }
        if (level <= 2) {
          const children = (itemsByMappedLevel[level + 1] ?? []).filter((i) => i.pai_id === id);
          for (const c of children) {
            setSelectedL3((p) => { const n = new Set(p); n.delete(c.id); return n; });
          }
        }
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = (level: number) => {
    const items = itemsByMappedLevel[level] ?? [];
    const setter = level === 1 ? setSelectedL1 : level === 2 ? setSelectedL2 : setSelectedL3;
    const current = level === 1 ? selectedL1 : level === 2 ? selectedL2 : selectedL3;
    if (current.size === items.length) {
      setter(new Set());
    } else {
      setter(new Set(items.map((i) => i.id)));
    }
  };

  const filteredL2 = useMemo(() => {
    const parentIds = new Set(
      (itemsByMappedLevel[1] ?? [])
        .filter((i) => selectedL1.has(i.id))
        .map((i) => i.id)
    );
    return (itemsByMappedLevel[2] ?? []).filter((i) => !i.pai_id || parentIds.has(i.pai_id));
  }, [itemsByMappedLevel, selectedL1]);

  const filteredL3 = useMemo(() => {
    const parentIds = new Set(
      (itemsByMappedLevel[2] ?? [])
        .filter((i) => selectedL2.has(i.id))
        .map((i) => i.id)
    );
    return (itemsByMappedLevel[3] ?? []).filter((i) => !i.pai_id || parentIds.has(i.pai_id));
  }, [itemsByMappedLevel, selectedL2]);

  const removeItem = (id: string) => {
    setSelectedL1((p) => { const n = new Set(p); n.delete(id); return n; });
    setSelectedL2((p) => { const n = new Set(p); n.delete(id); return n; });
    setSelectedL3((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Selecionar itens do cronograma</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setSelectedL1(new Set()); setSelectedL2(new Set()); setSelectedL3(new Set()); }}>
              Limpar tudo
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline"><Settings2 className="h-3.5 w-3.5" /></Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Mapeamento de profundidade</Label>
                  {[1, 2, 3, 4, 5].map((depth) => (
                    <div key={depth} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-24">Profundidade {depth}</span>
                      <Select
                        value={String(levelMap[depth] ?? 0)}
                        onValueChange={(v) => setLevelMap((p) => ({ ...p, [depth]: Number(v) }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Não usar</SelectItem>
                          <SelectItem value="1">Nível 1</SelectItem>
                          <SelectItem value="2">Nível 2</SelectItem>
                          <SelectItem value="3">Nível 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {selectedItems.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedItems.slice(0, 20).map((item) => (
              <Badge key={item.id} variant="secondary" className="text-[10px]">
                {item.nome}
                <button onClick={() => removeItem(item.id)} className="ml-1 hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            {selectedItems.length > 20 && <Badge variant="outline">+{selectedItems.length - 20}</Badge>}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((level) => {
          const items = level === 1 ? (itemsByMappedLevel[1] ?? []) : level === 2 ? filteredL2 : filteredL3;
          const selected = level === 1 ? selectedL1 : level === 2 ? selectedL2 : selectedL3;
          return (
            <div key={level}>
              <div className="flex items-center gap-2 mb-1">
                <Checkbox
                  checked={items.length > 0 && selected.size === items.length}
                  onCheckedChange={() => toggleAll(level)}
                />
                <Label className="text-xs font-medium text-muted-foreground">Nível {level} ({items.length} itens)</Label>
              </div>
              <CheckboxList items={items} selected={selected} onToggle={(id) => toggleLevel(level, id)} level={level} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
