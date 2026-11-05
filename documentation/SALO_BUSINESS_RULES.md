# SALO — Business Rules, Payment Policies, and Edge Case Handling

**Project:** SALO — Where Good Food Brings Us Together  
**Document Type:** Master Business Rules and Financial Requirements  
**Scope:** Customer, Restaurant Owner, Rider, Admin, Payments, Reservations, Discounts, and Platform Operations  
**Status:** Proposed — For Review and Approval  
**Currency:** Philippine Peso (PHP / ₱)  
**Primary Timezone:** Asia/Manila

---

# PART I — CORE BUSINESS PRINCIPLES

## 1. Purpose

This document defines how SALO should operate when customers, restaurants, riders, and administrators interact with the platform.

It covers normal business operations and exceptional situations that could result in:

- Incorrect payments.
- Duplicate charges.
- Incorrect restaurant payouts.
- Incorrect rider earnings.
- Refund disputes.
- Reservation cancellation disputes.
- Discount abuse.
- Delivery failures.
- Restaurant or rider misconduct.
- Inconsistent order statuses.
- Financial discrepancies.
- Unauthorized account actions.

The purpose is to establish predictable behavior before implementation.

All four SALO modules must follow the same authoritative business rules.

## 2. Fundamental Rules

### 2.1 Every Transaction Must Be Traceable

Every financial transaction must have a unique reference.

SALO must be able to determine:

- Who paid.
- What was purchased.
- Which restaurant received the order.
- Which rider handled the delivery, if applicable.
- How much was charged.
- How much was discounted.
- Which party funded the discount.
- How much was charged for delivery.
- How much SALO earned.
- How much the restaurant should receive.
- Whether the transaction was refunded.
- Whether the restaurant or rider has already been paid.

### 2.2 Never Assume Payment Success

A customer returning from a payment page does not automatically mean payment succeeded.

A screenshot is not proof of successful payment.

A payment button being clicked is not proof of payment.

Only a verified payment result from the authorized payment provider or an approved cash-collection workflow can establish the payment status.

### 2.3 Preserve Financial History

Once an order, reservation, or payment has been confirmed, its financial breakdown must be preserved.

Changing current delivery fees, restaurant commissions, or discounts must not silently change historical transactions.

### 2.4 Separate Business Transactions

The following are different financial events:

- Customer payment.
- Restaurant sales.
- Platform commission.
- Delivery fee.
- Rider compensation.
- Customer tip.
- Discount funding.
- Reservation deposit.
- Reservation service fee.
- Refund.
- COD collection.
- COD remittance.
- Restaurant payout.
- Rider payout.

They must not be combined into one generic amount.

### 2.5 Never Lose Money Through a Status Change

Changing an order or reservation status must not independently create a financial refund, charge, or payout without a corresponding validated financial operation.

For example:

Changing an order to `cancelled` does not automatically prove that a refund was completed.

The refund must have its own record and payment-provider result.

---

# PART II — MULTI-RESTAURANT CHECKOUT

## 3. One Checkout, Multiple Restaurant Orders

SALO allows customers to purchase from multiple restaurants in one checkout experience.

However, each restaurant must have its own order and financial allocation.

### 3.1 Recommended Structure

Use three levels:

**Parent Checkout / Order Group**

Represents the customer's overall checkout.

**Restaurant Sub-Orders**

Each restaurant receives its own independent order.

**Payment and Financial Records**

Connect the customer payment to the relevant sub-orders and their financial allocations.

Example:

A customer orders from three restaurants.

| Restaurant | Food subtotal | Delivery fee |
|---|---:|---:|
| Restaurant A | ₱350 | ₱50 |
| Restaurant B | ₱500 | ₱65 |
| Restaurant C | ₱250 | ₱45 |
| **Total** | **₱1,100** | **₱160** |

Before other fees and discounts, the customer pays ₱1,260.

SALO creates:

- One parent checkout.
- One sub-order for Restaurant A.
- One sub-order for Restaurant B.
- One sub-order for Restaurant C.
- One payment attempt or an appropriate collection of payment transactions.
- Separate restaurant financial allocations.

### 3.2 Independent Restaurant Statuses

Each sub-order must have its own lifecycle.

For example:

| Restaurant | Status |
|---|---|
| A | Accepted |
| B | Rejected |
| C | Preparing |

Restaurant B's rejection must not automatically cancel Restaurants A and C.

The customer should receive a clear update about the affected restaurant.

### 3.3 Parent Order Status

The parent order status should be derived from its sub-orders.

Possible states:

- Pending Payment.
- Payment Confirmed.
- Awaiting Restaurant Responses.
- Partially Accepted.
- Confirmed.
- Partially Completed.
- Completed.
- Partially Cancelled.
- Cancelled.
- Refund Processing.
- Partially Refunded.
- Refunded.
- Payment Disputed.

A parent order must never be marked fully completed while one of its restaurant sub-orders remains unresolved.

### 3.4 One Payment, Multiple Restaurant Outcomes

If the customer paid the full amount but one restaurant rejects its order:

- Preserve the accepted orders.
- Calculate the rejected restaurant's refundable amount.
- Preserve applicable non-refundable provider charges only when legally and contractually permitted and clearly disclosed.
- Refund the affected amount through the original payment method when supported.
- Update the parent payment and sub-order financial records.
- Notify the customer.

If two restaurants reject their orders, both must be handled independently.

### 3.5 Different Delivery Addresses

Each restaurant sub-order must have its own delivery address snapshot.

For example:

- Restaurant A → Home.
- Restaurant B → Office.
- Restaurant C → Another saved address.

A parent checkout must not assume all restaurant sub-orders use the same destination.

Each destination must be validated against that restaurant's delivery coverage.

### 3.6 Different Riders

Different restaurant sub-orders may be assigned to different riders.

The system must not assume one rider will collect everything.

Each delivery must retain its own:

- Rider assignment.
- Pickup location.
- Delivery destination.
- Delivery fee allocation.
- Delivery status.
- Proof of delivery.
- Rider earnings.
- COD collection responsibility.

### 3.7 Restaurant Unavailable During Checkout

If a restaurant closes, becomes unavailable, or stops accepting orders during checkout:

- Revalidate the restaurant before order creation.
- Do not create an invalid sub-order.
- Explain which restaurant is unavailable.
- Recalculate the customer's total.
- Require customer confirmation if the total changes.

Never charge the customer for a restaurant order that was not validly created.

### 3.8 Menu Item Becomes Unavailable

If a menu item becomes sold out after the customer adds it to the cart:

