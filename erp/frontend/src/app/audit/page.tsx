"use client"

import { useApi } from "@/hooks/use-api"
import { type AuditEvent } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Plus,
  Trash,
  Edit,
  Eye,
  Activity,
  User,
  Calendar,
  Search,
  FileText,
  RefreshCw,
} from "lucide-react"
import { useState } from "react"
import { format } from "date-fns"

// Event type config
const eventTypeConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  CREATE: { label: "Create", variant: "default", icon: <Plus className="h-3 w-3" /> },
  UPDATE: { label: "Update", variant: "outline", icon: <Edit className="h-3 w-3" /> },
  DELETE: { label: "Delete", variant: "destructive", icon: <Trash className="h-3 w-3" /> },
  STATUS_CHANGE: { label: "Status", variant: "secondary", icon: <RefreshCw className="h-3 w-3" /> },
}

const getEventConfig = (eventType: string) => {
  return eventTypeConfig[eventType] || { label: eventType, variant: "outline" as const, icon: <Activity className="h-3 w-3" /> }
}

// Format entity type for display
const formatEntityType = (type: string) => {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

// JSON Diff Viewer Dialog
function EventDetailDialog({
  event,
  trigger,
}: {
  event: AuditEvent
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Event Details
            <Badge variant={getEventConfig(event.event_type).variant}>
              {getEventConfig(event.event_type).icon}
              <span className="ml-1">{getEventConfig(event.event_type).label}</span>
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {formatEntityType(event.entity_type)} - {event.entity_id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Event Type:</span>
              <p className="font-medium">{event.event_type}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Entity Type:</span>
              <p className="font-medium">{formatEntityType(event.entity_type)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Entity ID:</span>
              <p className="font-mono text-xs">{event.entity_id}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Actor:</span>
              <p className="font-medium">{event.actor || "System"}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Timestamp:</span>
              <p className="font-medium">{format(new Date(event.created_at), "PPpp")}</p>
            </div>
          </div>

          {event.old_value && (
            <div>
              <Label className="text-sm font-medium">Previous Value</Label>
              <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                {JSON.stringify(event.old_value, null, 2)}
              </pre>
            </div>
          )}

          {event.new_value && (
            <div>
              <Label className="text-sm font-medium">New Value</Label>
              <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                {JSON.stringify(event.new_value, null, 2)}
              </pre>
            </div>
          )}

          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <Label className="text-sm font-medium">Metadata</Label>
              <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function AuditPage() {
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all")
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all")
  const [actorFilter, setActorFilter] = useState<string>("")
  const [limit, setLimit] = useState<number>(50)

  // Build query string
  const queryParams = new URLSearchParams()
  if (entityTypeFilter !== "all") queryParams.set("entity_type", entityTypeFilter)
  if (eventTypeFilter !== "all") queryParams.set("event_type", eventTypeFilter)
  if (actorFilter) queryParams.set("actor", actorFilter)
  queryParams.set("limit", limit.toString())

  const queryString = queryParams.toString()
  const endpoint = queryString ? `/audit/query?${queryString}` : `/audit?limit=${limit}`

  const { data: events, isLoading, refetch } = useApi<AuditEvent[]>(endpoint)
  const { data: stats } = useApi<Record<string, number>>("/audit/stats/by-type")

  // Get unique entity types and actors from events for filter options
  const entityTypes = [...new Set(events?.map((e) => e.entity_type) || [])]
  const actors = [...new Set(events?.map((e) => e.actor).filter(Boolean) || [])]

  // Calculate summary stats
  const totalEvents = events?.length || 0
  const createCount = stats?.CREATE || 0
  const updateCount = stats?.UPDATE || 0
  const deleteCount = stats?.DELETE || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground">
            View system activity and change history
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEvents}</div>
            <p className="text-xs text-muted-foreground">in current view</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Creates</CardTitle>
            <Plus className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{createCount}</div>
            <p className="text-xs text-muted-foreground">total create events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Updates</CardTitle>
            <Edit className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{updateCount}</div>
            <p className="text-xs text-muted-foreground">total update events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deletes</CardTitle>
            <Trash className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{deleteCount}</div>
            <p className="text-xs text-muted-foreground">total delete events</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Entity Type</Label>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {entityTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatEntityType(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="text-sm font-medium">Event Type</Label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="STATUS_CHANGE">Status Change</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="text-sm font-medium">Actor</Label>
              <Select value={actorFilter || "all"} onValueChange={(v) => setActorFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All actors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actors</SelectItem>
                  {actors.map((actor) => (
                    <SelectItem key={actor} value={actor!}>
                      {actor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="text-sm font-medium">Limit</Label>
              <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setEntityTypeFilter("all")
                setEventTypeFilter("all")
                setActorFilter("")
                setLimit(50)
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Audit Events
          </CardTitle>
          <CardDescription>Recent system activity and changes</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(event.created_at), "MMM d, HH:mm")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getEventConfig(event.event_type).variant}>
                        {getEventConfig(event.event_type).icon}
                        <span className="ml-1">{getEventConfig(event.event_type).label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatEntityType(event.entity_type)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {event.entity_id.substring(0, 8)}...
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {event.actor || "System"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EventDetailDialog
                        event={event}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Eye className="h-4 w-4" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No audit events found matching your filters.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
