import { Toaster } from "@/components/ui/sonner"

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Login page has its own minimal layout without the sidebar
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