- Revalidate item availability before checkout.
- If it is unavailable, prevent the affected sub-order from being submitted.
- Offer the customer the option to remove or replace the item.
- Recalculate discounts and fees.
- Do not silently substitute a different product.

If the restaurant reports that the item is unavailable after accepting the order, use the approved partial cancellation or substitution process.

A substitution that changes the price or product must require customer approval.

---

# PART III — PAYMENT COLLECTION AND PROCESSING

## 4. Supported Payment Methods

SALO may support the following methods, subject to payment-provider availability and approval:

- Cash on Delivery.
- GCash.
- Maya.
- Online bank payments.
- Debit and credit cards.
- Other approved digital payment methods.

Payment methods must be enabled or disabled according to actual provider integration status.

The interface must never display an online payment method as available if the backend cannot process and verify it.

## 5. Recommended Payment Architecture

SALO should integrate with an authorized payment service provider.

The provider should support the required combination of:

- Online payment collection.
- Payment status verification.
- Refunds.
- Partial refunds.
- Transaction references.
- Webhooks.
- Reconciliation.
- Appropriate merchant or marketplace settlement arrangements.

### 5.1 Marketplace Payment Arrangement

Before selecting a provider, SALO must determine the appropriate legal and commercial arrangement.

Possible models include:

**Model A — Provider-Managed Marketplace Settlement**

The payment provider supports the marketplace arrangement and routes the relevant funds to the appropriate merchant accounts.

**Model B — Platform Collection and Merchant Payout**

The platform receives customer payments through an approved arrangement and later settles restaurant and rider obligations.

This model requires careful review of regulatory, merchant-acquiring, fund-handling, and contractual responsibilities.

**Model C — Separate Merchant Payments**

Each restaurant order is charged separately through the relevant merchant payment arrangement.

This may create more than one payment transaction for the customer.

SALO should prefer a single checkout experience where possible, but it must not pretend that separate payment transactions are one successfully settled transaction.

### 5.2 Important Provider Requirement

A provider's ordinary payment API does not automatically mean it supports multi-restaurant marketplace settlement.

Before implementation, verify:

- Whether marketplace split payments are supported.
- Whether multiple merchants can receive funds.
- Whether partial refunds can be allocated to different merchants.
- Who is liable for chargebacks.
- Whether merchant onboarding and KYC are supported.
- Whether the provider supports the required Philippine payment methods.
- Whether payout timing can be configured.
- Whether funds can be held or delayed under the approved arrangement.

Do not assume that a provider supports these features simply because it supports GCash, Maya, or card payments.

## 6. Payment Statuses

Payment records should use explicit statuses.

Possible statuses:

- Pending.
- Requires Customer Action.
- Processing.
- Authorized.
- Partially Captured.
- Paid.
- Failed.
- Declined.
- Expired.
- Voided.
- Partially Refunded.
- Refunded.
- Disputed.
- Reversed.

The exact statuses must correspond to the integrated provider's actual transaction states.

### 6.1 Payment Success

An order requiring online payment should not be released for normal fulfillment until the backend confirms successful payment according to the provider's integration.

### 6.2 Payment Pending

If a payment remains pending:

- Show the customer that payment is still being processed.
- Prevent duplicate payment attempts where the original attempt may still succeed.
- Do not release the order prematurely.
- Reconcile the transaction using the provider's status inquiry or webhook.

### 6.3 Payment Failed

If payment fails:

- Do not mark the order as paid.
- Do not send the restaurant an accepted paid order.
- Allow the customer to retry using a supported method.
- Preserve the failed attempt for troubleshooting.

### 6.4 Customer Closes the Payment Page

If the customer closes the payment page:

- Do not immediately assume payment failed.
- Check the authoritative transaction status.
- If successful, update the order.
- If still pending, show the pending state.
- If failed or expired, allow an appropriate retry.

### 6.5 Duplicate Payment

If a customer clicks Pay multiple times:

- Use idempotency keys or equivalent provider-supported protection.
- Ensure only the intended payment is associated with the order.
- Detect duplicate successful charges.
- Automatically flag duplicate payments for review.
- Refund confirmed accidental duplicates through the original payment method.

### 6.6 Payment Provider Timeout

If the payment provider does not respond:

- Mark the attempt as pending or unknown, as appropriate.
- Do not create another charge without checking the previous attempt.
- Reconcile using the provider transaction reference.
- Update the customer once the final result is known.

### 6.7 Delayed Payment Confirmation

If the customer is charged but SALO receives the confirmation late:

- Reconcile the transaction.
- Do not create duplicate orders.
- If the order is still valid, continue processing.
- If the order can no longer be fulfilled, begin the applicable refund process.

### 6.8 Webhook Repetition

Payment providers may send the same webhook more than once.

SALO must process provider events idempotently.

A repeated event must not create:

- A second order.
- A second refund.
- A second payout.
- Duplicate restaurant earnings.
- Duplicate rider earnings.

### 6.9 Payment Amount Mismatch

If the provider-confirmed amount differs from the authoritative checkout amount:

- Do not mark the order as fully paid.
- Flag the transaction for reconciliation.
- Investigate whether the discrepancy came from a discount, fee, currency, or payment integration error.
- Correct it through a controlled financial adjustment or refund.

---

# PART IV — REFUNDS AND CANCELLATIONS

## 7. General Refund Principles

Refunds must be evaluated based on:

- Who initiated the cancellation.
- When the cancellation occurred.
- Whether the restaurant accepted the order.
- Whether preparation started.
- Whether the rider collected the order.
- Whether the service was delivered.
- Whether the customer received what was promised.
- Whether the issue was caused by the customer, restaurant, rider, or SALO.

A refund is a financial transaction, not simply an order status.

## 8. Restaurant-Initiated Cancellation

Examples:

- Restaurant is unexpectedly closed.
- Restaurant cannot fulfill the order.
- All items are unavailable.
- Restaurant has an operational emergency.

Recommended handling:

1. Restaurant reports the reason.
2. SALO records the cancellation.
3. The affected sub-order is cancelled.
4. The customer is notified.
5. The affected amount is calculated.
6. The appropriate refund is initiated.
7. The refund result is recorded.

A restaurant must not be allowed to keep the payment for goods it did not provide.

## 9. Customer-Initiated Cancellation

Cancellation eligibility should depend on the order's progress.

Recommended general stages:

