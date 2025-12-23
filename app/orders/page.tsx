'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { supabase } from '@/lib/supabase';

interface OrderRow {
  order_id: string;
  market_id: string;
  outcome: string | null;
  side: string;
  order_type: string | null;
  time_in_force: string | null;
  price: number | string | null;
  size: number | string;
  filled_size: number | string;
  remaining_size: number | string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  partial: 'bg-amber-50 text-amber-700 ring-amber-200',
  filled: 'bg-slate-100 text-slate-700 ring-slate-200',
  canceled: 'bg-rose-50 text-rose-700 ring-rose-200',
  expired: 'bg-slate-50 text-slate-600 ring-slate-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function formatNumber(value: number | string | null, digits = 4) {
  if (value === null || value === undefined) return '--';
  const numericValue = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(numericValue)) return '--';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
  }).format(numericValue);
}

function formatDate(value: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatStatusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'canceled') return 'Cancelled';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default function OrdersPage() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [refreshSummary, setRefreshSummary] = useState<{
    insertedCount: number;
    updatedCount: number;
    total: number;
  } | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      setLoadingAuth(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login');
      } finally {
        setLoadingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const fetchOrders = async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const response = await fetch('/api/orders', { cache: 'no-store' });
      const data = await response.json();

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        setOrdersError(data.error || 'Failed to load orders');
        return;
      }

      setOrders(data.orders || []);
    } catch (err: any) {
      console.error('Orders load error:', err);
      setOrdersError('Failed to load orders');
    } finally {
      setOrdersLoading(false);
    }
  };

  const refreshOrders = async () => {
    setRefreshing(true);
    setRefreshError(null);
    setCopiedOrderId(null);

    try {
      const response = await fetch('/api/polymarket/orders/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        setRefreshError(data.error || 'Failed to refresh orders');
      } else {
        setLastRefreshedAt(data.refreshedAt || new Date().toISOString());
        setRefreshSummary({
          insertedCount: Number(data.insertedCount || 0),
          updatedCount: Number(data.updatedCount || 0),
          total: Number(data.total || 0),
        });
      }
    } catch (err: any) {
      console.error('Orders refresh error:', err);
      setRefreshError('Failed to refresh orders');
    } finally {
      await fetchOrders();
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (loadingAuth || hasLoaded) return;
    setHasLoaded(true);
    refreshOrders();
  }, [loadingAuth, hasLoaded]);

  const statusSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    orders.forEach((order) => {
      const key = order.status || 'unknown';
      summary[key] = (summary[key] || 0) + 1;
    });
    return summary;
  }, [orders]);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedOrderId(value);
      setTimeout(() => {
        setCopiedOrderId((current) => (current === value ? null : current));
      }, 1200);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const isLoading = loadingAuth || ordersLoading || refreshing;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Orders</h1>
            <p className="text-slate-600">Open and recent CLOB orders from Polymarket.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={refreshOrders}
              disabled={refreshing}
              className="px-4 py-2 bg-[#0F0F0F] text-white rounded-lg text-sm font-semibold disabled:opacity-60"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {refreshing && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
            <p className="text-slate-600">Refreshing orders…</p>
          </div>
        )}

        {refreshError && (
          <div className="bg-white rounded-2xl border border-rose-200 shadow-sm p-4 mb-4">
            <p className="text-rose-600">{refreshError}</p>
          </div>
        )}

        {(lastRefreshedAt || refreshSummary) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm text-slate-600">
              Last refreshed: {lastRefreshedAt ? formatDate(lastRefreshedAt) : '--'}
            </p>
            {refreshSummary && (
              <p className="text-xs text-slate-500">
                {refreshSummary.total} orders • {refreshSummary.insertedCount} new • {refreshSummary.updatedCount} updated
              </p>
            )}
          </div>
        )}

        {ordersError && (
          <div className="bg-white rounded-2xl border border-rose-200 shadow-sm p-4 mb-4">
            <p className="text-rose-600">{ordersError}</p>
          </div>
        )}

        {isLoading && !ordersError && orders.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-slate-600">Loading orders…</p>
          </div>
        )}

        {!isLoading && orders.length === 0 && !ordersError && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-slate-600">No orders found yet.</p>
          </div>
        )}

        {orders.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Orders</h2>
                <p className="text-sm text-slate-500">
                  {orders.length} total order{orders.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(statusSummary).map(([status, count]) => (
                  <span
                    key={status}
                    className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200"
                  >
                    {formatStatusLabel(status)}: {count}
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Market</th>
                    <th className="py-2 pr-4 font-medium">Side</th>
                    <th className="py-2 pr-4 font-medium">Outcome</th>
                    <th className="py-2 pr-4 font-medium">Size</th>
                    <th className="py-2 pr-4 font-medium">Price</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 pr-4 font-medium">Updated</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">Order ID</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const marketLabel = order.market_id || 'Unknown market';
                    const marketLink = order.market_id?.startsWith('0x')
                      ? `https://polymarket.com/market/${order.market_id}`
                      : null;

                    return (
                      <tr key={order.order_id} className="border-b border-slate-100">
                        <td className="py-3 pr-4">
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-full ring-1 ring-inset ${
                              STATUS_STYLES[order.status] || 'bg-slate-50 text-slate-600 ring-slate-200'
                            }`}
                          >
                            {formatStatusLabel(order.status)}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          {marketLink ? (
                            <a
                              href={marketLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-900 font-medium hover:underline"
                            >
                              {marketLabel}
                            </a>
                          ) : (
                            <div className="text-slate-900 font-medium">{marketLabel}</div>
                          )}
                          <div className="text-xs text-slate-500">{order.market_id}</div>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {order.side ? order.side.toUpperCase() : '--'}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{order.outcome || '--'}</td>
                        <td className="py-3 pr-4 text-slate-700">{formatNumber(order.size, 4)}</td>
                        <td className="py-3 pr-4 text-slate-700">{formatNumber(order.price, 4)}</td>
                        <td className="py-3 pr-4 text-slate-600">{formatDate(order.created_at)}</td>
                        <td className="py-3 pr-4 text-slate-600">{formatDate(order.updated_at)}</td>
                        <td className="py-3 pr-4 text-slate-600">Polymarket</td>
                        <td className="py-3 pr-4 text-slate-600">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">
                              {order.order_id.slice(0, 6)}…{order.order_id.slice(-4)}
                            </span>
                            <button
                              onClick={() => handleCopy(order.order_id)}
                              className="text-xs text-slate-500 hover:text-slate-900"
                              type="button"
                            >
                              {copiedOrderId === order.order_id ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
