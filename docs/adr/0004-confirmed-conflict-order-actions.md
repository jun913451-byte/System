# ADR 0004: Confirm Conflict-Related Order Actions One at a Time

- Status: Accepted
- Date: 2026-11-19

## Context

The prototype already detects order conflicts and has local demo endpoints for eligible order date changes and cancellations. The assistant previously had no order-operation authority, which left multi-order conflicts to be resolved manually in separate order pages. The user wants a dedicated conversation for cross-project conflicts, while conflicts contained in one trip remain in that trip's conversation.

Order operations can affect dates, travellers, costs, and other bookings. A broad confirmation such as “fix this conflict” does not identify what the assistant may change. Multi-order proposals can also become stale after the first order changes.

## Decision

- The conflict conversation may propose a single exact operation on a single identified order.
- A change proposal must include exact target values, such as the new travel or stay dates.
- The assistant executes only after the user explicitly confirms that exact proposal. Any correction invalidates it and requires a new proposal and confirmation.
- For multiple operations, execute one at a time. After each, reload affected orders and trips and reassess before proposing another.
- Cross-project conflicts use a dedicated conflict conversation and adjacent conflict-management view. In-project conflicts stay in their existing trip conversation.
- Unassociated orders continue through order detail and the notification centre; the assistant must not infer a project.
- This grants no authority to create orders, purchase products, or perform real supplier operations, payments, fees, or refunds. Confirmed actions only mutate local demo-order state.
- Server-side validation must independently verify the order's current state and eligibility when applying an approved proposal.

## Consequences

The exact action and target order remain reviewable before any local demo-order change. Each action is auditable as an individual user-approved step, and later proposals use refreshed facts. The demo cannot represent actual refunds or supplier acknowledgements; those remain user-handled.

The unified conversation, persistent action proposals, approval gate, and reassessment flow are accepted requirements but are not implemented by this decision record.