| Order stage | Recommended handling |
|---|---|
| Before restaurant acceptance | Allow cancellation; release or refund applicable payment |
| Accepted but preparation not started | Apply the disclosed cancellation policy |
| Preparation started | Review the actual preparation and cancellation conditions |
| Ready for pickup | Restrict ordinary cancellation; offer support review |
| Rider picked up order | Apply the approved late-cancellation and return policy |
| Out for delivery | Require support review for exceptional cases |
| Delivered | Handle as a complaint, dispute, or refund request rather than an ordinary cancellation |

These stages are proposed operational rules. The final consumer policy must be reviewed against applicable Philippine law and the actual transaction terms.

## 10. Rider or Delivery-Initiated Problems

Examples:

- Rider accident.
- Vehicle breakdown.
- Incorrect pickup.
- Lost order.
- Damaged order.
- Customer cannot be located.
- Delivery area becomes unsafe.

The system should allow Admin to decide whether to:

- Reassign another rider.
- Return the order to the restaurant.
- Cancel the delivery.
- Refund the customer.
- Resolve the case through another approved procedure.

A rider must not be financially penalized automatically simply because a delivery failed.

The circumstances and evidence must be reviewed.

## 11. Partial Refunds

A customer may receive only part of the order.

Examples:

- One item is missing.
- One item is incorrect.
- One restaurant sub-order is cancelled.
- An item is damaged.
- A restaurant cannot provide one selected customization.

SALO must support partial refunds.

The refund must be associated with:

- The parent order.
- The affected restaurant sub-order.
- The relevant item or fee.
- The refund reason.
- The authorized amount.
- The payment-provider refund reference.

The total amount refunded must never exceed the amount successfully collected.

## 12. Refund Allocation

For a multi-restaurant order, calculate the refund against the affected sub-order.

Example:

- Restaurant A: ₱400.
- Restaurant B: ₱600.
- Restaurant C: ₱300.

Restaurant B rejects its order.

The refund should be based on Restaurant B's eligible paid amount, not the entire parent order.

If a parent-level discount was applied, the system must recalculate the actual amount paid for the affected sub-order.

The customer should receive a clear explanation of the refund calculation.

## 13. Refund Timing

SALO should distinguish:

- Refund request created.
- Refund approved.
- Refund submitted to provider.
- Refund processing.
- Refund successful.
- Refund failed.
- Refund requiring manual intervention.

The platform must not promise that money will immediately appear in the customer's bank or wallet.

The actual crediting time depends on the provider and financial institution.

## 14. Refund After Restaurant Payout

If a restaurant has already received its payout and a valid refund is later required:

- Create a financial adjustment against the restaurant.
- Record the reason.
- Link it to the original transaction.
- Apply the approved recovery method.
- Preserve the original payout history.

Possible recovery methods:

- Deduction from the next settlement.
- Adjustment against a reserve, if contractually permitted.
- Direct reimbursement through an approved process.
- Platform-funded refund where the platform is responsible.

Never silently rewrite an already completed payout.

## 15. Chargebacks and Payment Disputes

If a customer disputes a card or digital payment:

- Record the provider dispute reference.
- Preserve the order and delivery evidence.
- Preserve payment confirmation.
- Preserve customer communications.
- Preserve proof of delivery.
- Notify authorized Finance personnel.
- Record the dispute outcome.

SALO must distinguish a chargeback from an ordinary customer refund.

A successful chargeback must update the relevant financial records without deleting the original transaction.

---

# PART V — TABLE RESERVATIONS AND RESERVATION PAYMENTS

## 16. Reservation Financial Structure

SALO must distinguish the following:

1. Reservation deposit.
2. Reservation service fee.
3. Reservation cancellation fee.
4. Prepaid dining amount.
5. Optional add-on or advance food order.

These must not be treated as one generic reservation fee.

### 16.1 Reservation Deposit

A deposit is money paid in advance toward a future dining transaction.

Depending on the restaurant's disclosed policy, it may:

- Be deducted from the final dining bill.
- Be applied to a minimum-spend requirement.
- Be refundable under specific conditions.
- Be partially retained when a permitted cancellation condition occurs.

### 16.2 Reservation Service Fee

A reservation service fee is a separate charge for arranging or providing a reservation service.

It must be clearly disclosed:

- Who receives it.
- What service it covers.
- Whether it is refundable.
- Under what circumstances it may be retained.

### 16.3 Advance Food Payment

If a customer pays for food while reserving a table, that amount must be recorded separately from the reservation deposit and service fee.

This allows the system to refund or adjust the food payment independently if the restaurant cannot provide the reserved meal.

## 17. Customer Cancels a Fully Paid Reservation

This is an important SALO scenario.

Example:

A customer pays ₱1,500:

- ₱1,300 reservation deposit.
- ₱200 disclosed reservation service fee.

The customer later cancels.

Recommended process:

1. Retrieve the exact reservation terms accepted at booking.
2. Determine when the customer cancelled.
3. Determine which fees are eligible for retention.
4. Calculate the refundable balance.
5. Show the customer the breakdown.
6. Submit the refund.
7. Record the result.

If the agreed and legally permissible policy allows the ₱200 service fee to be retained, the customer receives ₱1,300.

If the policy permits an additional disclosed cancellation charge, the system may apply it only within the approved policy and legal limits.

**Important:** A fee must not be made non-refundable merely by placing the words "non-refundable" beside it. Its nature, disclosure, contractual basis, and compliance with applicable consumer protections must be reviewed.

## 18. Customer Cancels Before the Free Cancellation Deadline

If the restaurant offers free cancellation until a specified deadline:

- Cancellation within the allowed period should follow the stated refund policy.
- Refundable deposits should be returned.
- Any separately disclosed non-refundable fee should be evaluated according to its valid terms.
- The customer should receive a refund breakdown.

The cancellation deadline and timezone must be explicit.

## 19. Customer Cancels After the Cancellation Deadline

If the restaurant has a valid late-cancellation policy:

- The system evaluates the deadline.
- The configured cancellation charge is calculated.
- The refundable amount is determined.
- The customer is shown the result before final cancellation where possible.
- The system records the policy version that applied.

A full deposit forfeiture should not be assumed to be automatically appropriate for every restaurant or situation.

## 20. Restaurant Cancels the Reservation

Examples:

- Restaurant unexpectedly closes.
- Restaurant cannot accommodate the customer.
- Restaurant double-booked the table.
- Restaurant cancels the booking for its own operational reasons.
- The selected dining area becomes unavailable.

Recommended handling:

- Cancel the reservation.
- Refund all amounts that should be returned because the restaurant failed to provide the booked service.
- Do not charge the customer a cancellation penalty for the restaurant's failure.
- Notify the customer.
- Preserve the restaurant's cancellation reason and history.

