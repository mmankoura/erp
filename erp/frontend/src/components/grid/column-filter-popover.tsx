"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Filter } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Excel-style distinct-value filter. The value list is built from the rows the
 * grid is currently showing (i.e. already narrowed by the search box), so the
 * options track what is actually on screen.
 */
export function ColumnFilterPopover<T>({
  column,
  data,
  accessor,
}: {
  column: { getFilterValue: () => unknown; setFilterValue: (val: unknown) => void }
  data: T[]
  accessor: (row: T) => string
}) {
  const [filterSearch, setFilterSearch] = useState("")
  const allValues = useMemo(() => {
    const vals = new Set<string>()
    data.forEach((row) => {
      const v = accessor(row)
      if (v) vals.add(v)
    })
    return Array.from(vals).sort()
  }, [data, accessor])

  const filteredValues = filterSearch
    ? allValues.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : allValues

  const selectedValues = (column.getFilterValue() as string[] | undefined) ?? []
  const isFiltered = selectedValues.length > 0

  const toggleValue = (val: string) => {
    const current = selectedValues
    if (current.includes(val)) {
      const next = current.filter((v) => v !== val)
      column.setFilterValue(next.length > 0 ? next : undefined)
    } else {
      column.setFilterValue([...current, val])
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("ml-1", isFiltered ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground")}>
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-2" align="start">
        {allValues.length > 8 && (
          <Input
            placeholder="Search..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="h-7 text-xs mb-2"
          />
        )}
        <div className="max-h-[200px] overflow-auto space-y-1">
          {filteredValues.map((val) => (
            <label key={val} className="flex items-center gap-2 px-1 py-0.5 text-xs hover:bg-muted rounded cursor-pointer">
              <Checkbox
                checked={selectedValues.includes(val)}
                onCheckedChange={() => toggleValue(val)}
                className="h-3.5 w-3.5"
              />
              {val}
            </label>
          ))}
        </div>
        <div className="flex gap-1 mt-2 pt-2 border-t">
          <Button variant="ghost" size="sm" className="h-6 text-xs flex-1" onClick={() => column.setFilterValue(allValues)}>
            All
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs flex-1" onClick={() => column.setFilterValue(undefined)}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
