// Send SMS via Twilio
import { twilioClient, config } from './client'

export interface SendSMSParams {
  to: string // Phone number in E.164 format (+12025551234)
  message: string
}

export async function sendSMS({ to, message }: SendSMSParams): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!twilioClient || !config.phoneNumber) {
    console.error('❌ Twilio not configured')
    return { success: false, error: 'SMS service not configured' }
  }

  try {
    console.log(`📱 Sending SMS to ${to}`)
    
    const result = await twilioClient.messages.create({
      body: message,
      from: config.phoneNumber,
      to: to,
    })

    console.log(`✅ SMS sent successfully. Message SID: ${result.sid}`)
    
    return {
      success: true,
      messageId: result.sid,
    }
  } catch (error: any) {
    console.error('❌ Error sending SMS:', error.message)
    return {
      success: false,
      error: error.message || 'Failed to send SMS',
    }
  }
}

export async function sendVerificationCode(to: string, code: string): Promise<{ success: boolean; error?: string }> {
  const message = `Your Polycopy verification code is: ${code}. This code expires in 10 minutes.`
  
  return sendSMS({ to, message })
}