Any separate service fee should be evaluated according to the actual service provided, the disclosed terms, and applicable law.

## 21. Customer Does Not Arrive

The system should support a No-Show workflow.

Possible process:

1. Reservation time passes.
2. Restaurant marks the customer as arrived, seated, cancelled, or absent.
3. If absent, restaurant may mark No-Show after the configured grace period.
4. SALO records the time and responsible staff member.
5. The reservation policy determines any permitted financial consequence.
6. The customer can submit a dispute if the record is incorrect.

A restaurant must not mark a customer as No-Show before the configured deadline.

## 22. Restaurant Does Not Honor the Reservation

Examples:

- Customer arrives, but no table is available.
- Restaurant is closed despite accepting the booking.
- Restaurant refuses to honor the reservation without a valid reason.
- Restaurant cannot provide the reserved service.

Recommended handling:

- Allow the customer to report the incident.
- Preserve reservation confirmation.
- Review restaurant activity.
- Refund applicable payments.
- Escalate repeated incidents.
- Record the resolution.

## 23. Reservation Time Changes

If the customer requests a new date or time:

- Check availability again.
- Revalidate the table.
- Recalculate any applicable fee or deposit.
- Preserve the original reservation record.
- Record the new schedule.
- Notify the restaurant.

A changed reservation must not create duplicate payment collection.

## 24. Restaurant Changes Reservation Pricing

If a restaurant changes its deposit or reservation fee after a customer has already booked:

- Existing confirmed reservations keep the accepted pricing.
- New reservations use the new configuration.
- Changes must not silently increase the customer's confirmed payment obligation.

## 25. Double Booking

The backend must prevent two confirmed reservations from occupying the same table for overlapping time periods, subject to the restaurant's actual table and scheduling configuration.

Reservation availability must be checked transactionally.

If two customers attempt to reserve the same table at nearly the same time:

- Only one valid reservation may be confirmed.
- The other customer receives an unavailable result.
- Any payment authorization or charge must be handled appropriately.
- The losing reservation must not remain falsely confirmed.

---

# PART VI — DISCOUNTS, VOUCHERS, AND PROMOTIONS

## 26. Discount Ownership

SALO must distinguish:

- Platform-funded discounts.
- Restaurant-funded discounts.
- Jointly funded discounts.
- Payment-provider-funded promotions, if supported.

The funding source must be stored with each applied discount.

This is essential for accurate restaurant payouts and platform reports.

## 27. Discount Types

SALO may support:

- Percentage discounts.
- Fixed-amount discounts.
- Free delivery.
- Reduced delivery fee.
- First-order discounts.
- Minimum-spend promotions.
- Selected-restaurant promotions.
- Category-specific promotions.
- Time-limited discounts.
- Customer-specific vouchers.
- Loyalty rewards.
- Birthday promotions.
- Reservation promotions.
- Bundle discounts.

## 28. Discount Eligibility

Each promotion should have configurable conditions:

- Start and expiration dates.
- Applicable restaurants.
- Applicable locations.
- Minimum order amount.
- Maximum discount.
- Customer eligibility.
- Maximum uses.
- Per-customer usage limit.
- Order type.
- Payment method.
- Applicable items or categories.
- Funding source.

The customer must be able to see important eligibility conditions before completing checkout.

## 29. Multiple Discounts

SALO must have an explicit stacking policy.

Recommended default:

- One platform voucher per restaurant sub-order.
- Restaurant-funded menu discounts may coexist with a platform voucher when explicitly allowed.
- Free delivery promotions may coexist with food discounts if their conditions permit.
- Duplicate promotions of the same category should not automatically stack.

The final policy must be configurable.

### 29.1 Discount Stacking Example

A customer has:

- Restaurant A: 10% restaurant discount.
- Platform voucher: ₱50 off.
- Free delivery voucher.

The checkout engine must determine which promotions can coexist.

It must not apply the same promotion twice because the parent checkout contains multiple restaurant orders.

### 29.2 Multi-Restaurant Discount

A platform voucher may apply to:

- The entire parent checkout.
- Each eligible restaurant sub-order.
- Only one selected restaurant sub-order.

The promotion configuration must explicitly specify its scope.

For a parent-level discount, SALO must allocate the discount fairly across eligible sub-orders using a documented formula.

## 30. Discount Allocation

Example:

Restaurant A subtotal: ₱400.

Restaurant B subtotal: ₱600.

A ₱100 platform voucher applies to the combined ₱1,000 food subtotal.

Proportional allocation:

- Restaurant A receives ₱40 discount allocation.
- Restaurant B receives ₱60 discount allocation.

If the discount is platform-funded, the platform bears the corresponding expense.

If it is restaurant-funded, the restaurant's settlement must reflect its allocated contribution.

If it is jointly funded, the allocation must be split according to the agreed funding ratio.

### 30.1 Rounding

When allocating percentage discounts or shared discounts:

- Use decimal-safe monetary calculations.
- Define the currency precision.
- Allocate rounding differences deterministically.
- Ensure the sum of allocations equals the exact parent discount.
- Never lose or create money because of rounding.

## 31. Discount and Cancellation

If one restaurant sub-order is cancelled after a parent-level discount was applied:

- Recalculate the affected discount allocation.
- Determine whether remaining sub-orders still qualify.
- Do not silently charge the customer an additional amount.
- Refund the eligible amount.
- Preserve the original discount and adjustment history.

A completed transaction must retain the discount that was actually applied at the time of checkout.

## 32. Discount Abuse

Possible abuse cases:

- Multiple accounts created to claim first-order vouchers.
- Repeated use of a single-use code.
- Staff using private discounts.
- Restaurant owners abusing platform-funded promotions.
- Customers exploiting checkout retries.
- Sharing or reselling restricted codes.

SALO should use reasonable fraud detection and usage limits.

It should not automatically punish legitimate customers based only on device or network similarity.

Suspicious cases should be reviewed according to the approved policy.

---

# PART VII — DELIVERY FEES AND OTHER CHARGES

## 33. Delivery Fee Calculation

Delivery fees should be configurable by Admin.

Possible models:

- Fixed fee.
- Zone-based fee.
- Distance-based fee.
- Base fee plus distance.
- Special delivery fee.
- Promotional free delivery.

The calculation must use the appropriate restaurant pickup location and customer delivery address.

### 33.1 Multi-Restaurant Delivery Fees

Each restaurant sub-order must have a separately calculated delivery fee.

Example:

- Restaurant A → Home: ₱50.
- Restaurant B → Office: ₱65.

