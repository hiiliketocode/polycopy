import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface SubscriptionCancellationConfirmationEmailProps {
  userName: string
  cancellationDate: string
  accessUntil: string
  profileUrl: string
}

export default function SubscriptionCancellationConfirmationEmail({
  userName = 'there',
  cancellationDate = new Date().toLocaleDateString(),
  accessUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
  profileUrl = 'https://polycopy.app/portfolio',
}: SubscriptionCancellationConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Polycopy Premium subscription has been canceled</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Subscription Canceled</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            We've received your request to cancel your Polycopy Premium subscription. Your cancellation has been processed successfully.
          </Text>

          <Section style={highlightBox}>
            <Text style={highlightText}>
              <strong>What Happens Next</strong>
            </Text>
            <Text style={detailText}>
              <strong>Canceled on:</strong> {cancellationDate}
            </Text>
            <Text style={detailText}>
              <strong>Premium access until:</strong> {accessUntil}
            </Text>
            <Text style={detailText}>
              You'll continue to have access to all Premium features until the end of your current billing period.
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>After {accessUntil}:</Heading>
          
          <ul style={list}>
            <li style={listItem}>
              Your subscription will not renew and you won't be charged again
            </li>
            <li style={listItem}>
              Your connected Polymarket wallet will be automatically disconnected for security
            </li>
            <li style={listItem}>
              You'll lose access to Real Copy Trading and premium features
            </li>
            <li style={listItem}>
              Your manual trade history will be preserved
            </li>
            <li style={listItem}>
              You can resubscribe anytime to regain Premium access
            </li>
          </ul>

          <Hr style={hr} />

          <Text style={text}>
            We're sorry to see you go! If you have a moment, we'd love to hear your feedback about why you decided to cancel.
          </Text>

          <Text style={text}>
            <strong>Changed your mind?</strong> You can reactivate your subscription anytime from your portfolio settings before {accessUntil}.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={profileUrl}>
              Go to My Portfolio
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footerText}>
            If you have any questions or concerns, please don't hesitate to reach out. Reply to this email or DM us on{' '}
            <Link href="https://twitter.com/polycopyapp" style={link}>
              @polycopyapp
            </Link>.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            © 2025 Polycopy. All rights reserved.
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

const h1 = {
  color: '#1e293b',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 40px',
}

const h2 = {
  color: '#1e293b',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '20px 0',
  padding: '0 40px',
}

const text = {
  color: '#334155',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '16px 0',
  padding: '0 40px',
}

const highlightBox = {
  backgroundColor: '#fee2e2',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '20px',
  border: '1px solid #fecaca',
}

const highlightText = {
  color: '#991b1b',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 12px 0',
}

const detailText = {
  color: '#991b1b',
  fontSize: '14px',
  margin: '8px 0',
}

const list = {
  padding: '0 40px',
  margin: '16px 0',
}

const listItem = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '24px',
  marginBottom: '12px',
}

const hr = {
  borderColor: '#e2e8f0',
  margin: '20px 40px',
}

const buttonContainer = {
  padding: '27px 40px',
}

const button = {
  backgroundColor: '#64748b',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '14px 20px',
}

const link = {
  color: '#FDB022',
  textDecoration: 'underline',
}

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '12px 0',
  padding: '0 40px',
}

const footer = {
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '24px 0',
  padding: '0 40px',
  textAlign: 'center' as const,
}
