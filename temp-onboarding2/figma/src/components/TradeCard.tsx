import { ExternalLink, Info } from 'lucide-react';

export function TradeCard() {
  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-gray-900 font-semibold">21</span>
          <span className="text-gray-400 text-sm">212121212121212121212</span>
        </div>
        <span className="text-gray-400 text-sm">1h ago</span>
      </div>

      {/* Game Info */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="#1E40AF"/>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#3B82F6"/>
            <path d="M12 7l2 5h5l-4 3 2 5-5-4-5 4 2-5-4-3h5z" fill="white" opacity="0.9"/>
            <circle cx="12" cy="12" r="3" fill="white"/>
            <circle cx="12" cy="12" r="1.5" fill="#3B82F6"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Kings vs. Celtics</h2>
      </div>

      {/* Stats Grid */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {/* Outcome */}
          <div>
            <div className="text-gray-500 text-sm mb-1">Outcome</div>
            <div className="text-gray-900 font-semibold">Kings</div>
          </div>

          {/* Invested */}
          <div className="text-right">
            <div className="text-gray-500 text-sm mb-1">Invested</div>
            <div className="text-gray-900 font-semibold">$1,678.27</div>
          </div>

          {/* Contracts */}
          <div>
            <div className="text-gray-500 text-sm mb-1">Contracts</div>
            <div className="text-gray-900 font-semibold">8,833.0</div>
          </div>

          {/* Entry */}
          <div className="text-right">
            <div className="text-gray-500 text-sm mb-1">Entry</div>
            <div className="text-gray-900 font-semibold">$0.19</div>
          </div>

          {/* Current */}
          <div>
            <div className="text-gray-500 text-sm mb-1">Current</div>
            <div className="text-gray-900 font-semibold">$0.195</div>
          </div>

          {/* ROI */}
          <div className="text-right">
            <div className="text-gray-500 text-sm mb-1">ROI</div>
            <div className="text-teal-500 font-semibold">+2.6%</div>
          </div>
        </div>
      </div>

      {/* How to trade link */}
      <button className="flex items-center justify-center gap-2 w-full text-gray-500 text-sm py-2 mb-4 hover:text-gray-700 transition-colors">
        <Info className="w-4 h-4" />
        <span>How to trade</span>
      </button>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
          <span>1</span>
          <span>Copy trade</span>
          <ExternalLink className="w-4 h-4" />
        </button>
        <button className="flex-1 bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-4 rounded-xl border border-gray-300 flex items-center justify-center gap-2 transition-colors">
          <span>2</span>
          <span>Mark as copied</span>
        </button>
      </div>
    </div>
  );
}
