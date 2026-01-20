import { Resend } from 'resend'

// Initialize Resend client
// Add RESEND_API_KEY to your .env.local file
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export { resend }

// Email sending configuration
export const EMAIL_FROM = 'Polycopy <notifications@polycopy.app>'

// Helper to send emails
export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string | string[]
  subject: string
  react: React.ReactElement
}) {
  if (!resend) {
    console.error('Resend not initialized - missing RESEND_API_KEY')
    return { success: false, error: 'Email service not configured' }
  }
  
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      react,
    })

    if (error) {
      console.error('Failed to send email:', error)
      return { success: false, error }
    }

    console.log('Email sent successfully:', data?.id)
    return { success: true, data }
  } catch (error) {
    console.error('Error sending email:', error)
    return { success: false, error }
  }
}

