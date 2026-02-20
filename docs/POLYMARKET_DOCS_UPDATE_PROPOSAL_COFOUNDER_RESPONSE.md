# Cofounder Response: Polymarket API Upgrade Docs (POLYMARKET_DOCS_UPDATE_PROPOSAL)

**Re:** POLYMARKET_DOCS_UPDATE_PROPOSAL.md  
**Purpose:** Comments and questions so we can align before implementing.

---

## 1. Feed card polling — need the big picture first

### Rate limits and monitoring

- **Have we actually studied** our current rate limits, how close we are to them, and how we scale?
- We need **some kind of tracking** to understand our API activity, and **alerts when we’re getting close** to rate limits. This is a real production risk.
- Is there a **tool we can use** — e.g. a chart and alert — that shows where we sit vs. Polymarket’s limits? We should have that before we trade off UX for rate-limit safety.

### 250ms vs 1 second

- **1 second is okay**, but **250ms is better** — it feels more live. And it’s only for the trades that show up on the card as the user views them.
- The proposal says moving to 1s gives a **4x reduction for that one function**. We don’t know how that affects **overall** API usage.
- We need to understand the **big picture** of our API usage and the impact of these changes before we can say whether **slower card responsiveness** is worth it for API health. Right now we’re looking at individual items; we need the full picture.

### Expanded card (only one at a time?)

- **Not sure what limiting to one expanded card achieves**, and it could hurt UX:
  - When I’m making a trade I want to **see it while it’s filling** — I need that card expanded.
  - When I scroll the feed I like seeing **which trades I made** because those are the ones I have expanded.
  - Often I **create an order and then move on** while it fills, and come back to it. So I need that card to stay expanded.
- **Alternative that might work better:**  
  - **Once you send a trade to market**, that card starts polling for **fill information** (live price / fill status).  
  - **If you don’t place an order in an expanded card**, then when you expand another one, the previous one collapses.  
  So: one expanded card at a time *unless* you’ve placed an order in one — then that one stays expanded so you can watch the fill. Best of both worlds.
- **Same behavior should apply to bots**, not just manual trading — wherever we show “expanded” or active order state.

**Ask for the proposal:** Add or reference: (1) rate-limit monitoring / chart / alert, and (2) big-picture API usage so we can see the impact of the 250ms→1s change and the expanded-card change in context.

---

## 2. Gas-free / Builder Relayer — need clarity; auto-redeem is the priority

- **I don’t really understand it.** I’ve never needed gas for anything I’ve done on Polymarket. What is it, and **if we offer it “for free,” do we pay?** I can’t comment properly until I understand the gas fees and who pays.
- **Current scope:** We’re not doing new wallet deployments, we’re not doing token approval transactions in the way described, and we’re **not offering redemption** today. Redemption is something we might want to do — I asked Poly and couldn’t find a way.

### Auto-redeem — separate item to investigate

- **Auto-redeem would be really useful.** The quicker we can get users’ **resolved positions back into their cash wallet**, the more they can trade and the more effective the bots are.
- **Today:** The user has to manually go to Polymarket and redeem to get cash back, or their wallets go empty and stop trading. That’s a real UX issue.
- **Ask:** Can we set up something on a **cadence** to redeem on users’ behalf so the cash goes back? This should be a **separate item to investigate** (and might tie into the relayer or other Polymarket APIs). It will make the bots meaningfully more effective.

**Ask for the proposal:** (1) Add a short “who pays for gas when we use the relayer?” and “what exactly is gas for in our flows?” (2) Add **Auto-redeem** as a separate investigation item and call out the impact on bot effectiveness.

---

## 3. Taker fees and RevShare — separate discussions

- We **probably need to disclose** the new taker fees. I don’t know how Polymarket is disclosing them or **how they’re applied** on the trade (e.g. you put in a $1 order and Polymarket shaves off a bit).
- **P&amp;L accuracy** is a big deal — we definitely need to get that right.
- **RevShare:** Definitely interested. We need a **separate discussion** about that (and how it fits with any Polycopy fee).

**Ask for the proposal:** Keep fee verification and P&amp;L accuracy; add that we’ll have separate discussions on (1) disclosure/UX for taker fees and (2) RevShare.

---

## 4. FT sync and rate limits — big picture and max bots

- We’re going to be **adding new strategies**, so we need to think about **capacity** for FT sync and anything else that hits the Data API.
- This ties into the **big question:** What is our **total rate-limit bandwidth**, and **how close are we**? As we build or modify anything, we need to understand the impact on rate limits. Right now we’re looking at individual items; until we have the big picture it’s harder to architect.
- **Example:** What’s the **maximum number of live bots** we can have? The way it’s architected, **they should all be using the same polling** — one call that gets all the trades, then we analyze locally which trades apply to which bot. They shouldn’t each be polling individually. So we need to understand how that **single shared poll** fits within rate limits, and how many bots we can support with that model.
- Same idea for **Gamma** (and any “quiet market” or other endpoints): are we doing something that hits them in a shared way, and how does that fit in the picture?

**Ask for the proposal:** Include in the “big picture” section: (1) shared polling architecture (one poll, local dispatch to bots), (2) how that maps to Polymarket/Data API and Gamma rate limits, and (3) guidance on max number of live bots we can safely run. Add the FT sync concurrency note (e.g. reducing from 25 to 15 if we add more strategies) in that context.

---

## 5. Other

- **Keep ESPN** (no switch to Polymarket Sports WebSocket). Include that in the proposal if it isn’t already.
- **Heartbeat (Item 2 in proposal):** No specific comment — agree it’s critical if we have resting orders; need to implement and clarify per-key vs per-session.

---

## Summary for the proposal doc

| # | Cofounder ask |
|---|----------------|
| 1 | **Rate limits:** Add or reference monitoring (chart + alert) for API usage vs limits; document “big picture” of API usage so we can evaluate 250ms→1s and single-expanded-card in context. |
| 2 | **Expanded card:** Prefer “one expanded at a time unless user placed an order in one (then that one stays expanded for fill)”; same idea for bots. |
| 3 | **Gas/relayer:** Clarify what gas is in our flows, who pays when we use the relayer, and add **Auto-redeem** as a separate investigation item (cadence to redeem on users’ behalf → more trading, more effective bots). |
| 4 | **Fees:** Separate discussions for taker-fee disclosure and RevShare; keep P&amp;L accuracy and fee verification in scope. |
| 5 | **Big picture:** Include shared polling (one poll → local dispatch to bots), Gamma/Data API usage, and max live bots we can support; tie FT sync concurrency to this. |
| 6 | **Keep ESPN.** |

Thanks — once these are reflected we can align on implementation order.
