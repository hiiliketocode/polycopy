"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail } from "lucide-react"

type SignInModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  message?: string
}

export function SignInModal({ open, onOpenChange, message }: SignInModalProps) {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleSendMagicLink = async () => {
    setIsLoading(true)
    // Mock sending magic link
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setEmailSent(true)
    setIsLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Sign in to Polycopy</DialogTitle>
          <DialogDescription>{message || "Sign in to follow traders and copy trades"}</DialogDescription>
        </DialogHeader>

        {!emailSent ? (
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <Button
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-600 hover:to-orange-600"
              onClick={handleSendMagicLink}
              disabled={!email || isLoading}
            >
              {isLoading ? (
                "Sending..."
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send magic link
                </>
              )}
            </Button>

            <p className="text-xs text-center text-slate-500">We'll send you a link to sign in without a password</p>
          </div>
        ) : (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <Mail className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">Check your email</h3>
              <p className="text-sm text-slate-600">
                We sent a magic link to <strong>{email}</strong>
              </p>
              <p className="text-sm text-slate-600 mt-2">Click the link in the email to sign in.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setEmailSent(false)
                setEmail("")
              }}
            >
              Use different email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
