/**
 * Event Bus for Live Trading Order Lifecycle
 *
 * Emits structured events when order state changes.
 * Consumers: metrics, alerts, dashboards, future Inngest/Datadog.
 *
 * Events:
 *   OrderPlaced, OrderFilled, OrderPartialFill, OrderCancelled, OrderFailed, OrderLost
 */

import { EventEmitter } from 'events';

export type OrderEventType =
  | 'OrderPlaced'
  | 'OrderFilled'
  | 'OrderPartialFill'
  | 'OrderCancelled'
  | 'OrderFailed'
  | 'OrderLost';

export interface OrderEventPayload {
  lt_order_id: string;
  strategy_id: string;
  order_id?: string;
  status: string;
  signal_size_usd?: number;
  executed_size_usd?: number;
  shares_bought?: number;
  fill_rate?: number;
  timestamp: string;
  [key: string]: unknown;
}

const bus = new EventEmitter();
bus.setMaxListeners(20);

export function emitOrderEvent(type: OrderEventType, payload: OrderEventPayload): void {
  bus.emit(type, payload);
  bus.emit('*', { type, ...payload });
}

export function onOrderEvent(
  type: OrderEventType | '*',
  handler: (payload: OrderEventPayload & { type?: OrderEventType }) => void
): () => void {
  bus.on(type, handler);
  return () => bus.off(type, handler);
}
