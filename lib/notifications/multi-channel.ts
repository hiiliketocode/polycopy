// Multi-channel notification service
// Sends notifications via Email, SMS, and WhatsApp based on user preferences

import { sendSMS } from '../twilio/send-sms'
import { sendWhatsApp } from '../twilio/send-whatsapp'

export interface NotificationChannel {
  email?: boolean
  sms?: boolean
  whatsapp?: boolean
}

export interface NotificationContent {
  subject: string
  message: string // Plain text version for SMS/WhatsApp
  emailComponent?: any // React email component
}

export interface UserContactInfo {
  email: string
  phoneNumber?: string | null
  isPremium: boolean
  preferences: NotificationChannel
}

export interface SendNotificationResult {
  email: { sent: boolean; error?: string }
  sms: { sent: boolean; error?: string }
  whatsapp: { sent: boolean; error?: string }
}

export async function sendMultiChannelNotification(
  user: UserContactInfo,
  content: NotificationContent,
  sendEmailFn: () => Promise<void>
): Promise<SendNotificationResult> {
  const result: SendNotificationResult = {
    email: { sent: false },
    sms: { sent: false },
    whatsapp: { sent: false },
  }

  // Send Email (always available)
  if (user.preferences.email !== false) {
    try {
      await sendEmailFn()
      result.email.sent = true
      console.log(`✅ Email sent to ${user.email}`)
    } catch (error: any) {
      result.email.error = error.message
      console.error(`❌ Email failed:`, error.message)
    }
  }

  // SMS/WhatsApp only for premium users
  if (!user.isPremium) {
    return result
  }

  if (!user.phoneNumber || !user.phoneNumber.trim()) {
    console.log('ℹ️ No phone number configured, skipping SMS/WhatsApp')
    return result
  }

  // Send SMS
  if (user.preferences.sms) {
    const smsResult = await sendSMS({
      to: user.phoneNumber,
      message: content.message,
    })
    result.sms = smsResult
    
    if (smsResult.success) {
      console.log(`✅ SMS sent to ${user.phoneNumber}`)
    } else {
      console.error(`❌ SMS failed:`, smsResult.error)
    }
  }

  // Send WhatsApp
  if (user.preferences.whatsapp) {
    const whatsappResult = await sendWhatsApp({
      to: user.phoneNumber,
      message: content.message,
    })
    result.whatsapp = whatsappResult
    
    if (whatsappResult.success) {
      console.log(`✅ WhatsApp sent to ${user.phoneNumber}`)
    } else {
      console.error(`❌ WhatsApp failed:`, whatsappResult.error)
    }
  }

  return result
}

// Helper to format phone number for display
export function formatPhoneForDisplay(phone: string): string {
  // Remove country code for display
  const cleaned = phone.replace(/^\+1/, '').replace(/\D/g, '')
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  
  return phone
}

