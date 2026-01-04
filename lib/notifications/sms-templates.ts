// SMS/WhatsApp message templates for notifications

export function formatTraderClosedMessage(params: {
  traderUsername: string
  marketTitle: string
  outcome: string
  userROI: number
  traderROI: number
}): string {
  const { traderUsername, marketTitle, outcome, userROI, traderROI } = params
  
  // Keep it concise for SMS (160 chars ideal)
  const roiSign = userROI >= 0 ? '+' : ''
  
  return `${traderUsername} closed their ${outcome} position on "${marketTitle}". Your ROI: ${roiSign}${userROI.toFixed(1)}%. Trader ROI: ${traderROI >= 0 ? '+' : ''}${traderROI.toFixed(1)}%. View details: https://polycopy.app/profile`
}

export function formatMarketResolvedMessage(params: {
  marketTitle: string
  outcome: string
  didWin: boolean
  userROI: number
}): string {
  const { marketTitle, outcome, didWin, userROI } = params
  
  const result = didWin ? '🎉 You won!' : '😔 You lost'
  const roiSign = userROI >= 0 ? '+' : ''
  
  return `${result} Market resolved: "${marketTitle}" → ${outcome}. Your ROI: ${roiSign}${userROI.toFixed(1)}%. View details: https://polycopy.app/profile`
}

export function formatVerificationCodeMessage(code: string): string {
  return `Your Polycopy verification code is: ${code}. This code expires in 10 minutes. If you didn't request this, please ignore this message.`
}