The customer must see the fees separately.

### 33.2 Multiple Restaurants, Same Address

Even if two restaurants deliver to the same address, SALO should not automatically assume the customer receives free or shared delivery.

Each delivery has its own pickup and fulfillment costs.

A combined or reduced fee may be offered as an explicit promotion.

### 33.3 Different Addresses

If each restaurant sub-order uses a different delivery address:

- Calculate each fee separately.
- Validate each service area separately.
- Assign delivery resources independently.
- Show each address in the checkout breakdown.

### 33.4 Delivery Fee Changes

A fee change must apply only to eligible new transactions or explicitly scheduled configurations.

Confirmed orders preserve the fee calculated at checkout.

## 34. Additional Fees

SALO may support:

- Customer service fee.
- Small-order fee.
- Reservation service fee.
- Delivery surcharge.
- Scheduled delivery fee.
- Other approved charges.

Every fee must show:

- Fee name.
- Amount or calculation.
- Responsible party.
- Reason for the charge.
- Applicability.
- Refundability, where relevant.

No hidden fees should be added after the customer confirms checkout.

## 35. Rider Earnings and Delivery Fee

The customer delivery fee is not automatically equal to rider earnings.

For example:

- Customer delivery fee: ₱70.
- Rider compensation: ₱55.
- Platform delivery-related margin: ₱15.

This is only an illustrative calculation.

SALO must separately record the actual delivery fee charged, rider compensation, and any platform-retained amount.

Tips must also be recorded separately and must not be treated as platform commission.

---

# PART VIII — CASH ON DELIVERY AND CASH RECONCILIATION

## 36. COD Basics

COD means the rider collects the required customer payment at delivery.

COD is not rider income.

The rider is collecting money on behalf of the applicable business/payment arrangement.

### 36.1 COD Multi-Restaurant Order

If a parent checkout contains three restaurant sub-orders, SALO must know how much cash is due for each sub-order.

If one rider delivers all three:

- The rider sees the total collection amount.
- The backend retains the separate restaurant allocations.
- The rider confirms the total cash received.
- SALO reconciles the amount against each sub-order.

If different riders deliver the orders:

- Each rider sees only the amount they are responsible for collecting.
- Each collection is recorded separately.
- The customer sees the amount due for each delivery.

### 36.2 Customer Pays Partially

If the customer gives less than the required amount:

- The rider must not mark full payment as collected.
- The system records the discrepancy.
- The rider contacts the appropriate support channel.
- Admin reviews the incident.

### 36.3 Customer Gives Excess Cash

The rider should record the actual amount received and any change returned, if the workflow supports it.

The final collected amount must match the order's required payment.

### 36.4 COD Collection Failure

If the customer refuses payment:

- The rider reports the issue.
- The delivery is not marked paid.
- Admin or the approved workflow determines the next action.
- Any return-to-restaurant process is recorded.

### 36.5 COD Remittance

SALO must maintain:

- COD collected.
- COD pending remittance.
- COD submitted.
- COD confirmed.
- COD discrepancy.
- COD adjustment.

Only authorized Admin personnel may confirm actual remittance.

### 36.6 COD Discrepancy

If the rider's recorded collection does not match the expected amount:

- Create a discrepancy record.
- Preserve delivery and payment evidence.
- Notify Finance/Admin.
- Investigate before adjusting the rider's financial records.

Do not silently deduct money from rider earnings.

---

# PART IX — ONLINE PAYMENTS AND PAYMENT PROVIDER FAILURES

## 37. GCash, Maya, and Online Bank Payments

SALO should integrate online payment methods through approved provider APIs.

The platform must not rely on uploaded screenshots as proof of payment.

### 37.1 Online Payment Pending

If an online payment is pending:

- Keep the transaction pending.
- Do not treat the order as paid.
- Recheck using the provider's official status mechanism.
- Notify the customer when the status changes.

### 37.2 Customer Sends a Payment Screenshot

If a customer uploads a payment screenshot:

- Store it only if there is an approved support workflow.
- Do not automatically change payment status to paid.
- Verify the actual provider transaction.
- Record the verification result.

### 37.3 Bank Transfer

If SALO later supports manual bank transfers:

- Require a unique reference.
- Require payment reconciliation.
- Prevent the same reference from being used for multiple orders.
- Keep the order pending until verification.
- Record the authorized reviewer.

A screenshot alone is not sufficient verification.

### 37.4 Payment Provider Outage

If the payment provider is unavailable:

- Display the payment method as temporarily unavailable.
- Preserve the customer's cart.
- Do not create false payment success.
- Allow another supported method.
- Reconcile any transaction that was in progress before the outage.

### 37.5 Authorization and Capture

Where supported, SALO may use payment authorization before capture.

This can be useful when restaurant acceptance must happen before final capture.

However, authorization is not the same as a successful captured payment.

The system must monitor authorization expiration and void unused authorizations.

Not all payment methods support authorization and capture.

---

# PART X — RESTAURANT SETTLEMENT AND PLATFORM COMMISSION

## 38. Restaurant Financial Breakdown

Each restaurant sub-order should have a clear financial statement.

Example:

| Item | Amount |
|---|---:|
| Food subtotal | ₱1,000 |
| Restaurant-funded discount | -₱100 |
| Platform-funded discount | -₱50 |
| Customer food amount after discounts | ₱850 |
| Restaurant commission | -₱85 |
| Restaurant payable before other adjustments | ₱765 |

The exact calculation depends on the approved commission basis and contract.

The delivery fee, customer service fee, rider compensation, taxes, and provider charges must be accounted for separately.

## 39. Commission Calculation

Admin may configure:

- Percentage commission.
- Fixed commission.
- Restaurant-specific commission.
- Category-specific commission.
- Approved promotional commission.

The system must preserve the commission rate used for each confirmed transaction.

Changing the current commission must not alter historical orders.

## 40. Restaurant Payout Schedule

SALO may support:

- Daily payouts.
- Weekly payouts.
- Scheduled settlement periods.
- Manual approved settlement.

The actual schedule must be established in the restaurant agreement.

### 40.1 Restaurant Payout Statement

Each restaurant should see:

- Gross food sales.
- Restaurant-funded discounts.
- Platform-funded discounts.
- Commission.
- Applicable deductions.
- Refunds.
- Adjustments.
- Tax-related withholding, where applicable.
- Net payable amount.
- Payout status.

### 40.2 Restaurant Payout Failure

If a payout fails:

