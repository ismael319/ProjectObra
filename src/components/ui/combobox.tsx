import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

export type ComboboxOption = { value: string; label: string; group?: string }

interface ComboboxProps {
  options: ComboboxOption[]
  value: string | null | undefined
  onChange: (v: string | null) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  allowClear?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  emptyText = "Nenhum resultado",
  disabled,
  allowClear = true,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  const grouped = React.useMemo(() => {
    const map = new Map<string, ComboboxOption[]>()
    for (const o of options) {
      const key = o.group ?? ""
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return [...map.entries()]
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <div className="flex items-center gap-1">
            {allowClear && selected && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onChange(null) }}
                className="rounded p-0.5 hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {grouped.map(([group, opts]) => (
              <CommandGroup key={group} heading={group || undefined}>
                {opts.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.group ?? ""}`}
                    onSelect={() => { onChange(o.value); setOpen(false) }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface MultiComboboxProps {
  options: ComboboxOption[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  emptyText?: string
  className?: string
}

export function MultiCombobox({
  options, value, onChange,
  placeholder = "Todos",
  emptyText = "Nenhum resultado",
  className,
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const selectedSet = new Set(value)

  const toggle = (v: string) => {
    const next = new Set(selectedSet)
    if (next.has(v)) next.delete(v); else next.add(v)
    onChange([...next])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between font-normal min-h-9 h-auto", value.length === 0 && "text-muted-foreground", className)}
        >
          <div className="flex flex-wrap gap-1 items-center">
            {value.length === 0 && <span>{placeholder}</span>}
            {value.length > 0 && value.length <= 2 && options
              .filter((o) => selectedSet.has(o.value))
              .map((o) => (
                <Badge key={o.value} variant="secondary" className="font-normal">
                  {o.label}
                </Badge>
              ))}
            {value.length > 2 && (
              <Badge variant="secondary">{value.length} selecionados</Badge>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {value.length > 0 && (
                <CommandItem onSelect={() => onChange([])} className="text-muted-foreground">
                  Limpar seleção
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                  <Check className={cn("mr-2 h-4 w-4", selectedSet.has(o.value) ? "opacity-100" : "opacity-0")} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
