"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Customer, type PhysicalCount } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NewPhysicalCountPage() {
  const router = useRouter()
  const { data: customers } = useApi<Customer[]>("/customers")
  const [customerId, setCustomerId] = useState<string>("")
  const [binFilter, setBinFilter] = useState<string>("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [notes, setNotes] = useState<string>("")

  const createMutation = useMutation<PhysicalCount, void>(
    () => api.post("/physical-counts", {
      customer_id: customerId,
      bin_filter: binFilter.trim() || undefined,
      category_filter: categoryFilter.trim() || undefined,
      notes: notes.trim() || undefined,
    }),
    {
      onSuccess: (created) => {
        toast.success(`Created ${created.count_number}`)
        router.push(`/physical-count/${created.id}`)
      },
      onError: (err) => toast.error(err.message || "Failed to create count"),
    }
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/physical-count">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Physical Count</CardTitle>
          <CardDescription>
            Pick a customer. Optionally narrow scope by bin or material category.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a customer..." />
              </SelectTrigger>
              <SelectContent>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>BIN filter (optional)</Label>
            <Input
              value={binFilter}
              onChange={(e) => setBinFilter(e.target.value)}
              placeholder="Leave blank to count all bins"
            />
          </div>
          <div className="space-y-2">
            <Label>Material category filter (optional)</Label>
            <Input
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Leave blank to include all categories"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
            />
          </div>
          <Button
            disabled={!customerId || createMutation.isLoading}
            onClick={() => createMutation.mutate(undefined)}
          >
            {createMutation.isLoading ? "Creating..." : "Create"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