- Keep it in a failed or pending state.
- Record the provider or bank reference.
- Notify Finance.
- Allow correction of the payout destination through an approved verification process.
- Retry only after confirming that the original payout did not succeed.

### 40.3 Restaurant Suspended Before Payout

If a restaurant becomes suspended:

- Preserve existing financial records.
- Hold or review unsettled amounts according to the agreement and legal requirements.
- Do not automatically confiscate valid earnings.
- Allow authorized Finance personnel to resolve outstanding liabilities and refunds.

---

# PART XI — FOOD ORDER AND RESERVATION INTERACTIONS

## 41. Food Order Linked to Reservation

A customer may reserve a table and order food in advance.

SALO must distinguish:

- Reservation payment.
- Reservation deposit.
- Food prepayment.
- Restaurant bill.
- Reservation service fee.

If the customer pays for food in advance, the restaurant should not charge the same food amount again.

### 41.1 Reservation Deposit Applied to Bill

If a reservation deposit is deductible from the final restaurant bill:

- Store the deposit amount.
- Store the agreed deduction rule.
- Show the deposit to restaurant staff.
- Deduct it from the final bill.
- Prevent duplicate deduction.

### 41.2 Customer Orders Additional Food

If the customer orders more food at the restaurant:

- The additional amount should be recorded separately.
- The original prepaid food amount should not be charged again.
- The restaurant can record the additional bill through the approved process.

### 41.3 Reservation Cancelled but Food Already Prepared

If food was prepaid and preparation started:

- Review the food cancellation terms.
- Determine which amounts are refundable.
- Distinguish the food transaction from the reservation service fee.
- Record the actual preparation and cancellation evidence.
- Apply only the approved and legally permissible charges.

### 41.4 Restaurant Cannot Honor Preordered Food

If the restaurant cannot provide prepaid food:

- Refund the affected food amount.
- Handle the reservation separately.
- Notify the customer.
- Preserve the reason.

---

# PART XII — INVENTORY, PRICING, AND MENU CHANGES

## 42. Sold-Out Items

When an item becomes unavailable:

- Prevent new orders for that item.
- Update its public availability.
- Preserve already confirmed orders.
- Notify affected customers if an existing order cannot be fulfilled.

## 43. Price Changes

If a restaurant changes an item's price after a customer has placed an order:

- The confirmed order retains the original price.
- New orders use the new price.
- The restaurant must not retroactively increase the price of a confirmed order.

## 44. Add-ons and Customizations

The final price must include the selected add-ons and customizations.

If an add-on becomes unavailable:

- Revalidate before checkout.
- Prevent invalid selections.
- Require customer confirmation if a confirmed order must change.

## 45. Inventory Shortage After Acceptance

If the restaurant discovers an inventory shortage after accepting the order:

- The restaurant reports the unavailable item.
- Customer support or the approved restaurant workflow offers a refund or alternative.
- No substitution occurs without customer approval.
- The affected sub-order is recalculated.

---

# PART XIII — DELIVERY OPERATIONS AND EXCEPTIONAL CASES

## 46. Restaurant Preparation Delay

If a restaurant is taking longer than expected:

- Update the estimated preparation time.
- Notify the rider where relevant.
- Notify the customer when the delay is material.
- Preserve the actual timestamps for performance reporting.

## 47. Rider Cannot Find the Restaurant

The rider should be able to report a pickup-location problem.

Admin or restaurant staff should be notified.

The system should not automatically cancel the order without an appropriate review.

## 48. Rider Cannot Find the Customer

The rider should be able to:

- Contact the customer.
- Follow the configured waiting process.
- Report the problem.
- Upload appropriate evidence.
- Request support.

The system must not allow an arbitrary failed-delivery status without a valid reason and required evidence.

## 49. Customer Provides an Incorrect Address

If the address is incorrect:

- The rider reports the issue.
- Customer support coordinates with the customer.
- Additional distance or charges must be disclosed and approved where applicable.
- The system records the revised address.
- The original address remains in the order history.

The system must not silently change the delivery destination.

## 50. Restaurant Closes During an Active Order

If a restaurant closes after accepting an order:

- Preserve the active order.
- Notify Admin.
- Contact the restaurant through the appropriate channel.
- Determine whether preparation can continue.
- If fulfillment is impossible, initiate the appropriate cancellation and refund process.

## 51. Rider Accident or Emergency

If a rider reports an accident or emergency:

- Prioritize rider safety.
- Allow the delivery to be paused.
- Notify authorized Admin personnel.
- Reassign the delivery if appropriate.
- Notify the customer of a delay or change.
- Preserve the incident record.

The system must not prioritize delivery completion over immediate safety.

## 52. Customer Reports Missing Delivery

If the customer says the order was not received:

- Open a support case.
- Retrieve proof of delivery.
- Retrieve the rider's relevant location history.
- Review customer and rider communications.
- Review the delivery timeline.
- Decide whether a refund, redelivery, or other resolution is appropriate.

A completed delivery status alone is not conclusive proof that the customer received the order.

## 53. Damaged or Incorrect Food

If food arrives damaged, missing, or incorrect:

- Customer submits a complaint.
- Affected items are identified.
- Evidence may be requested where appropriate.
- The restaurant is given an opportunity to respond.
- Admin reviews the case.
- A partial refund or other remedy is recorded where appropriate.

---

# PART XIV — ACCOUNT AND BUSINESS STATUS EDGE CASES

## 54. Customer Account Deactivated During an Active Order

The system should preserve the order.

Deactivation must not erase payment, delivery, or refund records.

Admin must be able to handle outstanding transactions.

## 55. Restaurant Suspended During an Active Order

The system should:

- Prevent new orders according to the suspension policy.
- Preserve active order information.
- Allow authorized personnel to resolve outstanding orders.
- Review pending payouts and refunds.
- Preserve historical restaurant financial records.

## 56. Rider Deactivated During an Active Delivery

The system should not simply remove the rider and leave the order unresolved.

Admin must be able to:

- Review the active assignment.
- Reassign the delivery when appropriate.
- Preserve the previous rider assignment history.
- Resolve COD responsibility.
- Record the reason for intervention.

## 57. Restaurant Owner Changes

If ownership changes:

- Preserve restaurant history.
- Preserve order and payout records.
- Verify the new owner.
- Transfer only authorized business access.
- Preserve existing agreements and obligations until properly updated.

## 58. Admin Changes Fees During Checkout

If a fee configuration changes while a customer is checking out:

- Revalidate the checkout.
- If the displayed total is no longer valid, request confirmation.
- Never silently charge a different amount.
- Store the final applied configuration.

