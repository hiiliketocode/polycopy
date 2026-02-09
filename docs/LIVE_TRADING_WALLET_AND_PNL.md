# Live Trading: Wallet and P&L Tracking

## Polymarket wallet

- **What it is:** The Polymarket (CLOB) wallet address where **real money** orders are placed and settled. This is the same wallet you use in Portfolio and for manual trading.
- **How we set it:** When you create a Live strategy we use your **connected wallet** by default (from Turnkey / account linking). You can override it in the create form if you use a different address.
- **Who owns strategies:** Every Live strategy is tied to the **logged-in user** (`user_id` from your session). Only you see and control your strategies.

We do **not** use “sub-wallets” today: one Polymarket wallet per linked account. All Live strategies you create can share that wallet; orders are attributed to each strategy via `lt_strategy_id` (see below).

## How P&L and orders are tracked

- **`lt_strategies`**  
  One row per Live strategy: `strategy_id` (e.g. `LT_<ft_wallet_id>`), `ft_wallet_id`, `user_id`, `wallet_address`, capital and risk settings.

- **`lt_orders`**  
  One row per **live** order we place: links a strategy (`strategy_id`), the FT signal (`ft_order_id`), and the real CLOB order (`order_id` → `public.orders`). Holds execution details (signal price/size, executed price/size, slippage, fill time, outcome, redemption).

- **`public.orders`**  
  The main orders table. For Live orders we set:
  - **`lt_strategy_id`** – which Live strategy placed this order
  - **`lt_order_id`** – link to `lt_orders` for that placement

So:

- Every real order placed by Live is **marked** with `orders.lt_strategy_id` and `orders.lt_order_id`.
- P&L for a strategy is computed from orders (and positions) where `orders.lt_strategy_id = strategy_id` (and same wallet). That keeps each strategy’s P&L correct and separate in the orders/trader base.

## Flow in short

1. FT produces a signal → `ft_orders`.
2. LT executor copies it to live → creates `lt_orders` and places a CLOB order.
3. The CLOB order is stored in `orders` with `lt_strategy_id` and `lt_order_id` set.
4. Resolution/redemption updates `lt_orders` (and related state); P&L is derived from `orders` filtered by `lt_strategy_id` (and wallet) so it’s correct per strategy.

## Where to see Live vs Forward Test

- **Forward Test:** `/ft` and `/ft/[id]` – paper wallets and performance.
- **Live:** `/lt` and `/lt/[id]` – real strategies; “Create Live” from an FT wallet, or “Live” badge on an FT row that has a linked Live strategy.

Strategies are created **under the user that is logged in**; the Polymarket wallet is that user’s connected wallet unless you override it when creating the strategy.
