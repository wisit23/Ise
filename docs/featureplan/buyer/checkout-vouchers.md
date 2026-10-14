# One voucher per checkout item

The checkout page places a voucher popup button under each product. Each order has
one campaign ID; multiple items can use different vouchers in one checkout.
The existing wallet rule remains: one claimed voucher can be held by one order
only. A code selected by another item is omitted from that item's choices.

`PATCH /api/orders/:id/voucher` accepts `{campaignId: "..."}` or `{campaignId: null}`
to remove a voucher. Authenticated customer ownership and buyer commerce capability
are required. Edits are allowed only on an unexpired, reserved order awaiting payment,
before a checkout session is created. Auction orders are excluded.

The service locks the order while obtaining a server quote and changing its voucher.
Product service validates voucher ownership, availability, category, minimum price
and discount. Client-supplied prices are ignored. Prices use Decimal arithmetic.
Successful replacement releases the previous hold. Failed edits attempt to restore
the original hold and release the attempted new one under a reacquired row lock,
checking current ownership to avoid undoing a concurrent successful retry.

Per-item prices and campaign codes survive reload through the existing Order history
projection. The checkout total sums item prices; no checkout-wide code is accepted.
Selecting a radio option in the popup changes a local draft only. Confirming applies
it; cancel, Escape or backdrop dismissal discard the draft. Rejected edits retain the
original order price and show the server's error inside the popup. Checkout confirmation
is disabled while a dialog is open or an edit is pending.

Address management also opens a popup within checkout, using the existing Auth address
APIs to add, edit, delete and set the default address. There is no profile-page navigation.
Saving refreshes the list and selects the saved address. Removing the selected address
selects the remaining default/first address, or clears selection if none remain. Deletion
requires an explicit confirmation inside the same dialog.

Tests cover per-item edits, clear/idempotent requests, ownership and frozen/expired
orders, quote validation, compensation, two-item totals, pending/error UI states,
checkout/payment regression and real PostgreSQL persistence with rollback fixtures.
