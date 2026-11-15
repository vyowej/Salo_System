# SALO Ledger Chart of Accounts — Proposal (Revised)

> **Status:** Revised Proposal (Documentation Only — No DB writes, no SQL executed)  
> **Authoritative Schema:** [database/salo_db.sql](file:///c:/xampp/htdocs/Salo_Final/database/salo_db.sql) (`ledger_accounts`, `ledger_journals`, `ledger_entries`, `ledger_unbalanced_journals`)  
> **Business Rules Source:** [documentation/SALO_BUSINESS_RULES.md](file:///c:/xampp/htdocs/Salo_Final/documentation/SALO_BUSINESS_RULES.md)

---

## 0. Approved Decisions & Conventions

1. **Marketplace Payment Model (§5.1):** **Model B** — Platform Collection and Merchant Payout. SALO collects customer funds (via payment provider or rider COD) and settles payables to restaurants and riders.
2. **Net `sales` Convention:** `sales` credits `2020 Restaurant Payable` for the **net customer-paid food amount** (after restaurant-funded and platform/provider-funded discounts). Only **platform-funded** or **provider-funded** discounts generate a `discount_funding` journal (crediting `2020 Restaurant Payable` so the restaurant is made whole for non-restaurant-funded discounts).
3. **Commission Basis Verification (`SALO_BUSINESS_RULES.md` §38–39):** The worked example in `SALO_BUSINESS_RULES.md` §38 (lines 1191–1202) shows a `₱1,000.00` food subtotal reduced by `₱100.00` restaurant-funded discount and `₱50.00` platform-funded discount to `₱850.00` ("Customer food amount after discounts"), followed by `₱85.00` commission (10% of the **discounted** `₱850.00` food amount). Line 1202 explicitly notes: *"The exact calculation depends on the approved commission basis and contract."* Confirming the final contractual commission basis remains in **Decisions Needed**.
4. **COD Remittance Policy (§36.5):** Riders remit **100% of collected COD cash** (`1030` → `1010`); **no netting** against `2030 Rider Payable` is permitted.
5. **Account Codes Approved:** Codes `1010`–`5030` below are approved.
6. **Provider Settlement Approved (Option 1):** Added `'provider_settlement'` to `ledger_journals.journal_type` (and `chk_ledger_journals_idempotency`) in [database/salo_db.sql](file:///c:/xampp/htdocs/Salo_Final/database/salo_db.sql) to move settled funds from `1020` to `1010`.
7. **Deferred Items:** Reservation deposit/service-fee split, payment provider fees/withholding tax, and the refund fault-bearing matrix remain open in **Decisions Needed**.

---

## 1. Approved `ledger_accounts` (Chart of Accounts)

All accounts map to the four `ledger_accounts.account_type` values (`asset`, `liability`, `revenue`, `expense`) in `database/salo_db.sql` (line 1211).

| `account_code` | `account_name` | `account_type` | Normal Balance | Justification in `SALO_BUSINESS_RULES.md` |
|---|---|---|---|---|
| `1010` | Platform Cash / Bank | `asset` | Debit | Platform bank/cash funds for confirmed COD remittances, settled provider funds, payouts, and bank/cash refunds (§5.1 Model B, §36.5, §40) |
| `1020` | Payment Provider Receivable / Clearing | `asset` | Debit | Verified online payments captured by the payment provider awaiting bank settlement, plus provider-funded promos/refunds (§5.1 Model B, §6.1, §26, §37) |
| `1030` | Rider COD Cash Receivable | `asset` | Debit | COD cash collected by riders on behalf of SALO/restaurants until 100% remitted and confirmed by Admin (§36, §36.5) |
| `1040` | Restaurant Receivable / Clawback | `asset` | Debit | Amounts recoverable from a restaurant when a refund is issued after payout (§14, §40.1) |
| `2010` | Customer Unallocated / Clearing Liability | `liability` | Credit | Customer payment (online or COD) held before allocation to sales, delivery fees, tips, deposits, or service fees (§2.4, §3.1, §12) |
| `2020` | Restaurant Payable | `liability` | Credit | Net amounts owed to restaurants (net food sales + platform/provider-funded discounts + applied/retained deposits − commission − payouts/refunds) (§2.4, §38, §40) |
| `2030` | Rider Payable | `liability` | Credit | Amounts owed to riders for delivery compensation and customer tips, settled via `payout` (§2.4, §35) |
| `2040` | Reservation Deposit Liability | `liability` | Credit | Advance reservation deposits held prior to dining completion, refund, or forfeiture (§16.1, §17–22, §41.1) |
| `2050` | Refunds Payable | `liability` | Credit | Approved customer refunds pending settlement through the payment provider or platform bank (§7–13) |
| `4010` | Platform Commission Revenue | `revenue` | Credit | Platform commission earned on restaurant food orders (§2.4, §38, §39) |
| `4020` | Delivery Fee Revenue | `revenue` | Credit | Delivery fees charged to customers; tracked separately from rider compensation (§2.4, §33, §35) |
| `4030` | Reservation Service Fee Revenue | `revenue` | Credit | Disclosed platform service fees for table reservations (§2.4, §16.2) |
| `4040` | Reservation Cancellation / Forfeiture Revenue | `revenue` | Credit | Platform-retained portion of forfeited deposits/cancellation fees where policy permits (§16, §19, §21) |
| `5010` | Rider Compensation Expense | `expense` | Debit | Platform expense for rider delivery compensation, tracked separately from customer delivery fees (§2.4, §35) |
| `5020` | Platform Promo / Discount Expense | `expense` | Debit | Platform-funded portion of order discounts and vouchers (§26, §30) |
| `5030` | Ledger Adjustment / Discrepancy Expense | `expense` | Debit | Controlled adjustments for verified COD discrepancies, rounding differences, or reconciliation write-offs (§30.1, §36.6, §67) |

---

## 2. Posting Rules for All 16 `journal_type` Events

Every journal is posted in a single database transaction with at least 2 entries, `SUM(debit) = SUM(credit)`, positive entry `amount`, and at most one party (`restaurant_id`, `rider_id`, or `customer_user_id`) per entry (`database/salo_db.sql` lines 1276–1319).

### 1. `payment`
- **Source:** `SALO_BUSINESS_RULES.md` §2.4, §5.1, §6.1, §37 (verified online payment only; pending states stay in `payments`).
- **Idempotency key required:** Yes (`chk_ledger_journals_idempotency`).
- **Example (Customer pays `₱950.00` online):**
  - **Debit** `1020` Payment Provider Receivable / Clearing — `₱950.00` (no party)
  - **Credit** `2010` Customer Unallocated / Clearing Liability — `₱950.00` (`customer_user_id`)

### 2. `sales` (Net Convention)
- **Source:** `SALO_BUSINESS_RULES.md` §2.4, §3.1, §38.
- **Example (Food subtotal `₱1,000.00`, restaurant-funded discount `₱100.00`, platform-funded discount `₱50.00` → net customer-paid food amount `₱850.00`):**
  - **Debit** `2010` Customer Unallocated / Clearing Liability — `₱850.00` (`customer_user_id`)
  - **Credit** `2020` Restaurant Payable — `₱850.00` (`restaurant_id`)

### 3. `commission`
- **Source:** `SALO_BUSINESS_RULES.md` §2.4, §38, §39 (`₱85.00` commission on `₱850.00` discounted food amount per §38 example).
- **Example:**
  - **Debit** `2020` Restaurant Payable — `₱85.00` (`restaurant_id`)
  - **Credit** `4010` Platform Commission Revenue — `₱85.00` (no party)

### 4. `delivery_fee`
- **Source:** `SALO_BUSINESS_RULES.md` §2.4, §33, §35 (`₱70.00` customer delivery fee).
- **Example:**
  - **Debit** `2010` Customer Unallocated / Clearing Liability — `₱70.00` (`customer_user_id`)
  - **Credit** `4020` Delivery Fee Revenue — `₱70.00` (no party)

### 5. `rider_pay`
- **Source:** `SALO_BUSINESS_RULES.md` §2.4, §35 (`₱55.00` rider compensation, independent of `₱70.00` customer delivery fee).
- **Example:**
  - **Debit** `5010` Rider Compensation Expense — `₱55.00` (no party)
  - **Credit** `2030` Rider Payable — `₱55.00` (`rider_id`)

### 6. `tip`
- **Source:** `SALO_BUSINESS_RULES.md` §2.4, §35 (tips are passed through to the rider and never treated as platform commission).
- **Example (`₱30.00` customer tip):**
  - **Debit** `2010` Customer Unallocated / Clearing Liability — `₱30.00` (`customer_user_id`)
  - **Credit** `2030` Rider Payable — `₱30.00` (`rider_id`)

### 7. `discount_funding` (Net Convention)
- **Source:** `SALO_BUSINESS_RULES.md` §26, §30, §38. Under the net convention, restaurant-funded discounts are already excluded from `sales`; only platform-funded or provider-funded discounts require a `discount_funding` journal to credit `2020 Restaurant Payable`.
- **Example A — Platform-funded discount (`₱50.00`):**
  - **Debit** `5020` Platform Promo / Discount Expense — `₱50.00` (no party)
  - **Credit** `2020` Restaurant Payable — `₱50.00` (`restaurant_id`)
- **Example B — Provider-funded discount (`₱50.00` reimbursed by payment provider):**
  - **Debit** `1020` Payment Provider Receivable / Clearing — `₱50.00` (no party)
  - **Credit** `2020` Restaurant Payable — `₱50.00` (`restaurant_id`)

### 8. `deposit`
- **Source:** `SALO_BUSINESS_RULES.md` §16.1, §17, §41.1 (example: `₱1,300.00` reservation deposit).
- **Example A — On reservation deposit collection:**
  - **Debit** `2010` Customer Unallocated / Clearing Liability — `₱1,300.00` (`customer_user_id`)
  - **Credit** `2040` Reservation Deposit Liability — `₱1,300.00` (`customer_user_id`)
- **Example B — When deposit is applied to dining bill / settled to restaurant:**
  - **Debit** `2040` Reservation Deposit Liability — `₱1,300.00` (`customer_user_id`)
  - **Credit** `2020` Restaurant Payable — `₱1,300.00` (`restaurant_id`)
- **Example C — Forfeited reservation deposit (late cancellation §19 or no-show §21) posting to `4040` (Illustration Only):**
  - Suppose a `₱1,300.00` deposit is forfeited under a disclosed policy. Using an **illustrative-only** 50/50 split (`₱650.00` to restaurant, `₱650.00` to platform — the actual split policy is deferred in **Decisions Needed**):
    - **Debit** `2040` Reservation Deposit Liability — `₱1,300.00` (`customer_user_id`)
    - **Credit** `2020` Restaurant Payable — `₱650.00` (`restaurant_id`)
    - **Credit** `4040` Reservation Cancellation / Forfeiture Revenue — `₱650.00` (no party)

### 9. `service_fee`
- **Source:** `SALO_BUSINESS_RULES.md` §2.4, §16.2, §17 (`₱200.00` reservation service fee).
- **Example:**
  - **Debit** `2010` Customer Unallocated / Clearing Liability — `₱200.00` (`customer_user_id`)
  - **Credit** `4030` Reservation Service Fee Revenue — `₱200.00` (no party)

### 10. `refund`
- **Source:** `SALO_BUSINESS_RULES.md` §7–14, §17–20, §53. Refunds must reverse the restaurant payable (or `1040` if already paid out per §14) **and** reverse the platform's share (`4010` commission, `4020` delivery fee, `4030` service fee where refundable, and `5020` platform promo expense).
- **Idempotency key required:** Yes (`chk_ledger_journals_idempotency`).
- **Worked Example 1 — Full Refund of an Online Order (`₱920.00` paid: `₱850.00` net food + `₱70.00` delivery fee; `₱50.00` platform promo; `₱85.00` commission; restaurant net payable was `₱815.00`):**
  - *Step A (Accrue refund & reverse each party's share):*
    - **Debit** `2020` Restaurant Payable (or `1040` if already paid out) — `₱815.00` (`restaurant_id`)
    - **Debit** `4010` Platform Commission Revenue — `₱85.00` (no party)
    - **Debit** `4020` Delivery Fee Revenue — `₱70.00` (no party)
    - **Credit** `5020` Platform Promo / Discount Expense — `₱50.00` (no party)
    - **Credit** `2050` Refunds Payable — `₱920.00` (`customer_user_id`)
    *(Debits `₱970.00` = Credits `₱970.00`.)*
  - *Step B (Refund execution — account credited depends on settlement timing):*
    - **Before provider settlement** (or when the payment provider reverses the charge directly out of unsettled clearing / future settlement):
      - **Debit** `2050` Refunds Payable — `₱920.00` (`customer_user_id`)
      - **Credit** `1020` Payment Provider Receivable / Clearing — `₱920.00` (no party)
    - **After provider settlement** (when funds have already been settled to SALO's bank and SALO disburses the refund from its own bank account):
      - **Debit** `2050` Refunds Payable — `₱920.00` (`customer_user_id`)
      - **Credit** `1010` Platform Cash / Bank — `₱920.00` (no party)
- **Worked Example 2 — Full Refund of a COD Order (`₱920.00` collected in cash by rider, later refunded due to damaged/missing order per §10 / §53):**
  - *Step A (Accrue refund & reverse each party's share — same allocation as online order):*
    - **Debit** `2020` Restaurant Payable (or `1040` if already paid out) — `₱815.00` (`restaurant_id`)
    - **Debit** `4010` Platform Commission Revenue — `₱85.00` (no party)
    - **Debit** `4020` Delivery Fee Revenue — `₱70.00` (no party)
    - **Credit** `5020` Platform Promo / Discount Expense — `₱50.00` (no party)
    - **Credit** `2050` Refunds Payable — `₱920.00` (`customer_user_id`)
  - *Step B (Platform disburses COD refund from `1010 Platform Cash / Bank`, since COD has no online gateway reversal):*
    - **Debit** `2050` Refunds Payable — `₱920.00` (`customer_user_id`)
    - **Credit** `1010` Platform Cash / Bank — `₱920.00` (no party)

### 11. `cod_collection`
- **Source:** `SALO_BUSINESS_RULES.md` §36, §36.1 (COD is collected on behalf of SALO/restaurants, not rider income).
- **Example (Rider collects `₱920.00` = `₱850.00` net food + `₱70.00` delivery):**
  - **Debit** `1030` Rider COD Cash Receivable — `₱920.00` (`rider_id`)
  - **Credit** `2010` Customer Unallocated / Clearing Liability — `₱920.00` (`customer_user_id`)

### 12. `cod_remittance`
- **Source:** `SALO_BUSINESS_RULES.md` §36.5 (100% gross remittance confirmed by Admin; no netting against rider payable).
- **Idempotency key required:** Yes (`chk_ledger_journals_idempotency`).
- **Example (Rider remits `₱920.00`):**
  - **Debit** `1010` Platform Cash / Bank — `₱920.00` (no party)
  - **Credit** `1030` Rider COD Cash Receivable — `₱920.00` (`rider_id`)

### 13. `payout`
- **Source:** `SALO_BUSINESS_RULES.md` §2.4, §40.
- **Idempotency key required:** Yes (`chk_ledger_journals_idempotency`).
- **Example A — Restaurant payout (`₱815.00`):**
  - **Debit** `2020` Restaurant Payable — `₱815.00` (`restaurant_id`)
  - **Credit** `1010` Platform Cash / Bank — `₱815.00` (no party)
- **Example B — Rider payout (`₱85.00` = `₱55.00` rider pay + `₱30.00` tip):**
  - **Debit** `2030` Rider Payable — `₱85.00` (`rider_id`)
  - **Credit** `1010` Platform Cash / Bank — `₱85.00` (no party)

### 14. `adjustment`
- **Source:** `SALO_BUSINESS_RULES.md` §30.1, §36.6, §67 (admin-approved reconciliation/discrepancy adjustment).
- **Example (`₱20.00` verified COD discrepancy write-off after investigation):**
  - **Debit** `5030` Ledger Adjustment / Discrepancy Expense — `₱20.00` (no party)
  - **Credit** `1030` Rider COD Cash Receivable — `₱20.00` (`rider_id`)

### 15. `reversal`
- **Source:** `database/salo_db.sql` lines 1193–1194, 1237, 1265–1268 (`reverses_journal_id` required; each journal can be reversed once).
- **Example (Reversing an `₱85.00` `commission` journal):**
  - **Debit** `4010` Platform Commission Revenue — `₱85.00` (no party)
  - **Credit** `2020` Restaurant Payable — `₱85.00` (`restaurant_id`)

### 16. `provider_settlement` *(added in `database/salo_db.sql`)*
- **Source:** `SALO_BUSINESS_RULES.md` §5.1 Model B, §67 (reconciliation between provider settlement statements and bank statements).
- **Idempotency key required:** Yes (`chk_ledger_journals_idempotency`).
- **Example (Payment provider settles `₱950.00` to SALO's bank account):**
  - **Debit** `1010` Platform Cash / Bank — `₱950.00` (no party)
  - **Credit** `1020` Payment Provider Receivable / Clearing — `₱950.00` (no party)

---

## 3. Provider Settlement Gap Resolution (`1020` → `1010`)

Under Model B, online `payment` journals debit `1020 Payment Provider Receivable / Clearing`, while `payout` (and post-settlement bank `refund`) journals credit `1010 Platform Cash / Bank`. Originally, none of the 15 `journal_type` values moved settled funds from `1020` to `1010`.

- **Approved Resolution (Option 1):** Added `'provider_settlement'` as the 16th `ledger_journals.journal_type` value (and to `chk_ledger_journals_idempotency`) in [database/salo_db.sql](file:///c:/xampp/htdocs/Salo_Final/database/salo_db.sql), preserving clean separation from exception `adjustment` entries and supporting §67 bank reconciliation.

---

## 4. End-to-End Balanced Examples

### Example 1: Online Order Lifecycle (with Running Account Balances)
**Scenario:** Food subtotal `₱1,000.00`, restaurant-funded discount `₱100.00`, platform-funded discount `₱50.00` (net food paid `₱850.00`), delivery fee `₱70.00`, tip `₱30.00` → Customer pays `₱950.00` online. Commission `₱85.00`, rider pay `₱55.00`. Provider settles `₱950.00` to `1010` before payouts.

| # | `journal_type` | Debit Account (Amount) | Credit Account (Amount) | Key Running Balances After Journal |
|---|---|---|---|---|
| 1 | `payment` | `1020` (`950`) | `2010` (`950`) | `1020`: +950 Dr, `2010`: +950 Cr |
| 2 | `sales` | `2010` (`850`) | `2020` (`850`) | `2010`: +100 Cr, `2020`: +850 Cr |
| 3 | `discount_funding` | `5020` (`50`) | `2020` (`50`) | `5020`: +50 Dr, `2020`: +900 Cr |
| 4 | `commission` | `2020` (`85`) | `4010` (`85`) | `2020`: +815 Cr, `4010`: +85 Cr |
| 5 | `delivery_fee` | `2010` (`70`) | `4020` (`70`) | `2010`: +30 Cr, `4020`: +70 Cr |
| 6 | `rider_pay` | `5010` (`55`) | `2030` (`55`) | `5010`: +55 Dr, `2030`: +55 Cr |
| 7 | `tip` | `2010` (`30`) | `2030` (`30`) | `2010`: 0, `2030`: +85 Cr |
| 8 | `provider_settlement` | `1010` (`950`) | `1020` (`950`) | `1010`: +950 Dr, `1020`: 0 |
| 9 | `payout` (restaurant) | `2020` (`815`) | `1010` (`815`) | `2020`: 0, `1010`: +135 Dr |
| 10 | `payout` (rider) | `2030` (`85`) | `1010` (`85`) | `2030`: 0, `1010`: +50 Dr |

**Final Check:** `1010 = ₱50.00` (Dr). Clearing/Payables (`1020`, `2010`, `2020`, `2030`) = `₱0.00`. Revenue (`4010` `₱85` + `4020` `₱70` = `₱155.00`) − Expenses (`5010` `₱55` + `5020` `₱50` = `₱105.00`) = **`₱50.00` net surplus**, matching `1010` cash.

---

### Example 2: COD Order Lifecycle (100% Gross Remittance, No Netting)
**Scenario:** Food subtotal `₱1,000.00`, restaurant-funded discount `₱100.00`, platform-funded discount `₱50.00` (net food `₱850.00`), delivery fee `₱70.00` → Customer pays `₱920.00` COD cash to rider. Commission `₱85.00`, rider pay `₱55.00`. Rider remits 100% of `₱920.00` cash; payouts are separate.

| # | `journal_type` | Debit Account (Amount) | Credit Account (Amount) | Key Running Balances After Journal |
|---|---|---|---|---|
| 1 | `cod_collection` | `1030` (`920`) | `2010` (`920`) | `1030`: +920 Dr, `2010`: +920 Cr |
| 2 | `sales` | `2010` (`850`) | `2020` (`850`) | `2010`: +70 Cr, `2020`: +850 Cr |
| 3 | `discount_funding` | `5020` (`50`) | `2020` (`50`) | `5020`: +50 Dr, `2020`: +900 Cr |
| 4 | `commission` | `2020` (`85`) | `4010` (`85`) | `2020`: +815 Cr, `4010`: +85 Cr |
| 5 | `delivery_fee` | `2010` (`70`) | `4020` (`70`) | `2010`: 0, `4020`: +70 Cr |
| 6 | `rider_pay` | `5010` (`55`) | `2030` (`55`) | `5010`: +55 Dr, `2030`: +55 Cr |
| 7 | `cod_remittance` | `1010` (`920`) | `1030` (`920`) | `1010`: +920 Dr, `1030`: 0 |
| 8 | `payout` (restaurant) | `2020` (`815`) | `1010` (`815`) | `2020`: 0, `1010`: +105 Dr |
| 9 | `payout` (rider) | `2030` (`55`) | `1010` (`55`) | `2030`: 0, `1010`: +50 Dr |

**Final Check:** `1010 = ₱50.00` (Dr). Clearing/Payables (`1030`, `2010`, `2020`, `2030`) = `₱0.00`. Revenue (`4010` `₱85` + `4020` `₱70` = `₱155.00`) − Expenses (`5010` `₱55` + `5020` `₱50` = `₱105.00`) = **`₱50.00` net surplus**, matching `1010` cash.

---

## 5. Decisions Needed

1. **Refund Cost-Bearing Matrix by Cause (`SALO_BUSINESS_RULES.md` §7–14, §53):**
   - `SALO_BUSINESS_RULES.md` establishes that a restaurant must not keep payment for goods it did not provide (§8), a rider must not be automatically penalized for a failed delivery without evidence review (§10), and platform-funded refunds apply where the platform is responsible (§14).
   - However, §9 (customer-initiated cancellation), §10 (rider/delivery problems), and §53 (damaged/missing/incorrect food) leave the exact **fault-allocation matrix** to Admin review and policy. Confirm who bears each component (food share, `4020` delivery fee, `5010` rider pay, `4010` commission) for each cause (restaurant fault, rider fault after review, customer cancellation, platform goodwill).
2. **Reservation Deposit & Service Fee Split (§16.1, §16.2, §17–21) [Deferred]:** Confirm whether `reservation_service_fee` is always 100% platform revenue (`4030`), and define the exact split policy between `2020 Restaurant Payable` and `4040 Reservation Cancellation / Forfeiture Revenue` for late cancellations and no-shows (the 50/50 split in Example C is illustrative only).
3. **Provider Processing Fees & Withholding Tax (§12, §38, §40.1) [Deferred]:** Define provider fee bearer rules and tax withholding rules before adding dedicated expense/payable accounts (e.g., `Payment Gateway Fee Expense`, `Withholding Tax Payable`).
