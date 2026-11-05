# SALO — Admin Side Functional Requirements

**Project:** SALO — Where Good Food Brings Us Together  
**Module:** Platform Administration  
**Document Type:** Functional Requirements and Feature Specification  
**Status:** Proposed Functional Specification

---

## 1. Introduction

The Admin Side is the central management and control system of SALO.

It gives authorized platform administrators the ability to manage the entire marketplace, including customers, restaurant partners, restaurant staff, riders, orders, reservations, payments, discounts, delivery fees, platform commissions, reports, and system settings.

Unlike Restaurant Owners, who manage only their own restaurants, SALO Administrators have platform-level responsibilities.

The highest-level administrator, called the **Super Admin**, has the authority to manage the platform and its administrative personnel.

The Admin Side must be connected to all other SALO modules:

- Customer Side.
- Restaurant Owner Side.
- Rider Side.
- Admin Side.

The system must use a centralized account and permission structure so that users do not need separate accounts for different SALO capabilities.

## 2. Admin Account Hierarchy

### 2.1 Super Admin

The Super Admin is the highest-level administrator of SALO.

The Super Admin has access to all administrative functions, including:

- Create and manage administrator accounts.
- Activate, deactivate, suspend, and reactivate accounts.
- Manage customers, restaurant partners, and riders.
- Approve or reject restaurant and rider applications.
- Monitor all platform orders and reservations.
- Manage platform fees and commissions.
- Create and manage platform-wide discounts.
- Manage payment configurations.
- Access financial and operational reports.
- Manage platform settings.
- View platform-wide activity logs.
- Manage administrator roles and permissions.

The Super Admin should have unrestricted platform-level authority, subject to security safeguards and permanent audit records.

### 2.2 Additional Administrators

The Super Admin can add other administrators to help operate SALO.

However, newly created administrators should not automatically receive full Super Admin privileges.

The Super Admin should be able to:

- Invite another administrator.
- Select an administrative role.
- Assign individual permissions.
- Activate or deactivate an administrator.
- Change an administrator's assigned role.
- Revoke administrative access.
- View an administrator's activity history.

Each administrator must use their own SALO account. Shared administrator credentials must not be allowed.

### 2.3 Suggested Admin Roles

The system should provide predefined administrative roles.

**Platform Operations Admin**
- Monitor platform operations.
- Review restaurant and rider activity.
- Manage operational issues.
- Monitor orders and reservations.
- Coordinate delivery issues.

**Restaurant Management Admin**
- Review restaurant applications.
- Approve or reject restaurant applications.
- Manage restaurant partner accounts.
- Review restaurant profile complaints.
- Suspend or reactivate restaurant operations when authorized.

**Rider Management Admin**
- Review rider applications.
- Verify rider documents.
- Approve or reject rider applications.
- Manage rider accounts.
- Monitor shifts and availability.
- Review delivery incidents.

**Finance Admin**
- Monitor transactions.
- Review payment records.
- Manage authorized financial operations.
- Review platform commissions and fees.
- Monitor COD remittances.
- Review payouts and refunds.
- Generate financial reports.

**Customer Support Admin**
- Review customer complaints.
- Assist with order and reservation issues.
- Review support tickets.
- Coordinate with restaurants and riders.
- Escalate financial or safety-related concerns.

**Marketing Admin**
- Create platform promotions.
- Manage discount campaigns.
- Manage banners and featured restaurants.
- Manage promotional content.
- Monitor campaign performance.

These are suggested roles. The Super Admin should be able to customize permissions instead of being restricted to predefined roles.

### 2.4 Administrative Permission Management

Administrative permissions should be granular.

For example, a Finance Admin may view financial records but should not automatically be allowed to change platform-wide delivery fees.

The system should distinguish:

- View.
- Create.
- Edit.
- Approve.
- Reject.
- Activate.
- Deactivate.
- Delete, where deletion is permitted.
- Export.
- Manage permissions.

The Super Admin can assign permissions individually or through predefined roles.

A newly invited administrator should receive no elevated access until the invitation is accepted and the assigned permissions are activated.

The system must enforce permissions on the Laravel backend, not merely hide frontend navigation items.

## 3. Admin Account Creation and Management

### 3.1 Creating Administrator Accounts

The Super Admin should have an **Add Administrator** function.

The process should work as follows:

