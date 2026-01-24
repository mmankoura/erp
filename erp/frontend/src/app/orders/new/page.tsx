"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Customer, type Product, type Order, type OrderType } from "@/lib/api"
import { Button } from "@/components/ui/button"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ArrowLeft, Save } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface OrderFormData {
  customer_id: string
  product_id: string
  quantity: number
  due_date: string
  order_type: OrderType
  po_number: string
  wo_number: string
  notes: string
}

const defaultFormData: OrderFormData = {
  customer_id: "",
  product_id: "",
  quantity: 1,
  due_date: new Date().toISOString().split("T")[0],
  order_type: "TURNKEY",
  po_number: "",
  wo_number: "",
  notes: "",
}

export default function NewOrderPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<OrderFormData>(defaultFormData)

  const { data: customers, isLoading: loadingCustomers } = useApi<Customer[]>("/customers")
  const { data: products, isLoading: loadingProducts } = useApi<Product[]>("/products")

  const createMutation = useMutation(
    (data: OrderFormData) => api.post<Order>("/orders", {
      ...data,
      quantity: Number(data.quantity),
      po_number: data.po_number || undefined,
      wo_number: data.wo_number || undefined,
      notes: data.notes || undefined,
    }),
    {
      onSuccess: (order) => {
        toast.success(`Order ${order.order_number} created successfully`)
        router.push(`/orders/${order.id}`)
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create order")
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.customer_id || !formData.product_id) {
      toast.error("Please select a customer and product")
      return
    }
    createMutation.mutate(formData)
  }

  const selectedProduct = products?.find(p => p.id === formData.product_id)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Order</h1>
          <p className="text-muted-foreground">
            Create a new customer order
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Order Details */}
          <Card>
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
              <CardDescription>
                Select the customer and product for this order
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer *</Label>
                <Select
                  value={formData.customer_id}
                  onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                  disabled={loadingCustomers}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} ({customer.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product">Product *</Label>
                <Select
                  value={formData.product_id}
                  onValueChange={(value) => setFormData({ ...formData, product_id: value })}
                  disabled={loadingProducts}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.part_number} - {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProduct && !selectedProduct.active_bom_revision_id && (
                  <p className="text-sm text-yellow-600">
                    Warning: This product has no active BOM revision
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="due_date">Due Date *</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="order_type">Order Type *</Label>
                <Select
                  value={formData.order_type}
                  onValueChange={(value) => setFormData({ ...formData, order_type: value as OrderType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TURNKEY">
                      Turnkey - We provide all materials
                    </SelectItem>
                    <SelectItem value="CONSIGNMENT">
                      Consignment - Customer provides materials
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
              <CardDescription>
                Optional reference numbers and notes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="po_number">Customer PO Number</Label>
                <Input
                  id="po_number"
                  value={formData.po_number}
                  onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                  placeholder="e.g., PO-12345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wo_number">Work Order Number</Label>
                <Input
                  id="wo_number"
                  value={formData.wo_number}
                  onChange={(e) => setFormData({ ...formData, wo_number: e.target.value })}
                  placeholder="e.g., WO-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any special instructions or notes..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link href="/orders">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createMutation.isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {createMutation.isLoading ? "Creating..." : "Create Order"}
          </Button>
        </div>
      </form>
    </div>
  )
}
