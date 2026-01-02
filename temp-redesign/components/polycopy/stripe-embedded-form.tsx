"use client"

import { useState, useEffect } from "react"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { getStripe } from "../../lib/stripe/config"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle } from "lucide-react"

interface StripePaymentFormProps {
  onSuccess: () => void
  onError: (error: string) => void
}

function PaymentForm({ onSuccess, onError }: StripePaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setProcessing(true)
    setError(null)

    try {
      // Submit the form data to Stripe
      const { error: submitError } = await elements.submit()
      if (submitError) {
        throw new Error(submitError.message)
      }

      // Confirm the payment
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/profile?upgrade=success`,
        },
        redirect: 'if_required', // Only redirect if required (e.g., 3D Secure)
      })

      if (confirmError) {
        throw new Error(confirmError.message)
      }

      // Payment successful!
      console.log('✅ Payment confirmed')
      onSuccess()

    } catch (err: any) {
      console.error('❌ Payment error:', err)
      setError(err.message || 'Payment failed. Please try again.')
      onError(err.message || 'Payment failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Payment Element - Stripe's all-in-one payment input */}
      <div className="bg-white rounded-lg">
        <PaymentElement 
          options={{
            layout: {
              type: 'tabs',
              defaultCollapsed: false,
            },
            terms: {
              card: 'auto',
            },
          }}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={!stripe || processing}
        className="w-full h-12 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold"
      >
        {processing ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          'Subscribe to Premium'
        )}
      </Button>

      <p className="text-xs text-center text-slate-500">
        🔒 Your payment information is secure and encrypted
      </p>
    </form>
  )
}

interface StripeEmbeddedFormProps {
  onSuccess: () => void
  onError: (error: string) => void
}

export function StripeEmbeddedForm({ onSuccess, onError }: StripeEmbeddedFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Create payment intent when component mounts
    const createPaymentIntent = async () => {
      try {
        const response = await fetch('/api/stripe/create-payment-intent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create payment intent')
        }

        setClientSecret(data.clientSecret)
      } catch (err: any) {
        console.error('❌ Failed to create payment intent:', err)
        setError(err.message)
        onError(err.message)
      } finally {
        setLoading(false)
      }
    }

    createPaymentIntent()
  }, [onError])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600">Setting up payment...</p>
        </div>
      </div>
    )
  }

  if (error || !clientSecret) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error || 'Failed to load payment form. Please try again.'}
        </AlertDescription>
      </Alert>
    )
  }

  const stripePromise = getStripe()

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#FDB022', // Polycopy yellow
            colorBackground: '#ffffff',
            colorText: '#111827',
            colorDanger: '#ef4444',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            borderRadius: '8px',
          },
        },
      }}
    >
      <PaymentForm onSuccess={onSuccess} onError={onError} />
    </Elements>
  )
}