---

# PART XV — FRAUD, ABUSE, AND SECURITY

## 59. Discount Fraud

Detect suspicious patterns such as:

- Repeated first-order promotions.
- Multiple uses of single-use vouchers.
- Artificial accounts.
- Unauthorized staff discount usage.
- Repeated refund abuse.

Use review and proportionate controls.

## 60. Fake Orders

SALO should monitor:

- Repeated failed COD orders.
- Suspicious order frequency.
- Repeated customer cancellations.
- Unusual restaurant behavior.
- Unusual rider delivery patterns.

Suspicious activity should be reviewed before account restrictions are imposed.

## 61. Fake Payment Proof

Uploaded payment screenshots must never automatically confirm a transaction.

The backend must use official payment verification.

## 62. Restaurant-Rider Collusion

SALO should monitor unusual patterns such as:

- Repeated false pickup confirmations.
- Repeated delivery completion without credible proof.
- Unusual COD discrepancies.
- Suspicious order cancellations.
- Repeated assignments involving the same unusual accounts.

These should be investigated through protected audit records.

## 63. Unauthorized Financial Changes

No ordinary staff member should be able to:

- Change historical order prices.
- Edit completed payments.
- Create unauthorized refunds.
- Modify restaurant payouts.
- Confirm COD remittance without authorization.
- Change commission records without permission.

All sensitive operations must be permission-controlled and audited.

---

# PART XVI — FINANCIAL DATA AND TECHNICAL REQUIREMENTS

## 64. Immutable Financial Snapshots

Every confirmed transaction should preserve its original calculation.

Store snapshots for:

- Menu item price.
- Quantity.
- Add-ons.
- Food subtotal.
- Discounts.
- Delivery fee.
- Other fees.
- Tax amounts where applicable.
- Commission basis and rate.
- Restaurant payable.
- Rider compensation.
- Reservation payment terms.

Historical transactions must not depend on the restaurant's current menu price or the current platform fee configuration.

## 65. Financial Ledger

SALO should maintain a reliable financial ledger.

Every financial event should have:

- Unique reference.
- Transaction type.
- Related order or reservation.
- Related restaurant.
- Related rider, where applicable.
- Amount.
- Currency.
- Debit or credit classification.
- Funding or receiving party.
- Status.
- Timestamp.
- Provider reference, where applicable.
- Reversal or adjustment reference.

Do not treat a single mutable `balance` field as the complete financial history.

Balances should be derived or reconciled against recorded financial entries.

## 66. Idempotency

Every payment, refund, payout, and remittance action must protect against duplicate execution.

If the same request is submitted twice, SALO must not create two financial operations.

## 67. Reconciliation

SALO should support regular reconciliation between:

- SALO payment records.
- Payment provider transactions.
- Restaurant settlements.
- Rider COD records.
- Rider payouts.
- Refunds.
- Bank settlement statements.

Discrepancies must be visible to authorized Finance personnel.

## 68. Monetary Calculations

Use decimal-safe calculations.

Never use ordinary floating-point arithmetic for authoritative financial totals.

Define:

- Currency precision.
- Rounding method.
- Discount allocation rules.
- Tax calculation rules.
- Commission calculation basis.

All calculations must be reproducible from stored transaction snapshots.

## 69. Audit Logs

Record:

- Original value.
- New value.
- Person responsible.
- Date and time.
- Reason.
- Related transaction.
- Approval details, if required.

Financial records and audit logs must not be silently deleted or overwritten.

---

# PART XVII — PHILIPPINE COMPLIANCE CONSIDERATIONS

## 70. Consumer Protection

SALO should align its online marketplace operations with applicable Philippine consumer and e-commerce requirements, including:

- Republic Act No. 11967 — Internet Transactions Act.
- Republic Act No. 7394 — Consumer Act of the Philippines.
- Applicable DTI implementing rules and regulations.
- Applicable data privacy requirements.

Promotions, fees, refund conditions, merchant identity, and transaction terms must be clear and accessible.

## 71. Payment Regulation

SALO must obtain professional advice on whether its intended payment collection, merchant settlement, and fund-handling arrangement requires specific BSP-regulated arrangements or an appropriately licensed payment provider.

Do not build an unregulated wallet or payment custody arrangement by accident.

## 72. Tax and Merchant Documentation

SALO should maintain appropriate restaurant partner documentation.

The system should support relevant records for:

- Business registration.
- BIR registration information.
- Merchant settlement.
- Withholding tax documentation, where applicable.
- Official receipts or invoices under applicable rules.
- Platform service fees and commissions.

The applicable BIR rules and seller eligibility must be reviewed with an accountant before launch.

## 73. Data Privacy

Customer addresses, payment references, rider location history, and identity documents are sensitive operational data.

Access must be limited to authorized users and legitimate purposes.

Retention, deletion, access, and disclosure policies must be documented.

---

# PART XVIII — ADMIN CONFIGURATION AND APPROVALS

## 74. Configurable Policies

Admin should be able to manage approved configurations for:

- Delivery fees.
- Platform commissions.
- Restaurant-specific commissions.
- Service fees.
- Reservation service fees.
- Reservation deposit policies.
- Cancellation deadlines.
- Discount campaigns.
- Discount stacking.
- Discount funding.
- Payout schedules.
- Supported payment methods.
- Service areas.
- COD procedures.

## 75. Effective Dates

Every important configuration must have:

- Draft status.
- Approval status, if required.
- Effective date.
- Expiration date, where applicable.
- Responsible administrator.
- Version history.

## 76. High-Risk Changes

Consider additional approval for:

- Major commission changes.
- Large financial adjustments.
- High-value refunds.
- Changes to payment settlement arrangements.
- Changes to non-refundable reservation policies.
- Changes to platform-wide cancellation rules.

The approval process should depend on the risk and financial impact.

---

# PART XIX — EXAMPLE END-TO-END SCENARIOS

## 77. Scenario A: Three Restaurants, One Successful Checkout

1. Customer orders from Restaurants A, B, and C.
2. SALO creates one parent checkout and three sub-orders.
3. Customer pays once through a supported payment flow.
4. Backend verifies payment.
5. Each restaurant receives its own order.
6. Restaurants independently accept or reject.
7. Riders are assigned as appropriate.
8. Each delivery is tracked separately.
9. Financial allocations are calculated independently.
10. Parent order becomes completed when all sub-orders are resolved.

## 78. Scenario B: One Restaurant Rejects