1. Super Admin opens Administrator Management.
2. Super Admin enters the person's registered email address or searches their SALO username.
3. Super Admin selects the administrative role.
4. Super Admin reviews and assigns the necessary permissions.
5. SALO sends an invitation.
6. The invited person accepts the invitation.
7. The person completes the required security verification.
8. The account receives its authorized administrative access.

The system should prevent an administrator from using the account before the invitation and required verification are completed.

If the invited person does not have a SALO account, the system should provide a secure account creation and activation process.

### 3.2 Account Status Management

The Super Admin should be able to manage accounts across the platform.

Possible account statuses:

- Pending Verification.
- Active.
- Inactive.
- Suspended.
- Deactivated.
- Deleted, only where legally and operationally appropriate.

Admin should be able to deactivate or reactivate eligible accounts.

### 3.3 Account Management Actions

Depending on permissions, administrators should be able to:

- Create or invite accounts.
- View account details.
- Update permitted account information.
- Activate accounts.
- Temporarily suspend accounts.
- Deactivate accounts.
- Reactivate accounts.
- Review account activity.
- Review verification status.
- Revoke active sessions when necessary.

Deactivation should prevent the account from accessing the relevant SALO services without automatically destroying its historical orders, reservations, payment records, or audit history.

### 3.4 Account Type and Platform Capabilities

SALO should support one account with multiple capabilities.

For example, one person may be:

- A Customer.
- A Restaurant Owner.
- A Restaurant Staff Member.
- A Rider.
- An Administrator, if invited and authorized.

Admin should be able to review the capabilities associated with an account.

The system must avoid creating duplicate user identities when an existing customer becomes a restaurant owner or rider.

## 4. Admin Dashboard

The Admin Dashboard provides an overview of the entire SALO platform.

### 4.1 Platform Overview

Display important platform statistics:

- Total registered customers.
- Active customers.
- Total restaurant partners.
- Pending restaurant applications.
- Approved restaurants.
- Suspended restaurants.
- Total registered riders.
- Active riders.
- Pending rider applications.
- Total orders.
- Active orders.
- Completed orders.
- Cancelled orders.
- Total reservations.
- Pending reservations.
- Total platform revenue or commissions.
- Total transaction value.
- Pending payouts.
- Outstanding COD remittances.

### 4.2 Dashboard Filters

The dashboard should support:

- Today.
- Yesterday.
- This Week.
- This Month.
- This Year.
- Custom Date Range.

Where appropriate, administrators should also be able to filter by:

- City.
- Delivery zone.
- Restaurant.
- Rider.
- Order status.
- Payment method.

### 4.3 Quick Actions

Provide shortcuts to frequently used operations:

- Review pending applications.
- Manage accounts.
- Monitor active deliveries.
- Review reported problems.
- Manage discounts.
- Configure fees.
- View financial reports.

## 5. Customer Management

Admin should be able to manage registered SALO customers.

### 5.1 Customer Directory

Display:

- Customer name.
- Username.
- Email.
- Contact number, where available.
- Account registration date.
- Account status.
- Number of orders.
- Number of reservations.
- Verification status.

### 5.2 Customer Management Actions

Authorized administrators should be able to:

- Search and view customers.
- Review customer account information.
- Activate or deactivate accounts.
- Suspend accounts when justified.
- Review reported customer activity.
- Review customer complaints.
- View relevant order and reservation history.
- Respond to support requests.

Sensitive customer information should only be accessible to personnel who need it for their assigned responsibilities.

## 6. Restaurant Partner Management

Admin is responsible for managing restaurant partners throughout their participation in SALO.

### 6.1 Restaurant Directory

Display:

- Restaurant name.
- Owner information.
- Restaurant address.
- Assigned service locations.
- Application status.
- Verification status.
- Operating status.
- Number of orders.
- Number of reservations.
- Restaurant rating.
- Registration date.

### 6.2 Restaurant Applications

Admin should be able to:

- Review new applications.
- View submitted documents.
- Review restaurant information.
- Review restaurant location.
- Review business and ownership information.
- Approve applications.
- Reject applications.
- Request additional information.
- Review application history.

### 6.3 Restaurant Account Management

Authorized administrators should be able to:

