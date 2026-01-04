// Twilio client configuration
// Install: npm install twilio

import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER

if (!accountSid || !authToken) {
  console.warn('⚠️ Twilio credentials not configured. SMS/WhatsApp notifications will be disabled.')
}

export const twilioClient = accountSid && authToken 
  ? twilio(accountSid, authToken)
  : null

export const config = {
  phoneNumber: twilioPhoneNumber || '',
  whatsappNumber: twilioWhatsAppNumber || 'whatsapp:+14155238886', // Twilio sandbox default
  isConfigured: !!(accountSid && authToken && twilioPhoneNumber),
}

export function isTwilioConfigured(): boolean {
  return config.isConfigured
}

