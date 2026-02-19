import React from 'react'
import { Section, Text, Link, Img } from '@react-email/components'
import { COLORS, FONTS } from './_styles'
import { EmailLayout, EmailBanner, EmailButton, EmailSection } from './_layout'

interface WelcomeEmailProps {
  userName: string
  profileUrl: string
}

const ICON_BASE = 'https://polycopy.app/logos'

export default function WelcomeEmail({
  userName = 'John',
  profileUrl = 'https://polycopy.app/v2/portfolio',
}: WelcomeEmailProps) {
  return (
    <EmailLayout previewText="Welcome to Polycopy!">
      <EmailBanner
        title="WELCOME TO POLYCOPY"
        subtitle="The home of copy trading on Polymarket"
      />

      <EmailSection>
        <Text style={{ fontSize: '16px', lineHeight: '26px', margin: '0 0 32px 0', color: '#333333' }}>
          Thanks for joining Polycopy{userName ? `, ${userName}` : ''}. The ultimate command center for
          Polymarket copy trading. Automate your alpha, mirror your favorite traders, and copy proprietary
          algorithms in two clicks.
        </Text>

        <EmailButton href="https://polycopy.app/v2/login" text="ACCESS YOUR DASHBOARD" />

        {/* GET STARTED IN 3 SIMPLE STEPS */}
        <Text
          style={{
            fontFamily: FONTS.header,
            fontSize: '14px',
            fontWeight: '900',
            textAlign: 'center' as const,
            letterSpacing: '3px',
            margin: '64px 0 32px 0',
            textTransform: 'uppercase' as const,
            color: COLORS.black,
          }}
        >
          GET STARTED IN 3 SIMPLE STEPS
        </Text>

        <table width="100%" border={0} cellPadding="0" cellSpacing="0">
          <tbody>
            <tr>
              {/* Step 1: CONNECT */}
              <td style={{ width: '33.33%', textAlign: 'center' as const, padding: '0 8px', verticalAlign: 'top' }}>
                <table border={0} cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
                  <tbody>
                    <tr>
                      <td align="right" style={{ paddingBottom: '4px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '900', fontFamily: FONTS.mono, color: COLORS.white, backgroundColor: COLORS.yellow, display: 'inline-block', padding: '2px 6px', letterSpacing: '0.5px' }}>#1</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <div style={{ border: `1px solid ${COLORS.border}`, width: '64px', height: '64px', textAlign: 'center' as const }}>
                          <Img src={`${ICON_BASE}/icon_expert_network.svg`} width="40" height="40" alt="Connect" style={{ margin: '12px auto' }} />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <Text style={{ fontFamily: FONTS.header, fontSize: '13px', fontWeight: '900', letterSpacing: '1px', margin: '12px 0 8px 0', textTransform: 'uppercase' as const }}>CONNECT</Text>
                <Text style={{ fontSize: '12px', color: COLORS.secondary, lineHeight: '18px', margin: '0' }}>Link your Polymarket account securely.</Text>
              </td>

              {/* Step 2: FIND */}
              <td style={{ width: '33.33%', textAlign: 'center' as const, padding: '0 8px', verticalAlign: 'top' }}>
                <table border={0} cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
                  <tbody>
                    <tr>
                      <td align="right" style={{ paddingBottom: '4px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '900', fontFamily: FONTS.mono, color: COLORS.white, backgroundColor: COLORS.yellow, display: 'inline-block', padding: '2px 6px', letterSpacing: '0.5px' }}>#2</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <div style={{ border: `1px solid ${COLORS.border}`, width: '64px', height: '64px', textAlign: 'center' as const }}>
                          <Img src={`${ICON_BASE}/icon_signal_feed.svg`} width="40" height="40" alt="Find" style={{ margin: '12px auto' }} />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <Text style={{ fontFamily: FONTS.header, fontSize: '13px', fontWeight: '900', letterSpacing: '1px', margin: '12px 0 8px 0', textTransform: 'uppercase' as const }}>FIND</Text>
                <Text style={{ fontSize: '12px', color: COLORS.secondary, lineHeight: '18px', margin: '0' }}>Follow the highest performing traders.</Text>
              </td>

              {/* Step 3: COPY */}
              <td style={{ width: '33.33%', textAlign: 'center' as const, padding: '0 8px', verticalAlign: 'top' }}>
                <table border={0} cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
                  <tbody>
                    <tr>
                      <td align="right" style={{ paddingBottom: '4px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '900', fontFamily: FONTS.mono, color: COLORS.white, backgroundColor: COLORS.yellow, display: 'inline-block', padding: '2px 6px', letterSpacing: '0.5px' }}>#3</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <div style={{ border: `1px solid ${COLORS.border}`, width: '64px', height: '64px', textAlign: 'center' as const }}>
                          <Img src={`${ICON_BASE}/icon_classic_squares.svg`} width="40" height="40" alt="Copy" style={{ margin: '12px auto' }} />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <Text style={{ fontFamily: FONTS.header, fontSize: '13px', fontWeight: '900', letterSpacing: '1px', margin: '12px 0 8px 0', textTransform: 'uppercase' as const }}>COPY</Text>
                <Text style={{ fontSize: '12px', color: COLORS.secondary, lineHeight: '18px', margin: '0' }}>Mirror trades automatically.</Text>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Premium Section - entire section in yellow */}
        <Section style={{ backgroundColor: COLORS.yellow, marginTop: '48px', padding: '40px' }}>
          <table width="100%" border={0} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td>
                  <Text style={{ fontFamily: FONTS.mono, fontSize: '10px', fontWeight: '900', letterSpacing: '2px', color: COLORS.black, margin: '0', textTransform: 'uppercase' as const }}>PREMIUM</Text>
                </td>
                <td align="right">
                  <div style={{ backgroundColor: COLORS.black, color: COLORS.yellow, display: 'inline-block', fontSize: '10px', fontWeight: '900', padding: '4px 10px', fontFamily: FONTS.mono, letterSpacing: '1px', textTransform: 'uppercase' as const }}>POPULAR CHOICE</div>
                </td>
              </tr>
            </tbody>
          </table>

          <Text style={{ fontFamily: FONTS.header, fontSize: '72px', fontWeight: '900', color: COLORS.black, margin: '16px 0 32px 0', lineHeight: '1' }}>
            $20 <span style={{ fontSize: '20px', fontWeight: '700' }}>/MONTH</span>
          </Text>

          {/* Feature Checklist inside yellow */}
          {[
            'QUICK COPY TRADE EXECUTION',
            'AUTO-CLOSE POSITIONS',
            'ADVANCED ALGORITHM CONTROLS',
            'SECURE CONNECTED WALLET',
            '24/7 PRIORITY SIGNAL SUPPORT',
          ].map((feature, i) => (
            <table key={i} width="100%" border={0} cellPadding="0" cellSpacing="0" style={{ marginBottom: '14px' }}>
              <tbody>
                <tr>
                  <td style={{ width: '32px', verticalAlign: 'middle' }}>
                    <div style={{ width: '24px', height: '24px', border: `2px solid ${COLORS.black}`, textAlign: 'center' as const, lineHeight: '20px', fontSize: '14px', fontWeight: '900', color: COLORS.black }}>✓</div>
                  </td>
                  <td style={{ verticalAlign: 'middle', paddingLeft: '12px' }}>
                    <Text style={{ fontFamily: FONTS.header, fontSize: '13px', fontWeight: '900', letterSpacing: '0.5px', margin: '0', textTransform: 'uppercase' as const, color: COLORS.black }}>{feature}</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          ))}
        </Section>

        {/* Upgrade Button - full width black */}
        <Section style={{ textAlign: 'center' as const }}>
          <Link
            href={`${profileUrl}?upgrade=true`}
            style={{
              display: 'block',
              padding: '18px 28px',
              textDecoration: 'none',
              backgroundColor: COLORS.black,
              color: COLORS.yellow,
              fontFamily: FONTS.header,
              fontSize: '14px',
              fontWeight: '900',
              textTransform: 'uppercase' as const,
              letterSpacing: '1.5px',
              textAlign: 'center' as const,
            }}
          >
            UPGRADE TO PREMIUM
          </Link>
        </Section>
      </EmailSection>
    </EmailLayout>
  )
}