- Activate restaurant accounts.
- Temporarily suspend restaurants.
- Deactivate restaurant operations.
- Reactivate restaurants.
- Review restaurant profile changes.
- Review complaints.
- Monitor restaurant activity.

Suspending a restaurant should prevent new transactions according to the configured suspension behavior while preserving existing transaction records and allowing authorized personnel to handle outstanding orders and reservations.

### 6.4 Restaurant Monitoring

Admin should be able to monitor:

- Order acceptance performance.
- Order cancellation frequency.
- Restaurant availability.
- Menu availability.
- Customer complaints.
- Reservation activity.
- Restaurant ratings and feedback.
- Delivery-related issues.

## 7. Rider Management

Admin is responsible for managing the rider workforce and delivery operations.

### 7.1 Rider Directory

Display:

- Rider name.
- Username.
- Contact information.
- Vehicle type.
- Account status.
- Application status.
- Verification status.
- Assigned delivery zone.
- Assigned shifts.
- Completed deliveries.
- Rider registration date.

### 7.2 Rider Applications

Admin should be able to:

- Review rider applications.
- View submitted identification and vehicle documents.
- Request additional documents.
- Approve applications.
- Reject applications.
- Review verification status.
- Activate approved riders.

### 7.3 Rider Account Management

Authorized administrators should be able to:

- Activate riders.
- Temporarily suspend riders.
- Deactivate riders.
- Reactivate riders.
- Review rider activity.
- Review delivery incidents.
- Review reported customer or restaurant issues.
- Review rider support requests.

### 7.4 Rider Operations Monitoring

Admin should be able to monitor:

- Online and offline riders.
- Riders currently on delivery.
- Active shifts.
- Rider locations during authorized tracking periods.
- Unassigned delivery orders.
- Delivery offers.
- Failed deliveries.
- Reassignments.
- COD collection and remittance status.

## 8. Order and Reservation Monitoring

Admin should have a platform-wide view of transactions.

### 8.1 Order Management

Admin should be able to view:

- Order reference.
- Customer.
- Restaurant.
- Assigned rider.
- Order items.
- Order total.
- Payment method.
- Payment status.
- Delivery fee.
- Platform fees or commissions.
- Order status.
- Order timeline.

Administrators should be able to investigate orders, review transaction history, and handle escalated problems.

Direct changes to an order should be restricted to authorized operations and support workflows.

### 8.2 Reservation Management

Admin should be able to monitor:

- Reservation reference.
- Customer.
- Restaurant.
- Reservation date and time.
- Number of guests.
- Selected table, when applicable.
- Reservation status.
- Reservation fee.
- Payment status.
- Cancellation information.

Admin should be able to investigate reservation complaints and escalated issues.

Restaurant owners remain responsible for their own restaurant's day-to-day table and reservation management.

### 8.3 Disputes and Escalations

Provide a central area for issues that require platform-level intervention.

Examples:

- Customer reports missing order.
- Customer disputes payment.
- Restaurant disputes an order.
- Rider reports an unsafe delivery.
- Restaurant refuses an assigned order.
- Customer disputes a reservation fee.
- COD amount does not match.
- Delivery was marked complete but customer did not receive it.

Each case should have a record, assigned administrator, status, supporting evidence, and resolution history.

## 9. Platform Discounts and Promotions

Admin should control platform-wide promotional campaigns.

This is separate from restaurant-created discounts.

### 9.1 Discount Management

Admin should be able to create, edit, activate, deactivate, and schedule discounts.

Possible discount types:

- Percentage discount.
- Fixed amount discount.
- Free delivery.
- Discounted delivery fee.
- Minimum-spend discount.
- First-order discount.
- Returning-customer discount.
- Limited-time promotion.
- Platform-wide promotional campaign.
- Selected-restaurant promotion.

### 9.2 Discount Configuration

When creating a discount, the Admin should configure:

- Promotion name.
- Description.
- Discount type.
- Discount amount or percentage.
- Minimum order amount, if applicable.
- Maximum discount amount, if applicable.
- Start date and time.
- Expiration date and time.
- Applicable restaurants.
- Applicable locations.
- Eligible customer groups.
- Usage limit.
- Per-customer usage limit.
- Applicable order types.
- Applicable payment methods, if supported.
- Promotion code, if required.
- Funding source.

### 9.3 Promotion Funding

SALO should distinguish who pays for a discount.

Possible funding sources:

