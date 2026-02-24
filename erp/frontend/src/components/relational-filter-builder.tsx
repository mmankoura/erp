"use client"

import { useState, useMemo } from "react"
import { useApi } from "@/hooks/use-api"
import {
  type Product,
  type BomRevision,
  type Order,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, X, Filter } from "lucide-react"

export interface FilterGroup {
  type: "product_revision" | "order"
  ids: string[]
}

interface ProductRevisionFilter {
  id: string
  type: "product_revision"
  productId: string
  revisionIds: string[]
}

interface OrderFilter {
  id: string
  type: "order"
  orderIds: string[]
}

type FilterEntry = ProductRevisionFilter | OrderFilter

interface RelationalFilterBuilderProps {
  onApply: (filters: FilterGroup[], logic: "AND" | "OR") => void
  onClear: () => void
  activeFilterCount: number
}

export function RelationalFilterBuilder({
  onApply,
  onClear,
  activeFilterCount,
}: RelationalFilterBuilderProps) {
  const [filters, setFilters] = useState<FilterEntry[]>([])
  const [logic, setLogic] = useState<"AND" | "OR">("OR")

  const { data: products } = useApi<Product[]>("/products")
  const { data: orders } = useApi<Order[]>("/orders")

  const addProductRevisionFilter = () => {
    setFilters((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "product_revision",
        productId: "",
        revisionIds: [],
      },
    ])
  }

  const addOrderFilter = () => {
    setFilters((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "order",
        orderIds: [],
      },
    ])
  }

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id))
  }

  const updateProductFilter = (
    id: string,
    update: Partial<ProductRevisionFilter>
  ) => {
    setFilters((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, ...update } as FilterEntry : f
      )
    )
  }

  const updateOrderFilter = (id: string, orderIds: string[]) => {
    setFilters((prev) =>
      prev.map((f) =>
        f.id === id && f.type === "order" ? { ...f, orderIds } : f
      )
    )
  }

  const handleApply = () => {
    const groups: FilterGroup[] = []
    for (const f of filters) {
      if (f.type === "product_revision" && f.revisionIds.length > 0) {
        groups.push({ type: "product_revision", ids: f.revisionIds })
      } else if (f.type === "order" && f.orderIds.length > 0) {
        groups.push({ type: "order", ids: f.orderIds })
      }
    }
    onApply(groups, logic)
  }

  const handleClear = () => {
    setFilters([])
    onClear()
  }

  const hasFilters = filters.length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={addProductRevisionFilter}>
              Product / Revision
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addOrderFilter}>
              Order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFilters && filters.length > 1 && (
          <div className="flex items-center gap-1 border rounded-md">
            <button
              type="button"
              className={`px-2 py-1 text-xs font-medium rounded-l-md ${logic === "OR" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setLogic("OR")}
            >
              OR
            </button>
            <button
              type="button"
              className={`px-2 py-1 text-xs font-medium rounded-r-md ${logic === "AND" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setLogic("AND")}
            >
              AND
            </button>
          </div>
        )}

        {hasFilters && (
          <>
            <Button variant="default" size="sm" onClick={handleApply}>
              <Filter className="h-4 w-4 mr-1" />
              Apply
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </>
        )}

        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {activeFilterCount} active
          </Badge>
        )}
      </div>

      {filters.map((filter) => (
        <div key={filter.id} className="flex items-start gap-2 p-2 bg-muted/30 rounded-md border">
          {filter.type === "product_revision" ? (
            <ProductRevisionFilterRow
              filter={filter}
              products={products || []}
              onUpdate={updateProductFilter}
              onRemove={() => removeFilter(filter.id)}
            />
          ) : (
            <OrderFilterRow
              filter={filter}
              orders={orders || []}
              onUpdate={updateOrderFilter}
              onRemove={() => removeFilter(filter.id)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function ProductRevisionFilterRow({
  filter,
  products,
  onUpdate,
  onRemove,
}: {
  filter: ProductRevisionFilter
  products: Product[]
  onUpdate: (id: string, update: Partial<ProductRevisionFilter>) => void
  onRemove: () => void
}) {
  const { data: revisions } = useApi<BomRevision[]>(
    filter.productId ? `/bom/product/${filter.productId}?includeArchived=true` : "",
    { enabled: !!filter.productId }
  )

  return (
    <>
      <Badge variant="outline" className="shrink-0 mt-1">Product</Badge>
      <div className="flex flex-1 items-center gap-2 flex-wrap">
        <Select
          value={filter.productId}
          onValueChange={(val) =>
            onUpdate(filter.id, { productId: val, revisionIds: [] })
          }
        >
          <SelectTrigger className="w-[200px] h-8">
            <SelectValue placeholder="Select product..." />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.part_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {revisions && revisions.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {revisions.map((rev) => {
              const selected = filter.revisionIds.includes(rev.id)
              return (
                <Badge
                  key={rev.id}
                  variant={selected ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => {
                    const newIds = selected
                      ? filter.revisionIds.filter((id) => id !== rev.id)
                      : [...filter.revisionIds, rev.id]
                    onUpdate(filter.id, { revisionIds: newIds })
                  }}
                >
                  {rev.revision_number}
                  {rev.is_active && " *"}
                </Badge>
              )
            })}
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </>
  )
}

function OrderFilterRow({
  filter,
  orders,
  onUpdate,
  onRemove,
}: {
  filter: OrderFilter
  orders: Order[]
  onUpdate: (id: string, orderIds: string[]) => void
  onRemove: () => void
}) {
  // Show only active orders
  const activeOrders = useMemo(
    () => orders.filter((o) => !["SHIPPED", "CANCELLED"].includes(o.status)),
    [orders]
  )

  return (
    <>
      <Badge variant="outline" className="shrink-0 mt-1">Order</Badge>
      <div className="flex flex-1 items-center gap-1 flex-wrap">
        {activeOrders.map((order) => {
          const selected = filter.orderIds.includes(order.id)
          return (
            <Badge
              key={order.id}
              variant={selected ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => {
                const newIds = selected
                  ? filter.orderIds.filter((id) => id !== order.id)
                  : [...filter.orderIds, order.id]
                onUpdate(filter.id, newIds)
              }}
            >
              {order.order_number}
            </Badge>
          )
        })}
        {activeOrders.length === 0 && (
          <span className="text-xs text-muted-foreground">No active orders</span>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </>
  )
}
