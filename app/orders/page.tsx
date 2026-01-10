import { OrdersScreen, type OrdersScreenProps } from '@/components/orders/OrdersScreen'

// Re-export for backward compatibility
export { OrdersScreen }
export type { OrdersScreenProps }

export type OrdersPageProps = OrdersScreenProps

export default function OrdersPage(props: OrdersPageProps = {}) {
  return <OrdersScreen {...props} />
}