- Platform-funded.
- Restaurant-funded.
- Shared platform and restaurant funding.

The system must record the funding allocation so that restaurant settlements and platform financial reports remain accurate.

### 9.4 Discount Campaign Management

Admin should be able to monitor:

- Total discount usage.
- Total discount amount.
- Number of customers who used a promotion.
- Orders generated by a campaign.
- Campaign performance.
- Remaining campaign budget, if configured.

Expired or deactivated promotions should no longer be applied to new eligible orders.

Existing completed transactions must preserve the discount that was applied at checkout.

## 10. Platform Fees and Pricing Configuration

Admin should have a dedicated **Fees and Pricing Management** section.

This is important because SALO must be able to adjust platform charges without requiring developers to change source code for every pricing adjustment.

### 10.1 Delivery Fees

Admin should be able to configure delivery pricing.

Possible pricing models:

- Fixed delivery fee.
- Distance-based delivery fee.
- Zone-based delivery fee.
- Base fee plus distance charge.
- Special delivery fee for selected areas.
- Scheduled delivery surcharge, if supported.
- Other approved delivery pricing models.

### 10.2 Delivery Fee Configuration

The system should support configuration of:

- Base delivery fee.
- Included distance.
- Additional distance rate.
- Delivery zones.
- Minimum delivery fee.
- Maximum delivery fee, if applicable.
- Effective date and time.
- Applicable order types.
- Applicable service areas.
- Special delivery conditions.

The system must use the appropriate restaurant and customer locations to determine whether delivery is available and which fee configuration applies.

### 10.3 Platform Commission

Admin should be able to configure how SALO earns revenue from restaurant orders.

Possible commission structures:

- Percentage-based commission.
- Fixed commission.
- Different commission rates for approved restaurant arrangements.
- Promotional commission arrangements.

The system must clearly distinguish:

- Restaurant sales.
- Platform commission.
- Delivery fee.
- Customer service fees, if applicable.
- Discount deductions.
- Refunds and adjustments.
- Restaurant payable amount.

### 10.4 Other Platform Fees

Admin should be able to configure additional fees where supported, such as:

- Customer service fee.
- Small-order fee.
- Reservation service fee.
- Reservation booking fee.
- Other approved platform charges.

Every fee must have a clear name, description, amount or calculation method, applicability, and effective period.

### 10.5 Fee Change Management

Every fee configuration should support:

- Draft.
- Active.
- Scheduled.
- Expired.
- Deactivated.

The system must preserve previous fee configurations for historical transactions.

Changing a delivery fee or commission must not silently recalculate previously placed or completed orders.

Each transaction should retain the exact fee breakdown applied when it was created.

### 10.6 Fee Preview

Before activating a new fee configuration, Admin should be able to preview how it affects sample transactions.

For example:

- Customer delivery fee.
- Restaurant commission.
- Platform earnings.
- Restaurant payable amount.
- Applicable discount deductions.

This helps prevent accidental pricing changes.

## 11. Payment and Financial Management

Admin should have a dedicated Finance workspace.

### 11.1 Transaction Monitoring

Display platform transactions, including:

- Customer payments.
- Cash on Delivery.
- Online payments.
- Reservation payments.
- Refunds.
- Failed payments.
- Pending transactions.
- Completed transactions.

### 11.2 Payment Verification

Online payment transactions must be verified through the approved payment provider and backend verification process.

Admin should be able to review payment status and investigate failed or disputed transactions.

Administrators must not be able to arbitrarily mark an unverified online payment as successful.

### 11.3 COD Monitoring

Admin should be able to monitor:

- COD orders.
- Amount collected by each rider.
- Outstanding rider COD balances.
- Remittance submissions.
- Remittance confirmation.
- COD discrepancies.
- Remittance history.

COD collection and remittance must remain separate financial events.

### 11.4 Refund Management

Authorized Finance personnel should be able to review and process eligible refund requests through the approved payment workflow.

The system should record:

- Related order or reservation.
- Original transaction.
- Refund amount.
- Refund reason.
- Reviewing administrator.
- Approval status.
- Provider transaction reference, where applicable.
- Refund completion status.

High-value or sensitive refunds may require an additional approval step.

### 11.5 Payout Monitoring

Admin should be able to monitor restaurant and rider payout records.

Display:

