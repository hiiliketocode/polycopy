type NormalizeContractsResult = {
  contracts: number | null
  adjustedToMin: boolean
  precisionAdjusted: boolean
  rawContracts?: number | null
}

function countDecimals(value: number) {
  if (!Number.isFinite(value)) return 0
  const normalized = value.toString().toLowerCase()
  const [base, expRaw] = normalized.split('e')
  const baseDecimals = base.includes('.') ? base.split('.')[1]?.length || 0 : 0
  const exponent = expRaw ? Number(expRaw) : 0
  if (!Number.isFinite(exponent) || exponent === 0) return baseDecimals
  if (exponent < 0) return baseDecimals + Math.abs(exponent)
  return Math.max(0, baseDecimals - exponent)
}

function gcd(a: number, b: number) {
  let x = Math.abs(Math.trunc(a))
  let y = Math.abs(Math.trunc(b))
  while (y !== 0) {
    const temp = y
    y = x % y
    x = temp
  }
  return x === 0 ? 1 : x
}

function computeImpliedDivisor(
  price: number,
  tickSize: number | null | undefined,
  sizeDecimals: number,
  maxImpliedDecimals: number
) {
  const sizeFactor = Math.pow(10, sizeDecimals)
  const priceDecimals = tickSize ? getStepDecimals(tickSize) : countDecimals(price)
  const priceFactor = Math.pow(10, priceDecimals)
  const priceUnits = Math.round(price * priceFactor)
  const maxFactor = Math.pow(10, maxImpliedDecimals)
  if (!Number.isFinite(priceUnits) || priceUnits <= 0) return null
  const numerator = priceUnits * maxFactor
  const denominator = priceFactor * sizeFactor
  const divisor = denominator / gcd(numerator, denominator)
  if (!Number.isFinite(divisor) || divisor <= 0) return null
  return { divisor, sizeFactor }
}

export function getStepDecimals(step?: number | null) {
  if (!step || !Number.isFinite(step) || step <= 0) return 0
  return Math.max(0, countDecimals(step))
}

export function roundDownToStep(value: number, step?: number | null) {
  if (!Number.isFinite(value)) return NaN
  if (!step || !Number.isFinite(step) || step <= 0) return value
  const decimals = getStepDecimals(step)
  const factor = Math.pow(10, decimals)
  const scaledStep = Math.round(step * factor)
  if (scaledStep <= 0) return value
  const scaledValue = Math.floor(value * factor + 1e-9)
  const stepped = Math.floor(scaledValue / scaledStep) * scaledStep
  return stepped / factor
}

export function roundUpToStep(value: number, step?: number | null) {
  if (!Number.isFinite(value)) return NaN
  if (!step || !Number.isFinite(step) || step <= 0) return value
  const decimals = getStepDecimals(step)
  const factor = Math.pow(10, decimals)
  const scaledStep = Math.round(step * factor)
  if (scaledStep <= 0) return value
  const scaledValue = Math.ceil(value * factor - 1e-9)
  const stepped = Math.ceil(scaledValue / scaledStep) * scaledStep
  return stepped / factor
}

export function roundPriceToTick(price: number, tickSize?: number | null) {
  return roundDownToStep(price, tickSize)
}

export function adjustSizeForImpliedAmount(
  price: number | null,
  size: number | null,
  tickSize?: number | null,
  sizeDecimals = 2,
  maxImpliedDecimals = 2
) {
  if (price === null || size === null) return null
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null
  if (price <= 0 || size <= 0) return null

  const implied = computeImpliedDivisor(price, tickSize, sizeDecimals, maxImpliedDecimals)
  if (!implied) return size
  const { divisor, sizeFactor } = implied
  const sizeUnits = Math.floor(size * sizeFactor + 1e-9)
  const adjustedUnits = Math.floor(sizeUnits / divisor) * divisor
  if (adjustedUnits <= 0) return null
  return adjustedUnits / sizeFactor
}

export function adjustSizeForImpliedAmountAtLeast(
  price: number | null,
  size: number | null,
  tickSize?: number | null,
  sizeDecimals = 2,
  maxImpliedDecimals = 2
) {
  if (price === null || size === null) return null
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null
  if (price <= 0 || size <= 0) return null

  const implied = computeImpliedDivisor(price, tickSize, sizeDecimals, maxImpliedDecimals)
  if (!implied) return size
  const { divisor, sizeFactor } = implied
  const sizeUnits = Math.floor(size * sizeFactor + 1e-9)
  const adjustedUnits = Math.ceil(sizeUnits / divisor) * divisor
  if (adjustedUnits <= 0) return null
  return adjustedUnits / sizeFactor
}

export function normalizeContractsInput(
  value: number | null,
  minOrderSize?: number | null,
  step?: number | null
): NormalizeContractsResult {
  if (value === null || !Number.isFinite(value)) {
    return { contracts: null, adjustedToMin: false, precisionAdjusted: false }
  }
  if (value <= 0) {
    return { contracts: null, adjustedToMin: false, precisionAdjusted: false }
  }

  const min =
    minOrderSize && Number.isFinite(minOrderSize) && minOrderSize > 0 ? minOrderSize : null
  const appliedStep =
    step && Number.isFinite(step) && step > 0 ? step : min ?? null

  const rounded = appliedStep ? roundDownToStep(value, appliedStep) : value
  const precisionAdjusted =
    appliedStep !== null && Number.isFinite(rounded) && Math.abs(rounded - value) > 1e-9

  let contracts = rounded
  let adjustedToMin = false
  if (min !== null && contracts < min) {
    contracts = min
    adjustedToMin = true
  }

  return { contracts, adjustedToMin, precisionAdjusted }
}

export function normalizeContractsFromUsd(
  usd: number | null,
  price: number | null,
  minOrderSize?: number | null,
  step?: number | null
): NormalizeContractsResult {
  if (usd === null || !Number.isFinite(usd) || usd <= 0) {
    return { contracts: null, adjustedToMin: false, precisionAdjusted: false, rawContracts: null }
  }
  if (!price || !Number.isFinite(price) || price <= 0) {
    return { contracts: null, adjustedToMin: false, precisionAdjusted: false, rawContracts: null }
  }

  const rawContracts = usd / price
  const normalized = normalizeContractsInput(rawContracts, minOrderSize, step)
  return { ...normalized, rawContracts }
}
