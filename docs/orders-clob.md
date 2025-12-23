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

These influence outcomes:
- GTC: stays on book until filled or canceled.
- GTD: expires at a time limit.
- FOK: fill completely or cancel immediately.
- FAK: fill what you can, cancel the rest immediately.

## Non-goals

We do not model trades/fills here, do not compute P&L, and do not infer positions.