- Recipient.
- Related transactions.
- Gross amount.
- Applicable deductions.
- Adjustments.
- Net payable amount.
- Payout method.
- Payout status.
- Payout date.
- Transaction reference.

The system should support payout reconciliation and preserve the history of all financial adjustments.

## 12. Reports and Analytics

Admin should have a dedicated Reports and Analytics section.

Reports should provide meaningful information about SALO's business performance, not merely display totals.

### 12.1 Platform Performance Reports

Display:

- Total orders.
- Completed orders.
- Cancelled orders.
- Failed deliveries.
- Average order value.
- Total customers.
- New customer registrations.
- Active customers.
- Customer retention.
- Total restaurant partners.
- Active restaurants.
- Total riders.
- Active riders.

### 12.2 Financial Reports

Display:

- Gross Merchandise Value (GMV).
- Total customer transaction value.
- Platform commission revenue.
- Delivery fee revenue.
- Other platform fee revenue.
- Discount expenses.
- Refund totals.
- Restaurant payable amounts.
- Rider earnings.
- COD collections.
- Outstanding COD remittances.
- Payout totals.

The system must clearly distinguish total order value from actual platform revenue.

### 12.3 Restaurant Reports

Display:

- Restaurant sales.
- Completed orders.
- Cancelled orders.
- Average order value.
- Popular menu items.
- Restaurant ratings.
- Customer complaints.
- Order acceptance performance.
- Restaurant performance by location.

### 12.4 Rider Reports

Display:

- Completed deliveries.
- Failed deliveries.
- Average delivery duration.
- Delivery acceptance information.
- Rider availability.
- COD collections.
- Outstanding remittances.
- Rider earnings.
- Delivery incident reports.

### 12.5 Customer Reports

Display:

- Customer registrations.
- Active customers.
- Repeat customers.
- Order frequency.
- Average spending.
- Popular restaurants.
- Popular categories.
- Discount usage.

Reports must not expose unnecessary personal information.

### 12.6 Discount Reports

Display:

- Active campaigns.
- Expired campaigns.
- Total discount usage.
- Total discount expenditure.
- Campaign conversion.
- Platform-funded discounts.
- Restaurant-funded discounts.
- Shared-funded discounts.

### 12.7 Location Reports

Display:

- Orders by city or service area.
- Revenue by service area.
- Active restaurants by location.
- Rider availability by location.
- Delivery demand.
- Popular service zones.

### 12.8 Report Filtering and Exporting

Reports should support:

- Date range.
- Location.
- Restaurant.
- Rider.
- Order status.
- Payment method.
- Promotion.
- Transaction type.

Authorized administrators should be able to export reports in appropriate formats such as CSV, Excel, or PDF.

Exports must follow the same access permissions and privacy restrictions as the reports themselves.

## 13. Delivery Zone and Service Area Management

Admin should manage the geographical areas where SALO operates.

### 13.1 Service Area Management

Admin should be able to:

- Create service areas.
- Edit service areas.
- Activate or deactivate service areas.
- Define supported cities and neighborhoods.
- Configure delivery zones.
- Review restaurant coverage.
- Monitor rider availability by area.

### 13.2 Restaurant Service Coverage

Admin should be able to review whether a restaurant's declared delivery coverage is supported by SALO.

The system must distinguish a restaurant's physical location from its delivery coverage.

### 13.3 Rider Delivery Zones

Admin should be able to assign riders to delivery zones and monitor their availability.

### 13.4 Service Area Availability

The system should be able to prevent customers from placing delivery orders when the delivery address is outside the applicable service coverage.

Pickup and reservation availability should be evaluated separately from delivery coverage.

## 14. Platform Content and Configuration

Admin should be able to manage public platform content.

### 14.1 Homepage and Featured Content

Admin should be able to manage:

- Homepage banners.
- Featured restaurants.
- Promotional banners.
- Featured categories.
- Announcement content.
- Platform notices.

### 14.2 Restaurant Categories

Admin should be able to manage platform-wide restaurant categories and cuisine classifications.

### 14.3 Platform Settings

Provide a centralized settings area for:

- Platform name and branding.
- Contact information.
- Customer notification settings.
- Email and SMS configuration.
- Supported payment methods.
- Default operating settings.
- Supported locations.
- Platform-wide maintenance notices.
- Privacy and terms links.

