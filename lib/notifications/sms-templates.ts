// SMS/WhatsApp message templates for notifications

export function formatTraderClosedMessage(params: {
  traderUsername: string
  marketTitle: string
  outcome: string
  userROI: number
  currentPrice: number
  oppositePrice: number
}): string {
  const { traderUsername, marketTitle, outcome, userROI, currentPrice, oppositePrice } = params
  
  // Format ROI
  const roiSign = userROI >= 0 ? '+' : ''
  
  // Format market odds (current prices as percentages)
  const yesPrice = outcome === 'YES' ? currentPrice : oppositePrice
  const noPrice = outcome === 'NO' ? currentPrice : oppositePrice
  const marketOdds = `YES: ${Math.round(yesPrice * 100)}¢, NO: ${Math.round(noPrice * 100)}¢`
  
  return `${traderUsername} closed their ${outcome} position on "${marketTitle}".

Your current ROI: ${roiSign}${userROI.toFixed(1)}%
Current Market Odds: ${marketOdds}

You can visit your profile now to close your position, or do nothing and wait for the market to resolve.

View Trade: https://polycopy.app/profile`
}

export function formatMarketResolvedMessage(params: {
  marketTitle: string
  userBet: string
  result: string
  userROI: number
}): string {
  const { marketTitle, userBet, result, userROI } = params
  
  const roiSign = userROI >= 0 ? '+' : ''
  const didWin = userBet.toUpperCase() === result.toUpperCase()
  const emoji = didWin ? '🎉' : '😔'
  
  return `${emoji} The trade you copied in market "${marketTitle}" has resolved:

Your bet: ${userBet}
Result: ${result}
Your ROI: ${roiSign}${userROI.toFixed(1)}%

View Trade: https://polycopy.app/profile`
}

export function formatVerificationCodeMessage(code: string): string {
  return `Your Polycopy verification code is: ${code}. This code expires in 10 minutes. If you didn't request this, please ignore this message.`
}

