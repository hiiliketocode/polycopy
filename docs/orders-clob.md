# CLOB Orders (public.orders)

orders stores Polymarket CLOB order intent and lifecycle state.
It is not positions, not the public trade tape, and not P&L.

## One order = one row

Each CLOB order_id maps to exactly one row.
As fills happen, the same row is updated; we never insert duplicates.

## Partial fills

Partial fills are derived, not stored as a status:
- status = open
- filled_size > 0
- filled_size < size

## Canceled vs expired

canceled and expired are distinct terminal states and must remain separate.

## Time in force

time_in_force comes from the CLOB response and is stored as-is:
- GTC
- GTD
- FOK
- FAK

Order types:
- FOK: A Fill-Or-Kill order is a market order to buy (in dollars) or sell (in shares) shares that must be executed immediately in its entirety; otherwise, the entire order will be cancelled.
- FAK: A Fill-And-Kill order is a market order to buy (in dollars) or sell (in shares) that will be executed immediately for as many shares as are available; any portion not filled at once is cancelled.
- GTC: A Good-Til-Cancelled order is a limit order that is active until it is fulfilled or cancelled.
- GTD: A Good-Til-Date order is a type of order that is active until its specified date (UTC seconds timestamp), unless it has already been fulfilled or cancelled. There is a security threshold of one minute. If the order needs to expire in 90 seconds the correct expiration value is: now + 1 minute + 30 seconds. See https://docs.polymarket.com/developers/CLOB/orders/create-order

## Non-goals

We do not model trades/fills here, do not compute P&L, and do not infer positions.
