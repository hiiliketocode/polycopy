import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface SubscriptionEndedEmailProps {
  userName: string
  endDate: string
  reactivateUrl: string
}

export default function SubscriptionEndedEmail({
  userName = 'there',
  endDate = 'January 31, 2026',
  reactivateUrl = 'https://polycopy.app/profile',
}: SubscriptionEndedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Polycopy Premium subscription has ended</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>Premium Subscription Ended</Text>
          
          <Text style={paragraph}>
            Hi {userName},
          </Text>
          
          <Text style={paragraph}>
            Your Polycopy Premium subscription ended on <strong>{endDate}</strong>.
          </Text>

          <Text style={paragraph}>
            You now have access to the free version of Polycopy with these limitations:
          </Text>

          <ul style={list}>
            <li style={listItem}>✓ Manual Copy trading (requires manual execution)</li>
            <li style={listItem}>✗ Real Copy trading (automatic execution)</li>
            <li style={listItem}>✗ WhatsApp notifications</li>
            <li style={listItem}>✗ Advanced analytics and insights</li>
            <li style={listItem}>✗ Priority support</li>
          </ul>

          <Section style={buttonContainer}>
            <Button style={button} href={reactivateUrl}>
              Reactivate Premium
            </Button>
          </Section>

          <Text style={paragraph}>
            Miss the premium features? You can reactivate your subscription anytime with just one click.
          </Text>

          <Hr style={hr} />
          
          <Text style={footer}>
            Questions? Reply to this email or visit our help center.
          </Text>
          
          <Text style={footer}>
            <a href={reactivateUrl} style={link}>
              Polycopy
            </a>
            {' · '}
            Smart Trading, Simplified
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const heading = {
  fontSize: '32px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: '#484848',
  padding: '17px 24px 0',
}

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#484848',
  padding: '0 24px',
}

const list = {
  fontSize: '16px',
  lineHeight: '1.8',
  color: '#484848',
  padding: '0 24px',
  margin: '16px 0',
}

const listItem = {
  marginBottom: '8px',
}

const buttonContainer = {
  padding: '27px 24px 27px',
}

const button = {
  backgroundColor: '#f59e0b',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  padding: '12px',
}

const hr = {
  borderColor: '#dfe1e4',
  margin: '42px 24px',
}

const footer = {
  color: '#9ca299',
  fontSize: '14px',
  lineHeight: '24px',
  padding: '0 24px',
}

const link = {
  color: '#f59e0b',
  textDecoration: 'underline',
}

