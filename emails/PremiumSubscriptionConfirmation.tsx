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

interface PremiumSubscriptionConfirmationEmailProps {
  userName: string
  subscriptionDate: string
  billingPeriod: 'monthly' | 'annual'
  amount: string
  profileUrl: string
}

export default function PremiumSubscriptionConfirmationEmail({
  userName = 'there',
  subscriptionDate = new Date().toLocaleDateString(),
  billingPeriod = 'monthly',
  amount = '$19.99',
  profileUrl = 'https://polycopy.app/profile',
}: PremiumSubscriptionConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Polycopy Premium! 🎉</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome to Polycopy Premium! 🎉</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            Thank you for upgrading to Polycopy Premium! Your subscription is now active and you have full access to all premium features.
          </Text>

          <Section style={highlightBox}>
            <Text style={highlightText}>
              <strong>Subscription Details</strong>
            </Text>
            <Text style={detailText}>
              <strong>Plan:</strong> Polycopy Premium ({billingPeriod === 'monthly' ? 'Monthly' : 'Annual'})
            </Text>
            <Text style={detailText}>
              <strong>Amount:</strong> {amount}/{billingPeriod === 'monthly' ? 'month' : 'year'}
            </Text>
            <Text style={detailText}>
              <strong>Activated:</strong> {subscriptionDate}
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>What's Included in Premium:</Heading>
          
          <ul style={list}>
            <li style={listItem}>
              <strong>Real Copy Trading:</strong> Automatically execute trades on Polymarket when your favorite traders place orders
            </li>
            <li style={listItem}>
              <strong>Auto-Close Positions:</strong> Automatically close your copied positions when the original trader closes theirs
            </li>
            <li style={listItem}>
              <strong>Advanced Trading Tools:</strong> Access to sophisticated order management and position tracking
            </li>
            <li style={listItem}>
              <strong>Priority Support:</strong> Get faster responses from our team
            </li>
          </ul>

          <Hr style={hr} />

          <Text style={text}>
            Ready to get started? Connect your Polymarket wallet to begin copying trades automatically.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={profileUrl}>
              Go to My Profile
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footerText}>
            You can manage your subscription or update your payment method anytime from your{' '}
            <Link href={profileUrl} style={link}>
              profile settings
            </Link>.
          </Text>

          <Text style={footerText}>
            Need help? Reply to this email or DM us on{' '}
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
  backgroundColor: '#fef3c7',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '20px',
  border: '1px solid #fde68a',
}

const highlightText = {
  color: '#78350f',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 12px 0',
}

const detailText = {
  color: '#78350f',
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
  backgroundColor: '#FDB022',
  borderRadius: '8px',
  color: '#1e293b',
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
