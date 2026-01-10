import { OrdersScreen, type OrdersScreenProps } from '@/components/orders/OrdersScreen'

export type OrdersPageProps = OrdersScreenProps

export default function OrdersPage(props: OrdersPageProps = {}) {
  return <OrdersScreen {...props} />
}
