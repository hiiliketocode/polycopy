#!/usr/bin/env python3
from google.cloud import bigquery
from datetime import datetime

client = bigquery.Client(project='gen-lang-client-0299056258')
query = """
SELECT 
  t.timestamp,
  t.side,
  t.price,
  t.shares_normalized as size,
  m.title as market_title,
  t.token_label,
  t.price * t.shares_normalized as trade_value
FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m ON t.condition_id = m.condition_id
WHERE LOWER(t.wallet_address) = '0x54b56146656e7eef9da02b3a030c18e06e924b31'
  AND LOWER(m.title) LIKE '%seattle seahawks%super bowl 2026%'
ORDER BY t.timestamp ASC
"""
results = client.query(query).result()
print('Trade History for Seattle Seahawks Super Bowl 2026:')
print('='*100)
print(f'{"Timestamp":<20} {"Side":<6} {"Outcome":<6} {"Price":<10} {"Size":<15} {"Value":<12}')
print('-'*100)
for row in results:
    ts = row['timestamp']
    if isinstance(ts, (int, float)):
        ts = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M')
    print(f'{str(ts):<20} {row["side"]:<6} {row["token_label"]:<6} {row["price"]:<10.4f} {row["size"]:<15.4f} ${row["trade_value"]:<11.2f}')
