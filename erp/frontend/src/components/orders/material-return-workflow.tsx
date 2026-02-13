"use client"

import { useState } from "react"
import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type Order,
  type InventoryAllocation,
  type IssuedMaterial,
  type MaterialReturnInput,
  type OrderReturnResult,
  type PickMaterialsResult,
  type IssueMaterialsResult,
  type AllocationStatus,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Package, ArrowRight, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react"

const allocationStatusColors: Record<AllocationStatus, string> = {
  ACTIVE: "bg-blue-100 text-blue-800",
  PICKED: "bg-yellow-100 text-yellow-800",
  ISSUED: "bg-purple-100 text-purple-800",
  FLOOR_STOCK: "bg-orange-100 text-orange-800",
  CONSUMED: "bg-green-100 text-green-800",
  RETURNED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-red-100 text-red-800",
}

interface MaterialReturnWorkflowProps {
  order: Order
  onUpdate?: () => void
}

interface ReturnFormData {
  allocation_id: string
  counted_quantity: number
  consumed_quantity: number
  waste_quantity: number
  action: "RETURN" | "FLOOR_STOCK"
}

export function MaterialReturnWorkflow({ order, onUpdate }: MaterialReturnWorkflowProps) {
  const [returnForms, setReturnForms] = useState<Record<string, ReturnFormData>>({})
  const [selectedAllocations, setSelectedAllocations] = useState<Set<string>>(new Set())

  // Fetch allocations by status
  const { data: allocations, refetch: refetchAllocations } = useApi<InventoryAllocation[]>(
    `/inventory/allocations/order/${order.id}?includeInactive=true`
  )

  // Fetch issued materials (for return workflow)
  const { data: issuedMaterials, refetch: refetchIssued } = useApi<IssuedMaterial[]>(
    `/inventory/order/${order.id}/issued`
  )

  // Group allocations by status
  const activeAllocations = allocations?.filter(a => a.status === "ACTIVE") || []
  const pickedAllocations = allocations?.filter(a => a.status === "PICKED") || []
  const issuedAllocations = allocations?.filter(a => a.status === "ISSUED") || []

  // Mutations
  const pickMutation = useMutation(
    (allocationIds?: string[]) =>
      api.post<PickMaterialsResult>(`/inventory/order/${order.id}/pick`, {
        allocation_ids: allocationIds,
      }),
    {
      onSuccess: (result) => {
        toast.success(`Picked ${result.picked} materials`)
        refetchAllocations()
        setSelectedAllocations(new Set())
        onUpdate?.()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to pick materials")
      },
    }
  )

  const issueMutation = useMutation(
    (allocationIds?: string[]) =>
      api.post<IssueMaterialsResult>(`/inventory/order/${order.id}/issue`, {
        allocation_ids: allocationIds,
      }),
    {
      onSuccess: (result) => {
        toast.success(`Issued ${result.issued} materials to production`)
        refetchAllocations()
        refetchIssued()
        setSelectedAllocations(new Set())
        onUpdate?.()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to issue materials")
      },
    }
  )

  const returnMutation = useMutation(
    (returns: MaterialReturnInput[]) =>
      api.post<OrderReturnResult>(`/inventory/order/${order.id}/return`, { returns }),
    {
      onSuccess: (result) => {
        toast.success(
          `Returned ${result.total_materials_returned} materials. ` +
          `Consumed: ${result.total_consumed}, Waste: ${result.total_waste}`
        )
        if (result.total_variance !== 0) {
          toast.warning(`Total variance: ${result.total_variance}`)
        }
        refetchAllocations()
        refetchIssued()
        setReturnForms({})
        onUpdate?.()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to process returns")
      },
    }
  )

  const autoConsumeTHMutation = useMutation<{ auto_consumed: number }, void>(
    (_: void) => api.post<{ auto_consumed: number }>(`/inventory/order/${order.id}/auto-consume-th`, {}),
    {
      onSuccess: (result) => {
        if (result.auto_consumed > 0) {
          toast.success(`Auto-consumed ${result.auto_consumed} TH parts`)
          refetchAllocations()
          refetchIssued()
          onUpdate?.()
        } else {
          toast.info("No TH parts eligible for auto-consumption")
        }
      },
      onError: (error) => {
        toast.error(error.message || "Failed to auto-consume TH parts")
      },
    }
  )

  // Initialize return form for an issued material
  const initReturnForm = (material: IssuedMaterial) => {
    setReturnForms((prev) => ({
      ...prev,
      [material.allocation_id]: {
        allocation_id: material.allocation_id,
        counted_quantity: material.expected_return_quantity,
        consumed_quantity: material.issued_quantity - material.expected_return_quantity,
        waste_quantity: 0,
        action: "RETURN",
      },
    }))
  }

  // Update return form field
  const updateReturnForm = (allocationId: string, field: keyof ReturnFormData, value: number | string) => {
    setReturnForms((prev) => ({
      ...prev,
      [allocationId]: {
        ...prev[allocationId],
        [field]: value,
      },
    }))
  }

  // Submit returns
  const handleSubmitReturns = () => {
    const returns: MaterialReturnInput[] = Object.values(returnForms).map((form) => ({
      allocation_id: form.allocation_id,
      counted_quantity: form.counted_quantity,
      consumed_quantity: form.consumed_quantity,
      waste_quantity: form.waste_quantity,
      action: form.action,
    }))

    if (returns.length === 0) {
      toast.error("No materials selected for return")
      return
    }

    returnMutation.mutate(returns)
  }

  // Toggle allocation selection
  const toggleAllocationSelection = (allocationId: string) => {
    setSelectedAllocations((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(allocationId)) {
        newSet.delete(allocationId)
      } else {
        newSet.add(allocationId)
      }
      return newSet
    })
  }

  // Select all allocations of a certain status
  const selectAllAllocations = (allocs: InventoryAllocation[]) => {
    setSelectedAllocations(new Set(allocs.map(a => a.id)))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Material Workflow
        </CardTitle>
        <CardDescription>
          Track material lifecycle: Allocate → Pick → Issue → Return
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pick" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pick" className="relative">
              Pick
              {activeAllocations.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeAllocations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="issue" className="relative">
              Issue
              {pickedAllocations.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pickedAllocations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="return" className="relative">
              Return
              {issuedAllocations.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {issuedAllocations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* PICK Tab */}
          <TabsContent value="pick" className="space-y-4">
            {activeAllocations.length > 0 ? (
              <>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {activeAllocations.length} materials ready to pick
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAllAllocations(activeAllocations)}
                    >
                      Select All
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => pickMutation.mutate(
                        selectedAllocations.size > 0
                          ? Array.from(selectedAllocations)
                          : undefined
                      )}
                      disabled={pickMutation.isLoading}
                    >
                      {selectedAllocations.size > 0
                        ? `Pick Selected (${selectedAllocations.size})`
                        : "Pick All"}
                    </Button>
                  </div>
                </div>
                <AllocationTable
                  allocations={activeAllocations}
                  selectedIds={selectedAllocations}
                  onToggleSelect={toggleAllocationSelection}
                  showCheckbox
                />
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No materials to pick</p>
                <p className="text-sm">Materials need to be allocated first</p>
              </div>
            )}
          </TabsContent>

          {/* ISSUE Tab */}
          <TabsContent value="issue" className="space-y-4">
            {pickedAllocations.length > 0 ? (
              <>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {pickedAllocations.length} materials ready to issue
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAllAllocations(pickedAllocations)}
                    >
                      Select All
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => issueMutation.mutate(
                        selectedAllocations.size > 0
                          ? Array.from(selectedAllocations)
                          : undefined
                      )}
                      disabled={issueMutation.isLoading}
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      {selectedAllocations.size > 0
                        ? `Issue Selected (${selectedAllocations.size})`
                        : "Issue All"}
                    </Button>
                  </div>
                </div>
                <AllocationTable
                  allocations={pickedAllocations}
                  selectedIds={selectedAllocations}
                  onToggleSelect={toggleAllocationSelection}
                  showCheckbox
                />
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No materials to issue</p>
                <p className="text-sm">Pick materials first before issuing to production</p>
              </div>
            )}
          </TabsContent>

          {/* RETURN Tab */}
          <TabsContent value="return" className="space-y-4">
            {issuedMaterials && issuedMaterials.length > 0 ? (
              <>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {issuedMaterials.length} materials issued to production
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => autoConsumeTHMutation.mutate(undefined)}
                      disabled={autoConsumeTHMutation.isLoading}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Auto-Consume TH
                    </Button>
                    {Object.keys(returnForms).length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm">
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Process Returns ({Object.keys(returnForms).length})
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Material Returns</AlertDialogTitle>
                            <AlertDialogDescription>
                              Process returns for {Object.keys(returnForms).length} materials?
                              This will record consumption, waste, and return quantities.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleSubmitReturns}>
                              Process Returns
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Issued</TableHead>
                      <TableHead className="text-right">Expected Return</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Return Entry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issuedMaterials.map((material) => {
                      const form = returnForms[material.allocation_id]
                      const hasForm = !!form
                      const variance = hasForm
                        ? material.issued_quantity - form.consumed_quantity - form.counted_quantity + form.consumed_quantity - form.waste_quantity
                        : 0

                      return (
                        <TableRow key={material.allocation_id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{material.material.internal_part_number}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {material.material.description || "-"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {material.issued_quantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {material.expected_return_quantity.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {material.resource_type && (
                              <Badge variant="outline">{material.resource_type}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {hasForm ? (
                              <div className="flex items-center gap-2">
                                <div className="grid grid-cols-3 gap-1">
                                  <div>
                                    <label className="text-xs text-muted-foreground">Counted</label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={form.counted_quantity}
                                      onChange={(e) => updateReturnForm(
                                        material.allocation_id,
                                        "counted_quantity",
                                        parseFloat(e.target.value) || 0
                                      )}
                                      className="h-8 w-20"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Consumed</label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={form.consumed_quantity}
                                      onChange={(e) => updateReturnForm(
                                        material.allocation_id,
                                        "consumed_quantity",
                                        parseFloat(e.target.value) || 0
                                      )}
                                      className="h-8 w-20"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Waste</label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={form.waste_quantity}
                                      onChange={(e) => updateReturnForm(
                                        material.allocation_id,
                                        "waste_quantity",
                                        parseFloat(e.target.value) || 0
                                      )}
                                      className="h-8 w-20"
                                    />
                                  </div>
                                </div>
                                <Select
                                  value={form.action}
                                  onValueChange={(v) => updateReturnForm(
                                    material.allocation_id,
                                    "action",
                                    v as "RETURN" | "FLOOR_STOCK"
                                  )}
                                >
                                  <SelectTrigger className="w-28 h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="RETURN">Return</SelectItem>
                                    <SelectItem value="FLOOR_STOCK">Floor Stock</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newForms = { ...returnForms }
                                    delete newForms[material.allocation_id]
                                    setReturnForms(newForms)
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => initReturnForm(material)}
                              >
                                Enter Return
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No materials issued to production</p>
                <p className="text-sm">Issue materials before processing returns</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// Helper component for allocation tables
function AllocationTable({
  allocations,
  selectedIds,
  onToggleSelect,
  showCheckbox = false,
}: {
  allocations: InventoryAllocation[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  showCheckbox?: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showCheckbox && <TableHead className="w-[50px]"></TableHead>}
          <TableHead>Material</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allocations.map((allocation) => (
          <TableRow key={allocation.id}>
            {showCheckbox && (
              <TableCell>
                <input
                  type="checkbox"
                  checked={selectedIds.has(allocation.id)}
                  onChange={() => onToggleSelect(allocation.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </TableCell>
            )}
            <TableCell>
              <div>
                <p className="font-medium">{allocation.material?.internal_part_number}</p>
                <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {allocation.material?.description || "-"}
                </p>
              </div>
            </TableCell>
            <TableCell className="text-right font-mono">
              {allocation.quantity.toLocaleString()}
            </TableCell>
            <TableCell>
              <Badge className={allocationStatusColors[allocation.status]}>
                {allocation.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
