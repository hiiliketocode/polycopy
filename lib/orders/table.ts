import type { SupabaseClient } from '@supabase/supabase-js'

export type OrdersTableName = 'orders' | 'trades'

let cachedOrdersTable: OrdersTableName | null = null

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01', '42703'])

export async function resolveOrdersTableName(
  client: SupabaseClient
): Promise<OrdersTableName> {
  if (cachedOrdersTable) return cachedOrdersTable
  const { error } = await client.from('orders').select('order_id').limit(1)

  if (!error) {
    cachedOrdersTable = 'orders'
    return cachedOrdersTable
  }

  const code = (error as any)?.code
  const isMissingTable =
    MISSING_TABLE_CODES.has(code) ||
    error.message?.toLowerCase().includes('could not find the table')

  if (isMissingTable) {
    cachedOrdersTable = 'trades'
    return cachedOrdersTable
  }

  throw error
}
