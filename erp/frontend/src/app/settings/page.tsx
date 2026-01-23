"use client"

import { PagePlaceholder } from "@/components/page-placeholder"

export default function SettingsPage() {
  return (
    <PagePlaceholder
      title="Settings"
      description="System configuration and preferences"
      features={[
        "User preferences",
        "System configuration",
        "API settings",
        "Theme customization",
      ]}
    />
  )
}
