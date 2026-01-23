"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Construction } from "lucide-react"

interface PagePlaceholderProps {
  title: string
  description: string
  features?: string[]
}

export function PagePlaceholder({ title, description, features }: PagePlaceholderProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5" />
            Coming Soon
          </CardTitle>
          <CardDescription>
            This page is under development
          </CardDescription>
        </CardHeader>
        {features && features.length > 0 && (
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">Planned features:</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              {features.map((feature, i) => (
                <li key={i}>{feature}</li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
