"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useApi } from "@/hooks/use-api"
import { type PurchaseOrder } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { PurchaseOrderDetailDialog } from "../page"

export default function PoDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { data: po, isLoading, refetch } = useApi<PurchaseOrder>(`/purchase-orders/${id}`)

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>
  }
  if (!po) {
    return (
      <div className="space-y-3">
        <Link href="/purchase-orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to POs
          </Button>
        </Link>
        <p className="text-muted-foreground">Purchase order not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link href="/purchase-orders">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to POs
        </Button>
      </Link>
      <PurchaseOrderDetailDialog
        purchaseOrder={po}
        onSuccess={refetch}
        embedded
      />
    </div>
  )
}
