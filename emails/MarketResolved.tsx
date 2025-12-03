import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface MarketResolvedEmailProps {
  userName: string
  marketTitle: string
  resolvedOutcome: string
  userPosition: string
  userEntryPrice: number
  userROI: number
  traderROI: number
  didUserWin: boolean
  tradeUrl: string
  unsubscribeUrl: string
}

export default function MarketResolvedEmail({
  userName,
  marketTitle,
  resolvedOutcome,
  userPosition,
  userEntryPrice,
  userROI,
  traderROI,
  didUserWin,
  tradeUrl,
  unsubscribeUrl,
}: MarketResolvedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>✅ Market Resolved: "{marketTitle}"</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Market Resolved</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            A market you copied has resolved:
          </Text>
          
          <Section style={infoBox}>
            <Text style={infoLabel}>Market:</Text>
            <Text style={infoValue}>{marketTitle}</Text>
            
            <Text style={infoLabel}>Resolved Outcome:</Text>
            <Text style={infoValue}>{resolvedOutcome}</Text>
            
            <Text style={infoLabel}>Your Position:</Text>
            <Text style={infoValue}>{userPosition}</Text>
            
            <Text style={infoLabel}>Entry Price:</Text>
            <Text style={infoValue}>${userEntryPrice.toFixed(2)}</Text>
            
            <Text style={infoLabel}>Final Result:</Text>
            <Text style={{ ...resultValue, color: didUserWin ? '#10b981' : '#ef4444' }}>
              {didUserWin ? '✅ Win' : '❌ Loss'}
            </Text>
            
            <Text style={infoLabel}>Your ROI:</Text>
            <Text style={{ ...infoValue, color: userROI >= 0 ? '#10b981' : '#ef4444' }}>
              {userROI >= 0 ? '+' : ''}{userROI.toFixed(2)}%
            </Text>
            
            <Text style={infoLabel}>Trader's ROI:</Text>
            <Text style={{ ...infoValue, color: traderROI >= 0 ? '#10b981' : '#ef4444' }}>
              {traderROI >= 0 ? '+' : ''}{traderROI.toFixed(2)}%
            </Text>
          </Section>
          
          <Section style={buttonContainer}>
            <Link href={tradeUrl} style={button}>View Trade History</Link>
          </Section>
          
          <Text style={footer}>
            <Link href={unsubscribeUrl} style={unsubscribeLink}>Unsubscribe from notifications</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '560px',
}

const h1 = {
  color: '#000',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: '40px 0 20px',
}

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
}

const infoBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
}

const infoLabel = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '8px 0 4px',
}

const infoValue = {
  color: '#000',
  fontSize: '16px',
  fontWeight: '600' as const,
  margin: '0 0 16px',
}

const resultValue = {
  color: '#000',
  fontSize: '18px',
  fontWeight: '600' as const,
  margin: '0 0 16px',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#FDB022',
  borderRadius: '8px',
  color: '#000',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
}

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  marginTop: '48px',
  textAlign: 'center' as const,
}

const unsubscribeLink = {
  color: '#8898aa',
  textDecoration: 'underline',
}

