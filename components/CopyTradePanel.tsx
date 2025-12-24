'use client'

type Direction = 'buy' | 'sell'

type OrderBehavior = 'IOC' | 'GTC'

type CopyTradePanelProps = {
  marketAvatar?: string
  marketName: string
  marketDirection: Direction
  marketOutcome: string
  marketStatus: 'market open' | 'market closed'
  filledPriceLabel: string
  contractsLabel: string
  totalCostLabel: string
  payoutLabel: string
  timestampLabel: string
  elapsedLabel: string
  balanceLabel: string
  balanceHelper: string
  balanceLoading: boolean
  onBalanceRefresh?: () => void
  amountMode: 'usd' | 'contracts'
  amountInput: string
  onAmountModeChange: (mode: 'usd' | 'contracts') => void
  onAmountInputChange: (value: string) => void
  amountSecondaryLabel: string
  livePriceLabel: string
  livePriceDelta?: string
  slippageValue: number | 'custom'
  customSlippage: string
  onSlippageChange: (value: number | 'custom') => void
  onCustomSlippageChange: (value: string) => void
  slippageHelper: string
  orderBehavior: OrderBehavior
  onOrderBehaviorChange: (value: OrderBehavior) => void
  statusLabel?: string
  statusDetail?: string
  fillProgress?: number | null
  canSubmit: boolean
  isSubmitting: boolean
  onSubmit: () => void
  submitError?: string
}

const badgeBase = 'inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-semibold tracking-wide'

const layoutBadgeBase = `${badgeBase} bg-slate-100 text-slate-600 border border-slate-200`

export default function CopyTradePanel({
  marketAvatar,
  marketName,
  marketDirection,
  marketOutcome,
  marketStatus,
  filledPriceLabel,
  contractsLabel,
  totalCostLabel,
  payoutLabel,
  timestampLabel,
  elapsedLabel,
  balanceLabel,
  balanceHelper,
  balanceLoading,
  onBalanceRefresh,
  amountMode,
  amountInput,
  onAmountModeChange,
  onAmountInputChange,
  amountSecondaryLabel,
  livePriceLabel,
  livePriceDelta,
  slippageValue,
  customSlippage,
  onSlippageChange,
  onCustomSlippageChange,
  slippageHelper,
  orderBehavior,
  onOrderBehaviorChange,
  statusLabel,
  statusDetail,
  fillProgress,
  canSubmit,
  isSubmitting,
  onSubmit,
  submitError,
}: CopyTradePanelProps) {
  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-lg space-y-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">trade you’re copying</p>
          <p className="text-xs text-slate-500">This is the original trade you’re about to copy.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-100 bg-slate-50">
            {marketAvatar ? (
              <img src={marketAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-slate-100" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-900">
              <span>{marketName}</span>
              <span
                className={`${badgeBase} ${
                  marketDirection === 'buy'
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    : 'bg-rose-50 text-rose-600 border border-rose-100'
                }`}
              >
                direction: {marketDirection}
              </span>
              <span className={layoutBadgeBase}>outcome: {marketOutcome}</span>
            </div>
          </div>
          <div>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                marketStatus === 'market open'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {marketStatus}
            </span>
          </div>
        </div>
        <div className="grid gap-5 text-sm text-slate-500 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">filled price</p>
            <p className="text-base font-semibold text-slate-900">{filledPriceLabel}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">contracts</p>
            <p className="text-base font-semibold text-slate-900">{contractsLabel}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">total cost</p>
            <p className="text-base font-semibold text-slate-900">{totalCostLabel}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">payout if wins</p>
            <p className="text-base font-semibold text-slate-900">{payoutLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-500">
          <span>timestamp {timestampLabel}</span>
          <span>Elapsed {elapsedLabel}</span>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-lg space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">your order</p>
          <div className="text-xs text-slate-500">{balanceLoading ? 'loading…' : balanceLabel}</div>
        </div>
        <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
          <span>Cash available</span>
          {onBalanceRefresh && (
            <button
              type="button"
              onClick={onBalanceRefresh}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              refresh
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">amount</p>
              <p className="text-lg font-semibold text-slate-900">{amountMode === 'usd' ? 'usd entry' : 'contracts entry'}</p>
            </div>
            <div className="inline-flex rounded-full border border-slate-200 text-xs text-slate-600">
              <button
                type="button"
                className={`px-3 py-1 ${amountMode === 'usd' ? 'bg-slate-900 text-white' : 'bg-white'}`}
                onClick={() => onAmountModeChange('usd')}
              >
                $
              </button>
              <button
                type="button"
                className={`px-3 py-1 ${amountMode === 'contracts' ? 'bg-slate-900 text-white' : 'bg-white'}`}
                onClick={() => onAmountModeChange('contracts')}
              >
                contracts
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              {amountMode === 'usd' && <span className="text-xl font-semibold text-slate-900">$</span>}
              <input
                type="number"
                value={amountInput}
                onChange={(e) => onAmountInputChange(e.target.value)}
                className="w-full rounded-[14px] border border-slate-200 px-3 py-2 text-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                placeholder={amountMode === 'usd' ? '0.00' : '0'}
              />
            </div>
            <div className="text-sm text-slate-500">= {amountSecondaryLabel}</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>current price / contract</span>
          <span className="text-base font-semibold text-slate-900">{livePriceLabel}</span>
        </div>
        {livePriceDelta && (
          <div className={`text-xs ${livePriceDelta.includes('-') ? 'text-rose-600' : 'text-emerald-600'}`}>
            {livePriceDelta}
          </div>
        )}

        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            {[0, 1, 3, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onSlippageChange(value)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  slippageValue === value
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {value}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => onSlippageChange('custom')}
              className={`rounded-full border px-3 py-1 text-xs ${
                slippageValue === 'custom'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Custom
            </button>
            {slippageValue === 'custom' && (
              <input
                type="number"
                value={customSlippage}
                onChange={(e) => onCustomSlippageChange(e.target.value)}
                className="w-16 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:outline-none"
                placeholder="0.5"
              />
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">max slippage</span>
            <span title="This limits the price per contract at which the order will fill, similar to a limit order." className="cursor-help text-slate-400">?</span>
          </div>
          <div className="text-xs text-slate-500">{slippageHelper}</div>
        </div>

        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>order instruction</span>
            <span title="Fill or kill attempts to fill immediately or cancel; GT Cancelled remains active until canceled." className="cursor-help text-slate-400">?</span>
          </div>
          <div className="flex gap-3 text-sm font-semibold">
            {(['IOC', 'GTC'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onOrderBehaviorChange(value)}
                className={`flex-1 rounded-[14px] border px-3 py-2 text-center ${
                  orderBehavior === value
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {value === 'IOC' ? 'Fill or Kill' : 'Good Till Cancelled'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`w-full rounded-[14px] px-4 py-3 text-sm font-semibold text-white transition-colors ${
              canSubmit && !isSubmitting ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300'
            }`}
          >
            {isSubmitting ? 'sending…' : 'send order'}
          </button>
          {submitError && <div className="text-xs text-rose-600">{submitError}</div>}
        </div>

        {statusLabel && (
          <div className="rounded-[18px] bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="text-xs font-semibold tracking-wide text-slate-400">status</p>
            <p className="text-sm font-semibold text-slate-900">{statusLabel}</p>
            {statusDetail && <p className="text-xs text-slate-500">{statusDetail}</p>}
            {fillProgress !== null && fillProgress !== undefined && (
              <div className="mt-2 h-2 w-full rounded-full bg-white">
                <div className="h-2 rounded-full bg-slate-900" style={{ width: `${fillProgress}%` }} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