Sensitive technical configuration should not be exposed through ordinary settings screens.

## 15. Support and Complaint Management

Admin should have a central Support and Complaints workspace.

### 15.1 Support Requests

Display requests from:

- Customers.
- Restaurant Owners.
- Restaurant Staff.
- Riders.

### 15.2 Complaint Categories

Examples:

- Order complaint.
- Missing or incorrect item.
- Delivery problem.
- Payment issue.
- Refund request.
- Reservation complaint.
- Restaurant complaint.
- Rider complaint.
- Account issue.
- Safety incident.
- Other concerns.

### 15.3 Ticket Management

Admin should be able to:

- Review requests.
- Assign tickets to administrators.
- Change ticket status.
- Communicate with the requester.
- Request additional evidence.
- Escalate issues.
- Record the resolution.

### 15.4 Ticket Statuses

Possible statuses:

- Submitted.
- Open.
- Under Review.
- Awaiting Response.
- Escalated.
- Resolved.
- Closed.

Every resolution should retain its history and responsible administrator.

## 16. Platform Activity Logs and Audit Trail

The Admin Side must have a dedicated Activity Logs section.

This is especially important because administrators can change financial configurations, manage accounts, and control platform operations.

### 16.1 Logged Activities

Examples:

- Administrator account creation.
- Administrator permission changes.
- Account activation or deactivation.
- Restaurant approval or rejection.
- Rider approval or rejection.
- Restaurant suspension.
- Rider suspension.
- Fee configuration changes.
- Commission changes.
- Discount creation or modification.
- Payment and refund actions.
- COD remittance confirmation.
- Order intervention.
- Reservation intervention.
- Service area changes.
- Platform setting changes.
- Report exports.
- Login and security-related events.

### 16.2 Audit Information

Each audit record should capture:

- Administrator or user responsible.
- Assigned role.
- Action performed.
- Affected record.
- Date and time.
- Relevant previous value.
- Relevant new value.
- Reason or explanation, when required.
- Related transaction or reference number.

### 16.3 Audit Log Protection

Ordinary administrators must not be able to silently edit or erase audit history.

Access to audit logs should be permission-controlled.

Sensitive actions must remain attributable to the individual administrator who performed them.

## 17. Security and Administrative Safeguards

Because the Admin Side controls the entire platform, it requires stronger security than ordinary customer accounts.

### 17.1 Administrative Login

Support:

- Strong password requirements.
- Multi-factor authentication for administrative accounts.
- Session management.
- Secure password reset.
- Login attempt monitoring.
- Session revocation.

### 17.2 Sensitive Actions

Sensitive operations should require confirmation and, where appropriate, re-authentication or additional approval.

Examples:

- Creating or modifying administrator accounts.
- Granting elevated permissions.
- Changing platform commissions.
- Changing delivery fees.
- Issuing substantial refunds.
- Confirming financial adjustments.
- Deactivating other administrators.
- Changing critical platform settings.

### 17.3 Super Admin Protection

The platform should protect its highest-level administrator accounts.

The system must prevent accidental removal or deactivation of the last active Super Admin.

Super Admin privileges should never be assigned automatically through ordinary account registration.

### 17.4 Permission Enforcement

Every protected backend endpoint must independently verify the authenticated administrator's permissions.

Hiding a button in React is not sufficient authorization.

## 18. Suggested Admin Sidebar Navigation

The Admin workspace should use separate navigation sections.

1. **Dashboard** — Platform-wide overview.
2. **Accounts** — Customer accounts and general account management.
3. **Administrators** — Admin invitations, roles, and permissions.
4. **Restaurants** — Applications, restaurant directory, approvals, and monitoring.
5. **Riders** — Applications, verification, and rider management.
6. **Orders** — Platform-wide order monitoring and escalations.
7. **Reservations** — Reservation monitoring and escalations.
8. **Finance** — Transactions, COD, refunds, and payouts.
9. **Fees and Commissions** — Delivery fees, platform fees, and restaurant commissions.
10. **Discounts and Promotions** — Campaigns and promotional codes.
11. **Service Areas** — Cities, zones, and delivery coverage.
12. **Reports and Analytics** — Platform, financial, restaurant, rider, and customer reports.
13. **Support and Complaints** — Customer, restaurant, and rider support.
14. **Content Management** — Homepage banners and featured content.
15. **Activity Logs** — Administrative and platform activity.
16. **Settings** — Platform-wide configuration.

