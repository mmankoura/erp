"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useMutation } from "@/hooks/use-api"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import {
  type ConsumableOrder,
  type NewLine,
  emptyLine,
} from "../page"

export default function NewConsumableOrderPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [supplier, setSupplier] = useState("")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [expectedDate, setExpectedDate] = useState("")
  const [currency, setCurrency] = useState("CAD")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<NewLine[]>([{ ...emptyLine }])

  const createMutation = useMutation(
    (data: unknown) => api.post<ConsumableOrder>("/consumable-orders", data),
    {
      onSuccess: (result) => {
        toast.success(`Consumable order ${result.order_number} created`)
        router.push(`/consumable-orders/${result.id}`)
      },
      onError: (error) => toast.error(error.message || "Failed to create order"),
    },
  )

  const updateLine = (index: number, field: keyof NewLine, value: string) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  }

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }])
  const removeLine = (index: number) => {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const validLines = lines.filter((l) => l.description.trim())
    if (!supplier.trim()) {
      toast.error("Supplier is required")
      return
    }
    if (validLines.length === 0) {
      toast.error("At least one line item is required")
      return
    }
    createMutation.mutate({
      supplier: supplier.trim(),
      order_date: orderDate,
      expected_date: expectedDate || undefined,
      currency,
      notes: notes || undefined,
      created_by: user?.username,
      lines: validLines.map((l) => ({
        ata_part_number: l.ata_part_number || undefined,
        description: l.description,
        manufacturer: l.manufacturer || undefined,
        manufacturer_pn: l.manufacturer_pn || undefined,
        quantity: parseFloat(l.quantity) || 1,
        unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : undefined,
        customer: l.customer || undefined,
        notes: l.notes || undefined,
      })),
    })
  }

  const totalAmount = lines.reduce(
    (sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0),
    0,
  )

  return (
    <div className="space-y-4">
      <Link href="/consumable-orders">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Consumable Orders
        </Button>
      </Link>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">New Consumable Order</h1>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/consumable-orders")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isLoading || !supplier.trim()}>
              {createMutation.isLoading ? "Saving..." : "Create Order"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 px-4 py-3">
          <div className="grid grid-cols-5 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Supplier *</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Supplier name"
                className="h-8"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Order Date *</Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-8"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expected Date</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="h-8"
              />
            </div>
          </div>
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[40px] text-center">#</TableHead>
                <TableHead className="w-[140px]">AT&A P/N</TableHead>
                <TableHead>Description *</TableHead>
                <TableHead className="w-[140px]">MFR</TableHead>
                <TableHead className="w-[140px]">MFR P/N</TableHead>
                <TableHead className="w-[80px] text-right">Qty</TableHead>
                <TableHead className="w-[110px] text-right">Unit Cost</TableHead>
                <TableHead className="w-[140px]">Customer</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow key={idx} className="group">
                  <TableCell className="text-center text-muted-foreground text-xs">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.ata_part_number}
                      onChange={(e) => updateLine(idx, "ata_part_number", e.target.value)}
                      placeholder="P/N"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      placeholder="Description"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.manufacturer}
                      onChange={(e) => updateLine(idx, "manufacturer", e.target.value)}
                      placeholder="MFR"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.manufacturer_pn}
                      onChange={(e) => updateLine(idx, "manufacturer_pn", e.target.value)}
                      placeholder="MFR P/N"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                      className="h-7 text-xs text-right border-transparent bg-transparent hover:border-input focus:border-input"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(idx, "unit_cost", e.target.value)}
                      placeholder="0.00"
                      className="h-7 text-xs text-right border-transparent bg-transparent hover:border-input focus:border-input"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.customer}
                      onChange={(e) => updateLine(idx, "customer", e.target.value)}
                      placeholder="Optional"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" />
            Add Line
          </Button>
          {totalAmount > 0 && (
            <span className="text-sm">
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">
                {currency} {totalAmount.toFixed(2)}
              </span>
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
