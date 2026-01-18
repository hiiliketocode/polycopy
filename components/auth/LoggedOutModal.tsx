"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { LOGGED_OUT_EVENT, type LoggedOutReason } from "@/lib/auth/logout-events"

type LoggedOutDetail = {
  reason?: LoggedOutReason
}

const reasonCopy: Record<LoggedOutReason, { title: string; description: string }> = {
  signed_out: {
    title: "You have been logged out",
    description: "Your session ended. Please log back in to continue.",
  },
  session_missing: {
    title: "You have been logged out",
    description: "We couldn't verify your session. Please log back in.",
  },
  auth_error: {
    title: "You have been logged out",
    description: "We hit a login issue. Please log back in to continue.",
  },
  unauthorized: {
    title: "You have been logged out",
    description: "Your session expired. Please log back in.",
  },
}

export function LoggedOutModal() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<LoggedOutReason>("signed_out")

  const copy = useMemo(() => reasonCopy[reason], [reason])

  useEffect(() => {
    const handleEvent = (event: Event) => {
      const detail = (event as CustomEvent<LoggedOutDetail>).detail
      setReason(detail?.reason ?? "signed_out")
      setOpen(true)
    }

    window.addEventListener(LOGGED_OUT_EVENT, handleEvent)
    return () => window.removeEventListener(LOGGED_OUT_EVENT, handleEvent)
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setReason("signed_out")
        setOpen(true)
      }
      if (event === "SIGNED_IN") {
        setOpen(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogin = () => {
    if (pathname !== "/login") {
      router.push("/login")
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-slate-900">{copy.title}</DialogTitle>
          <DialogDescription className="text-slate-600">{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button onClick={handleLogin}>Log back in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
