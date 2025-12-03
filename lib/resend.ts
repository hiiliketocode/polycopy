import { Resend } from 'resend'

// Initialize Resend client
// Add RESEND_API_KEY to your .env.local file
const resend = new Resend(process.env.RESEND_API_KEY)

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