Only navigation items authorized for the logged-in administrator should be displayed.

## 19. Integration With Other SALO Modules

### 19.1 Customer Side

Admin controls customer account status, platform-wide promotions, customer support, and escalated customer issues.

### 19.2 Restaurant Owner Side

Admin controls restaurant applications, partner account status, platform fees, commission configurations, and escalated restaurant issues.

Restaurant owners continue managing their own restaurant profiles, menus, tables, reservations, and staff.

### 19.3 Rider Side

Admin controls rider applications, account status, shift oversight, dispatch operations, delivery monitoring, COD reconciliation, and escalated rider issues.

### 19.4 Financial Integration

All order totals, discounts, fees, commissions, refunds, rider earnings, and payouts must come from consistent backend financial records.

The system must not calculate unrelated financial totals independently in different frontend modules.

## 20. Important Data and System Requirements

The Admin Side must:

- Use centralized account identities.
- Enforce role-based and permission-based access.
- Validate every administrative operation on the backend.
- Preserve transaction history.
- Preserve historical fee and discount configurations.
- Prevent unauthorized financial changes.
- Record important administrative actions.
- Protect sensitive customer and financial information.
- Prevent duplicate financial operations.
- Support transaction reconciliation.
- Provide reliable reporting based on authoritative records.
- Support date and timezone consistency.
- Maintain clear separation between platform administration and restaurant-level administration.

All important operations must be handled through Laravel backend services and persisted in MySQL.

The React interface must not be treated as the source of authority for administrative permissions or financial calculations.

## 21. Business Rules to Define Separately

This document describes what the Admin module should be capable of doing. It does not establish final platform policies.

The following must be defined in the separate SALO Business Rules document:

- Super Admin ownership and succession.
- Admin invitation and permission policies.
- Account suspension and deactivation conditions.
- Restaurant approval requirements.
- Rider approval requirements.
- Platform commission rates.
- Delivery fee calculation.
- Other customer and restaurant fees.
- Discount eligibility and funding.
- Promotion stacking and usage restrictions.
- Refund approval conditions.
- Restaurant and rider payout schedules.
- COD remittance requirements.
- Service area eligibility.
- Dispute resolution procedures.
- Financial approval thresholds.

All policies must be consistent across the four SALO modules.

## 22. Definition of Done

The Admin Side should not be considered complete until the following can be verified:

- Super Admin can access the complete authorized platform workspace.
- Super Admin can invite another administrator.
- Invited administrators can accept invitations and activate their accounts.
- Super Admin can assign and modify administrator permissions.
- Administrators cannot access unauthorized features or APIs.
- Authorized administrators can manage customer accounts.
- Admin can review restaurant applications.
- Admin can approve, reject, suspend, and reactivate eligible restaurant accounts.
- Admin can review rider applications.
- Admin can approve, reject, suspend, and reactivate eligible rider accounts.
- Admin can monitor platform-wide orders and reservations.
- Admin can create and manage platform discounts.
- Admin can configure delivery fees, service fees, and commissions.
- Fee changes preserve historical transaction calculations.
- Admin can review payment transactions, refunds, COD, and payouts.
- Admin can generate platform and financial reports.
- Admin can manage service areas.
- Admin can review complaints and support tickets.
- Administrative actions are recorded in protected audit logs.
- Sensitive administrative actions have appropriate safeguards.
- The entire system is tested using accounts with different administrative permissions.
- Reports and financial figures are verified against backend transaction records.

## 23. Final Requirement

The SALO Admin Side must function as the central control center of the entire marketplace.

The Super Admin should have the authority to manage the platform, create and manage administrative personnel, control account access, configure fees and promotions, oversee financial operations, and monitor the performance of the entire SALO ecosystem.

Additional administrators should be able to perform their assigned responsibilities without automatically receiving unrestricted platform authority.

**The goal is to give SALO complete administrative control while maintaining accountability, financial accuracy, security, and a clear history of every important action.**

---

## Document Maintenance

This document describes the intended Admin Side functionality. Changes to features, permissions, financial operations, or platform integrations must be reflected in this document and coordinated with the Customer Side, Restaurant Owner Side, Rider Side, and separate Business Rules documentation.