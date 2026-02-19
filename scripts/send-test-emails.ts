import 'dotenv/config'
import { Resend } from 'resend'
import { createElement } from 'react'

import WelcomeEmail from '../emails/WelcomeEmail'
import MarketResolvedEmail from '../emails/MarketResolved'
import TraderClosedPositionEmail from '../emails/TraderClosedPosition'
import AutoCloseExecutedEmail from '../emails/AutoCloseExecuted'
import AutoCloseFailedEmail from '../emails/AutoCloseFailed'
import PremiumSubscriptionConfirmationEmail from '../emails/PremiumSubscriptionConfirmation'
import SubscriptionCancellationConfirmationEmail from '../emails/SubscriptionCancellationConfirmation'

const TO = 'brad@rmkbl.agency'
const FROM = 'Polycopy <notifications@polycopy.app>'

async function main() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('Missing RESEND_API_KEY in .env.local')
    process.exit(1)
  }

  const resend = new Resend(apiKey)

  const templates: { subject: string; react: React.ReactElement }[] = [
    {
      subject: '[TEST] Welcome to Polycopy',
      react: createElement(WelcomeEmail, {
        userName: 'Brad',
        profileUrl: 'https://polycopy.app/v2/portfolio',
      }),
    },
    {
      subject: '[TEST] Market Resolved - You Won!',
      react: createElement(MarketResolvedEmail, {
        userName: 'Brad',
        marketTitle: 'Will Bitcoin reach $100k by end of 2026?',
        resolvedOutcome: 'Yes',
        userPosition: 'Yes',
        userEntryPrice: 0.65,
        userROI: 53.8,
        betAmount: 25.0,
        didUserWin: true,
        tradeUrl: 'https://polycopy.app/v2/portfolio',
        unsubscribeUrl: 'https://polycopy.app/v2/settings',
      }),
    },
    {
      subject: '[TEST] Market Resolved - You Lost',
      react: createElement(MarketResolvedEmail, {
        userName: 'Brad',
        marketTitle: 'Will the Fed cut rates in March 2026?',
        resolvedOutcome: 'No',
        userPosition: 'Yes',
        userEntryPrice: 0.42,
        userROI: -100,
        betAmount: 15.0,
        didUserWin: false,
        tradeUrl: 'https://polycopy.app/v2/portfolio',
        unsubscribeUrl: 'https://polycopy.app/v2/settings',
      }),
    },
    {
      subject: '[TEST] Trader Closed Position',
      react: createElement(TraderClosedPositionEmail, {
        userName: 'Brad',
        traderUsername: 'whale_trader_92',
        marketTitle: 'Will Ethereum flip Bitcoin market cap in 2026?',
        outcome: 'No',
        userEntryPrice: 0.28,
        traderExitPrice: 0.45,
        userROI: 60.7,
        traderROI: 42.3,
        tradeUrl: 'https://polycopy.app/v2/portfolio',
        polymarketUrl: 'https://polymarket.com',
        unsubscribeUrl: 'https://polycopy.app/v2/settings',
      }),
    },
    {
      subject: '[TEST] Auto-Close Executed',
      react: createElement(AutoCloseExecutedEmail, {
        userName: 'Brad',
        marketTitle: 'Will SpaceX launch Starship successfully in Q1 2026?',
        outcome: 'Yes',
        side: 'SELL',
        filledSize: 38.4615,
        limitPrice: 0.82,
        estimatedProceeds: 31.54,
        orderId: '0x7f3a9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a',
        tradeUrl: 'https://polycopy.app/v2/portfolio',
        polymarketUrl: 'https://polymarket.com',
        unsubscribeUrl: 'https://polycopy.app/v2/settings',
      }),
    },
    {
      subject: '[TEST] Auto-Close Failed',
      react: createElement(AutoCloseFailedEmail, {
        userName: 'Brad',
        marketTitle: 'Will Apple release AR glasses in 2026?',
        outcome: 'Yes',
        reason: 'The limit price of 72¢ was not reached. The current market price is 68¢.',
        tradeUrl: 'https://polycopy.app/v2/portfolio',
        polymarketUrl: 'https://polymarket.com',
        unsubscribeUrl: 'https://polycopy.app/v2/settings',
      }),
    },
    {
      subject: '[TEST] Premium Subscription Confirmation',
      react: createElement(PremiumSubscriptionConfirmationEmail, {
        userName: 'Brad',
        subscriptionDate: new Date().toLocaleDateString(),
        billingPeriod: 'monthly',
        amount: '$19.99',
        profileUrl: 'https://polycopy.app/v2/portfolio',
      }),
    },
    {
      subject: '[TEST] Subscription Cancellation Confirmation',
      react: createElement(SubscriptionCancellationConfirmationEmail, {
        userName: 'Brad',
        cancellationDate: new Date().toLocaleDateString(),
        accessUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        profileUrl: 'https://polycopy.app/v2/portfolio',
      }),
    },
  ]

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  console.log(`Sending ${templates.length} test emails to ${TO}...\n`)

  for (const template of templates) {
    await sleep(1000)
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: TO,
        subject: template.subject,
        react: template.react,
      })

      if (error) {
        console.error(`✗ ${template.subject}: ${JSON.stringify(error)}`)
      } else {
        console.log(`✓ ${template.subject} (id: ${data?.id})`)
      }
    } catch (err) {
      console.error(`✗ ${template.subject}: ${err}`)
    }
  }

  console.log('\nDone!')
}

main()
