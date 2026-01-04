// Send WhatsApp messages via Twilio
import { twilioClient, config } from './client'

export interface SendWhatsAppParams {
  to: string // Phone number in E.164 format (+12025551234)
  message: string
}

export async function sendWhatsApp({ to, message }: SendWhatsAppParams): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!twilioClient || !config.whatsappNumber) {
    console.error('❌ Twilio WhatsApp not configured')
    return { success: false, error: 'WhatsApp service not configured' }
  }

  try {
    // WhatsApp numbers need "whatsapp:" prefix
    const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
    
    console.log(`💬 Sending WhatsApp to ${whatsappTo}`)
    
    const result = await twilioClient.messages.create({
      body: message,
      from: config.whatsappNumber,
      to: whatsappTo,
    })

    console.log(`✅ WhatsApp sent successfully. Message SID: ${result.sid}`)
    
    return {
      success: true,
      messageId: result.sid,
    }
  } catch (error: any) {
    console.error('❌ Error sending WhatsApp:', error.message)
    return {
      success: false,
      error: error.message || 'Failed to send WhatsApp',
    }
  }
}

