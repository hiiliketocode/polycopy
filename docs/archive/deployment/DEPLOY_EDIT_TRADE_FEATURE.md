# Deploy: Edit Trade Feature

## What's New:

Added an **"Edit" button** to the expanded trade view on the profile page that allows users to:
- ✅ Edit entry price if they entered it wrong
- ✅ Edit amount invested if they made a mistake or added to their position
- ✅ Automatically recalculate ROI with the new values

## How It Works:

1. User expands a copied trade on their profile
2. Clicks the new **"Edit"** button (next to "Mark as Closed" and "Delete")
3. A modal appears with pre-filled values:
   - Entry Price (required)
   - Amount Invested (optional)
4. User updates the values and clicks "Save Changes"
5. Trade is updated in database and ROI is recalculated
6. Weighted average ROI is automatically updated

## Implementation Details:

### State Added:
```typescript
const [showEditModal, setShowEditModal] = useState(false);
const [tradeToEdit, setTradeToEdit] = useState<CopiedTrade | null>(null);
```

### Handler Function:
```typescript
handleEditTrade(updatedEntryPrice, updatedAmountInvested)
- Updates database via Supabase
- Recalculates ROI for user-closed trades (uses user_exit_price)
- Recalculates ROI for open trades (uses current_price)
- Updates local state
- Shows success/error toast
```

### UI Changes:
- Desktop: Added "Edit" button in expanded trade row (before "Mark as Closed")
- Mobile: Added "Edit" button in expanded trade card
- Modal: Similar to "Mark as Closed" modal with pre-filled values

## Files Modified:
- `app/profile/page.tsx` - Added edit functionality and modal

## Deploy Commands:

```bash
git add .

git commit -m "Add edit trade feature to profile page

Feature:
- Users can now edit entry price and amount invested for copied trades
- Edit button appears in expanded trade view (desktop & mobile)
- Modal pre-fills with existing values
- ROI automatically recalculates after edit
- Weighted average ROI updates accordingly

Use cases:
- Correct entry price if entered wrong
- Update amount invested if added to position
- Fix typos or mistakes in trade data

Implementation:
- Added handleEditTrade function
- Added Edit modal component
- Updates Supabase directly
- Recalculates ROI based on trade status (open vs closed)
- Shows success/error toast messages"

git push origin main
```

## Testing After Deploy:

1. Go to profile page
2. Expand any copied trade
3. Click "Edit" button
4. Update entry price and/or amount invested
5. Click "Save Changes"
6. Verify:
   - ✅ Trade updates successfully
   - ✅ ROI recalculates correctly
   - ✅ Weighted average ROI updates
   - ✅ Success toast appears
   - ✅ Modal closes

---

**Status:** ✅ Ready to deploy!