1. Customer pays for three restaurants.
2. Restaurants A and C accept.
3. Restaurant B rejects.
4. B's sub-order is cancelled.
5. SALO calculates B's refundable amount.
6. Refund is submitted.
7. A and C continue.
8. Parent order becomes partially completed or completed with a cancellation record.
9. Financial reports preserve the refund.

## 79. Scenario C: Reservation Fully Paid, Customer Cancels

1. Customer pays ₱1,500.
2. Payment breakdown is ₱1,300 deposit and ₱200 disclosed service fee.
3. Customer cancels.
4. SALO checks the accepted reservation policy.
5. SALO determines the permitted retained fee.
6. The customer sees the refund breakdown.
7. SALO submits the refund.
8. Payment status and reservation status are updated separately.

## 80. Scenario D: Restaurant Cancels a Fully Paid Reservation

1. Customer pays for a reservation.
2. Restaurant becomes unable to accommodate the booking.
3. Restaurant cancels.
4. SALO records the restaurant's reason.
5. The customer is notified.
6. The applicable customer refund is calculated without charging a customer cancellation penalty.
7. Refund is submitted.
8. Restaurant performance records are updated.

## 81. Scenario E: Platform Discount Used Across Two Restaurants

1. Customer orders ₱400 from Restaurant A.
2. Customer orders ₱600 from Restaurant B.
3. Customer applies a ₱100 platform voucher.
4. SALO allocates ₱40 to A and ₱60 to B.
5. Platform records ₱100 promotional expense.
6. Restaurant settlements are calculated using the agreed commission basis.
7. Financial reports reflect the funding source.

## 82. Scenario F: COD Across Two Riders

1. Customer orders from two restaurants.
2. Two riders are assigned.
3. Each rider sees the amount to collect for their assigned sub-order.
4. Rider A collects its required amount.
5. Rider B reports that the customer refused payment.
6. A's COD collection is recorded.
7. B's delivery is escalated.
8. Admin resolves B's outstanding delivery and collection records independently.

## 83. Scenario G: Duplicate Online Payment

1. Customer submits payment.
2. The customer clicks Pay again.
3. The provider confirms two successful charges.
4. SALO associates only the valid intended payment with the order.
5. The duplicate is detected.
6. Finance reviews and refunds the accidental duplicate.
7. The order is not duplicated.

## 84. Scenario H: Restaurant Paid Before a Refund Request

1. Restaurant receives a valid payout.
2. Customer later wins a refund dispute.
3. SALO records the refund.
4. The restaurant adjustment is recorded separately.
5. Finance reviews the recovery method.
6. The original payout remains unchanged in history.

## 85. Scenario I: Menu Price Changes After Checkout

1. Customer confirms an order at ₱150.
2. Restaurant changes the menu price to ₱180.
3. The confirmed order remains ₱150.
4. New customers see ₱180.
5. No historical amount is silently recalculated.

## 86. Scenario J: Payment Provider Is Temporarily Down

1. Customer attempts payment.
2. Provider does not return a reliable result.
3. SALO marks the transaction pending or unknown.
4. Customer is instructed not to submit another payment blindly.
5. Backend checks the provider transaction.
6. If successful, order processing continues.
7. If unsuccessful, customer can retry.
8. If unresolved, Finance can investigate.

---

# PART XX — FINAL DEVELOPMENT PRINCIPLES

## 87. Non-Negotiable Requirements

SALO must never:

1. Mark an unverified online payment as paid.
2. Assume one checkout means all restaurant sub-orders are accepted.
3. Refund more than the amount successfully collected.
4. Pay a restaurant twice for the same transaction.
5. Pay a rider twice for the same delivery.
6. Treat COD collections as rider earnings.
7. Silently change the price of an already confirmed order.
8. Silently change a confirmed reservation's financial terms.
9. Apply a hidden discount condition.
10. Apply a promotion beyond its permitted usage.
11. Delete historical financial records to hide a mistake.
12. Treat a customer cancellation and restaurant cancellation as identical.
13. Automatically retain all reservation payments under a blanket non-refundable rule.
14. Allow a rider to approve an online payment through a screenshot.
15. Allow unauthorized personnel to issue financial adjustments.
16. Treat a refund request as proof that the refund was successful.
17. Use current fee configurations to recalculate completed historical transactions.
18. Confirm COD remittance without actual verification.
19. Mark an entire parent order completed while a sub-order is unresolved.
20. Let a frontend status change override authoritative backend payment records.

## 88. Implementation Order

Recommended development sequence:

**Phase 1 — Financial Foundation**
- Parent checkout and restaurant sub-orders.
- Payment records.
- Transaction snapshots.
- Financial ledger.
- Idempotency.
- Payment-provider integration.

**Phase 2 — Normal Transaction Workflows**
- Multi-restaurant checkout.
- Restaurant acceptance and rejection.
- COD.
- Restaurant settlement.
- Rider compensation.
- Reservation payments.

**Phase 3 — Refund and Cancellation**
- Full refunds.
- Partial refunds.
- Reservation cancellation.
- Restaurant cancellation.
- Failed delivery refunds.
- Refund reconciliation.

**Phase 4 — Discounts and Fees**
- Discount engine.
- Discount funding allocation.
- Promotion stacking.
- Delivery fee configuration.
- Commission configuration.
- Fee versioning.

**Phase 5 — Exceptional Cases**
- Payment provider failure.
- Duplicate payments.
- Chargebacks.
- Payout failures.
- COD discrepancies.
- Fraud review.
- Support and disputes.

**Phase 6 — Reports and Compliance**
- Financial reports.
- Restaurant statements.
- Rider statements.
- Tax-related records.
- Audit logs.
- Reconciliation reports.

## 89. Definition of Done

The business and financial system should not be considered complete until SALO can demonstrate:

- One checkout containing multiple independent restaurant sub-orders.
- Correct payment allocation.
- Independent restaurant acceptance and cancellation.
- Correct partial and full refunds.
- Reservation cancellation with a correct financial breakdown.
- Restaurant-initiated reservation cancellation.
- Platform-funded and restaurant-funded discounts.
- Correct discount stacking and allocation.
- Different delivery addresses and fees per restaurant.
- COD across one or multiple riders.
- Accurate restaurant payouts.
- Accurate rider earnings.
- Payment provider timeout and duplicate payment handling.
- Historical financial snapshots.
- Fee and commission versioning.
- Financial reconciliation.
- Protected audit logs.
- Proper role-based access to financial operations.
- Correct handling of disputes and exceptional cases.

**Final principle: SALO must always be able to explain where every peso came from, where it went, why it was charged, and what happened to it afterward.**