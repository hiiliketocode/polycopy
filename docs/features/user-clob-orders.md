# User CLOB Orders

This document describes the authenticated premium user CLOB order schema and its scope.

## user_wallets

`public.user_wallets` represents a connected wallet identity for a Polycopy user with premium CLOB access. It links `auth.users.id` to an EOA wallet and/or proxy wallet used by Polymarket.

## user_clob_orders

`public.user_clob_orders` stores the canonical CLOB order lifecycle for authenticated premium users. It contains both open (resting) orders and closed history (filled/canceled/expired), backed by the full raw CLOB payload in `raw` for future-proofing.

## Open Orders Definition

“Open orders” refers only to resting orders on the CLOB that are still live (open/partial). It does not include positions or resolved outcomes.

## Positions Are Separate

Positions are tracked separately and may exist without any open orders (for example, after fills have completed or an order has been canceled).
