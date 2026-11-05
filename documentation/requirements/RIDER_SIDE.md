# SALO — Rider Side Functional Requirements

**Project:** SALO — Where Good Food Brings Us Together  
**Module:** Rider Side  
**Document Type:** Functional Requirements and Feature Specification  
**Status:** Proposed Functional Specification

---

## 1. Introduction

The Rider Side is the dedicated workspace used by approved SALO delivery riders to manage their delivery responsibilities.

It allows riders to apply to become delivery partners, complete account activation, check assigned shifts, go online, receive delivery assignments, pick up restaurant orders, deliver them to customers, submit proof of delivery, handle delivery problems, and monitor their earnings and delivery records.

The Rider Side must communicate with the Customer, Restaurant Owner, and Admin modules through the SALO backend.

This document describes the expected rider-side functionality. It does not claim that every feature has already been implemented.

## 2. Rider Account and Application

### 2.1 Rider Registration and Application

A person must have a SALO account before applying to become a rider.

The application form should collect the necessary information, including:

- Full name and contact information.
- Profile photograph.
- Residential address.
- Preferred delivery vehicle.
- Government-issued identification.
- Vehicle information, when applicable.
- Required driver's license and vehicle registration documents, depending on vehicle type.
- Other documents required by SALO administration.

The system should support different vehicle types, such as:

- Motorcycle.
- Bicycle.
- E-bike or e-scooter, if supported.
- Other vehicle types approved by SALO.

Required documents must depend on the selected vehicle type and applicable requirements.

### 2.2 Application Status

The rider must be able to monitor the application.

Possible statuses:

- Draft.
- Submitted.
- Under Review.
- Requires Additional Information.
- Approved.
- Rejected.
- Suspended.

The rider should receive a notification when the application status changes.

If additional documents or corrections are required, the rider should be able to submit the requested information.

### 2.3 Admin Approval and Activation

Admin is responsible for reviewing rider applications.

The rider must not receive delivery assignments merely because an application has been approved.

The activation process must support the required verification steps, including OTP verification where applicable.

The rider should see whether the account is:

- Pending approval.
- Approved but awaiting activation.
- Active.
- Suspended.
- Deactivated.

The system must prevent unauthorized or unapproved accounts from accessing delivery operations.

## 3. Rider Dashboard

The dashboard is the rider's main workspace after logging in.

It should provide a quick overview of the rider's current status and delivery activities.

### 3.1 Dashboard Information

Display:

- Rider profile and account status.
- Current shift.
- Assigned delivery zone.
- Online or offline status.
- Current location status.
- Active delivery, if any.
- Today's completed deliveries.
- Today's earnings.
- Pending COD amount, if applicable.
- Recent notifications.

### 3.2 Main Dashboard Actions

The rider should be able to:

- Go Online.
- Go Offline.
- View assigned shift.
- View delivery offers.
- Open active delivery.
- View earnings.
- View delivery history.
- Access rider support.

Buttons must reflect actual account eligibility. The interface must explain why an action is unavailable rather than simply disabling it without explanation.

## 4. Shift Management and Availability

SALO uses assigned shifts to organize rider availability.

### 4.1 Assigned Shifts

Riders should be able to view their assigned schedules.

Shift information includes:

- Shift date.
- Start time.
- End time.
- Assigned delivery zone.
- Shift status.
- Any schedule changes.

### 4.2 Going Online

The rider can activate Driver Mode and select Go Online when eligible.

The system must verify the necessary conditions before allowing the rider to go online.

These include:

- Approved rider application.
- Completed account activation.
- Active rider account.
- Assigned and currently active shift.
- Eligible delivery zone.
- Driver Mode enabled.
- Valid and sufficiently recent GPS location.
- No conflicting active delivery or assignment.

The system must use the correct Philippine timezone (`Asia/Manila`) for shift evaluation.

### 4.3 Going Offline

The rider should be able to go offline when not handling an active delivery.

The system should prevent the rider from going offline in a way that abandons an active delivery. An appropriate exception or assistance process must exist for emergencies and other legitimate circumstances.

### 4.4 Availability Status

Possible statuses:

- Offline.
- Online and Available.
- Receiving an Offer.
- On Delivery.
- Temporarily Unavailable.
- Shift Ended.

The rider's availability must be reflected in the Admin dispatch workspace.

## 5. Delivery Offers and Assignment

This is one of the most important parts of the Rider Side.

When a restaurant order requires delivery, SALO's dispatch system should identify eligible riders and send an offer to an appropriate rider.

### 5.1 Receiving Delivery Offers

The rider should receive an in-app notification when a delivery offer becomes available.

The offer screen should show relevant information before acceptance:

- Restaurant name.
- Restaurant pickup location.
- Customer delivery area or address information needed to evaluate the offer.
- Estimated distance.
- Estimated delivery time, when available.
- Delivery compensation or applicable earnings information, if available.
- Payment collection requirement, particularly COD.
- Relevant delivery instructions or special handling information.

Sensitive customer information should only be exposed when needed for the assigned delivery.

### 5.2 Accepting or Declining an Offer

The rider should be able to accept or decline an offer within the configured response period.

If accepted, the assignment must be reserved for that rider.

If declined or expired, the dispatch system may offer the delivery to another eligible rider.

The system must prevent:

- Multiple riders accepting the same delivery.
- A rider receiving conflicting active assignments.
- An ineligible rider receiving an offer.
- An assignment being silently transferred without a recorded reason.

### 5.3 Assignment Information

Once accepted, the rider should see the complete delivery details necessary to perform the assignment.

The assignment must have a clear status and delivery reference number.

## 6. Delivery Management

The rider needs a dedicated delivery screen that guides them through each stage.

### 6.1 Delivery Lifecycle

The main delivery lifecycle is:

**Offered → Accepted → Picked Up → Delivered**

Additional outcomes include:

- Delivery Failed.
- Cancelled.

Each transition must be validated by the backend. Riders must not be able to skip required stages or manually change an order to an unauthorized status.

### 6.2 Accepted Delivery

After accepting an offer, the rider should see:

- Restaurant information.
- Pickup address.
- Customer delivery information.
- Order reference.
- Customer instructions, when available.
- Payment collection instructions.
- Navigation option.
- Current delivery status.

The rider should have an option to open the pickup location in an external navigation application.

### 6.3 Arriving at the Restaurant

The rider should be able to confirm arrival at the restaurant.

The restaurant should be informed that the assigned rider has arrived.

The rider should see the order information needed to identify the correct package.

### 6.4 Order Pickup

After collecting the order, the rider must confirm pickup through the application.

The system should record:

- Pickup confirmation.
- Date and time.
- Rider identity.
- Relevant order reference.
- Required pickup evidence, if configured.

Only after a valid pickup confirmation should the delivery move to `picked_up`.

The customer should receive an appropriate status update.

### 6.5 Traveling to the Customer

After pickup, the rider should see:

- Customer delivery address.
- Map and rider location.
- Navigation option.
- Delivery instructions.
- Customer contact option, where supported.
- Payment collection requirements.
- Delivery status.

The rider should be able to open an external navigation application.

SALO should not claim to provide turn-by-turn navigation unless a routing provider is actually integrated.

### 6.6 Customer Contact

The rider should have a way to contact the customer when necessary.

Possible actions:

- Call customer.
- Send an in-app message, if messaging is supported.
- Report that the customer cannot be reached.

Customer contact information should be protected and exposed only for legitimate delivery purposes.

## 7. Delivery Completion and Proof of Delivery

The system must record reliable evidence that an order reached the customer.

### 7.1 Proof of Delivery

Depending on the delivery type and configured requirements, the rider may need to submit:

- Delivery photograph.
- Customer confirmation.
- Recipient name.
- Delivery PIN or verification code, if enabled.
- Delivery completion timestamp.
- GPS location at completion, where permitted.

For contactless deliveries, a photograph should show the delivered order and enough surrounding context to help establish the drop-off location.

For hand-to-customer deliveries, the application may require recipient confirmation or another verification method.

### 7.2 Completing a Delivery

The rider can mark a delivery as complete only after satisfying its required completion checks.

The backend must validate:

- Correct assigned rider.
- Correct delivery.
- Valid current delivery status.
- Required proof of delivery.
- Required payment collection confirmation, when applicable.

After successful completion:

- Delivery status becomes `delivered`.
- The customer receives a delivery completion notification.
- The restaurant receives the appropriate order update.
- Rider delivery records are updated.
- Earnings records are updated according to the applicable calculation.
- COD collection records are updated, if applicable.

Proof of delivery must remain accessible to authorized Admin personnel for dispute investigation.

## 8. Failed Delivery and Exceptional Situations

Not every delivery can be completed successfully.

The Rider Side must provide a controlled way to report delivery problems.

### 8.1 Report Delivery Problem

The rider should be able to report issues such as:

- Customer unavailable.
- Customer cannot be contacted.
- Incorrect or incomplete delivery address.
- Customer refuses the order.
- Restaurant unable to provide the order.
- Order damaged or compromised.
- Vehicle breakdown.
- Accident or safety concern.
- Severe weather or unsafe delivery conditions.
- Other unexpected circumstances.

### 8.2 Required Information

When reporting a failed delivery, the rider should provide:

- Failure reason.
- Additional explanation.
- Date and time.
- Relevant photographs or supporting evidence, when applicable.
- Current delivery status.

The system should record who reported the issue.

### 8.3 Failed Delivery Review

A failed delivery must not automatically be treated as a completed delivery.

The system should notify the appropriate Admin personnel and allow them to review the incident.

Depending on the situation, Admin may authorize:

- Reassignment.
- Cancellation.
- Return to restaurant.
- Further customer coordination.
- Other approved resolution.

The system must preserve the delivery history and reason for the decision.

### 8.4 Emergency and Safety Reporting

The rider must have a way to report an emergency or unsafe situation.

The application should provide access to support and display appropriate emergency contact information.

Safety-related cancellations or interruptions must be recorded and reviewed fairly.

## 9. GPS and Location Tracking

Location tracking is necessary for dispatch and customer delivery tracking.

### 9.1 Location Permission

The rider must grant the necessary device location permission before going online.

The application should explain why location access is required.

### 9.2 Location Updates

The application should transmit the rider's latest GPS position while the rider is online or completing an active delivery, according to the platform's tracking policy.

The system should record:

- Latitude.
- Longitude.
- Timestamp.
- Rider reference.
- Relevant delivery reference, when applicable.

### 9.3 Customer Tracking

Customers should be able to view the assigned rider's approximate current position while their delivery is active.

The map should display:

- Restaurant pickup location, when relevant.
- Rider's latest available location.
- Customer delivery destination.
- Delivery progress.

Customer tracking should stop when the delivery is completed, cancelled, or otherwise no longer active.

### 9.4 GPS Failure

If GPS becomes unavailable or location updates become stale:

- The rider should receive a clear warning.
- The system should indicate that location is unavailable or outdated.
- The rider should be guided to restore location permission or connectivity.
- The system must not display an outdated position as if it were live.

Location tracking must follow appropriate privacy and access controls.

## 10. Cash on Delivery (COD) and Payment Collection

Some SALO deliveries may require riders to collect payment from customers.

COD must have its own clear workflow because collecting cash is different from simply completing a delivery.

### 10.1 COD Information

For a COD delivery, the rider should see:

- Authoritative amount to collect.
- Order reference.
- Payment collection status.
- Instructions for collection.

The amount must come from the authoritative backend order/payment records. The rider must not be able to edit the amount.

### 10.2 Recording Cash Collection

After receiving payment, the rider should confirm that the exact required amount was collected.

The system must not allow partial collection to be treated as successful full payment.

The application should distinguish:

- COD not yet collected.
- COD collected.
- COD collection disputed.
- COD pending remittance.
- COD remitted.
- Remittance confirmed.

### 10.3 COD Remittance

Collected cash must be tracked separately from rider earnings.

The rider should be able to view:

- Total COD collected.
- Outstanding COD balance.
- Remittance records.
- Remittance status.
- Admin-confirmed remittance history.

Only authorized Admin personnel may confirm that a rider has remitted the collected cash.

A rider's delivery completion, customer payment confirmation, and COD remittance confirmation must remain separate records and processes.

## 11. Online Payments

Customers may eventually pay through approved online payment methods.

For online-paid orders:

- The rider should see that the order is already paid or that payment is pending.
- The rider must not collect the order amount again.
- The rider must not manually mark an online transaction as successful.
- Payment status must come from the authoritative backend payment records.

Online bank transfers, GCash, and other payment channels must remain pending until SALO integrates an approved payment provider and implements server-side payment verification, such as verified provider callbacks or webhooks.

The rider must not be responsible for verifying online payment screenshots or manually approving electronic transfers.

## 12. Earnings and Financial Records

Riders should have a dedicated Earnings section.

### 12.1 Earnings Dashboard

Display:

- Today's earnings.
- Weekly earnings.
- Monthly earnings.
- Total completed deliveries.
- Delivery compensation.
- Applicable incentives or bonuses.
- Tips, if supported.
- Adjustments, if applicable.
- Payout status.

### 12.2 Earnings History

Each earnings record should include:

- Delivery reference.
- Delivery completion date.
- Compensation amount.
- Applicable adjustments.
- Payment or payout status.

### 12.3 Payout Information

If SALO supports rider payouts, riders should be able to view their registered payout method and payout history.

The system must distinguish earned compensation from money collected on behalf of SALO through COD.

A COD balance is not rider income.

## 13. Delivery History

The rider should have access to completed and unsuccessful delivery records.

### 13.1 Delivery History Information

Each record should display:

- Delivery reference.
- Restaurant.
- Delivery date.
- Completion or failure status.
- Pickup and drop-off details, subject to access restrictions.
- Earnings information, when applicable.
- Payment collection status.
- Relevant incident or failure reason.

### 13.2 Search and Filtering

The rider should be able to filter records by:

- Date range.
- Delivery status.
- Restaurant.
- Payment type.
- COD status.

### 13.3 Delivery Details

Opening a record should display the delivery timeline and relevant information.

Completed delivery records should include the associated proof of delivery where access is permitted.

## 14. Notifications

The rider should receive notifications about important account and delivery events.

Examples:

- Application submitted.
- Application approved or rejected.
- Additional documents requested.
- Account activation required.
- Shift assigned or changed.
- Shift starting soon.
- Delivery offer received.
- Delivery offer accepted.
- Restaurant pickup reminder.
- Customer delivery instructions updated.
- Delivery completed.
- Delivery failed or cancelled.
- COD remittance reminder.
- Earnings or payout update.
- Support response.
- Account or safety notice.

Notifications should be accessible through an in-app notification center.

## 15. Rider Support and Incident Reporting

Riders should have a dedicated support area.

### 15.1 Support Options

Possible support categories:

- Delivery issue.
- Restaurant pickup issue.
- Customer issue.
- Payment or COD issue.
- Account or application issue.
- GPS or application problem.
- Accident or safety incident.
- Other concerns.

### 15.2 Support Ticket

The rider should be able to submit a concern with:

- Issue category.
- Description.
- Related delivery reference, if applicable.
- Supporting photographs or attachments.
- Submission date and time.
- Ticket status.

Possible statuses:

- Submitted.
- Under Review.
- Awaiting Rider Response.
- Resolved.
- Closed.

Riders should be able to view responses and updates from authorized support personnel.

## 16. Rider Profile and Settings

The rider should be able to manage permitted account information.

### 16.1 Profile

Display:

- Profile photograph.
- Full name.
- Contact information.
- Rider account status.
- Registered vehicle.
- Application information.
- Verification status.

### 16.2 Vehicle Information

The rider should be able to request changes to vehicle information.

Changes to documents or vehicle details that require verification must be submitted for review rather than automatically approved.

### 16.3 Settings

Include:

- Notification preferences.
- Password and security settings.
- Location permission guidance.
- Account information.
- Privacy information.
- Terms and rider agreement.
- Logout.

## 17. Rider Safety and Welfare

Rider safety should be treated as a core part of the system rather than an optional feature.

The application should support:

- Access to road-safety guidelines.
- Safety orientation and training information.
- Required document and equipment reminders.
- Incident reporting.
- Emergency support information.
- Clear reporting of unsafe delivery conditions.
- Reasonable handling of weather-related and emergency interruptions.

SALO should avoid designing workflows that encourage riders to use their phones unsafely while operating a vehicle.

The system should not require riders to interact with the application while driving. Delivery actions should be performed only when it is safe to do so.

Rider agreements, compensation arrangements, insurance, and applicable worker protections must be reviewed separately to ensure compliance with Philippine requirements.

## 18. Rider Activity and Audit Records

Important rider actions should be recorded for operational accountability.

Examples:

- Application submission.
- Document submission.
- Account activation.
- Going online or offline.
- Shift changes.
- Delivery offer acceptance or decline.
- Pickup confirmation.
- Delivery completion.
- Failed delivery report.
- COD collection confirmation.
- Support request submission.
- Account suspension or reactivation.

Records should include the responsible account, relevant reference, timestamp, and action details.

Sensitive personal information should not be exposed in general activity logs.

## 19. Suggested Rider Sidebar Navigation

The Rider Side should have a simple navigation structure that makes active delivery work easy to access.

1. **Dashboard** — Current status, shift, summary, and quick actions.
2. **Deliveries** — Current assignment, incoming offers, and delivery details.
3. **Map / Tracking** — Current location and active delivery map.
4. **Schedule** — Assigned shifts and delivery zones.
5. **Earnings** — Compensation, payout records, and financial summary.
6. **Delivery History** — Completed, failed, and cancelled deliveries.
7. **Notifications** — Account and delivery updates.
8. **Support** — Help requests and incident reports.
9. **Profile** — Personal information, vehicle, and documents.
10. **Settings** — Security, preferences, and account settings.

The application should prioritize the active delivery screen whenever the rider has an ongoing assignment.

## 20. Integration With Other SALO Modules

The Rider Side must integrate with the other platform modules.

### 20.1 Customer Side

Customer functionality should receive appropriate updates when:

- A rider is assigned.
- The rider accepts the delivery.
- The rider reaches the restaurant.
- The order is picked up.
- The rider is traveling to the customer.
- The delivery is completed.
- A delivery problem occurs.

Customers should only be able to track their own active deliveries.

### 20.2 Restaurant Owner Side

Restaurant owners and authorized staff should be able to:

- View the assigned rider.
- See relevant rider arrival and pickup updates.
- Identify whether an order has been picked up.
- Receive delivery-related status changes.
- Coordinate with Admin when a delivery issue occurs.

Restaurant staff should not be allowed to modify rider financial records or independently confirm COD remittance.

### 20.3 Admin Side

Admin should manage the overall rider operations.

Admin functionality should include:

- Rider application review.
- Rider approval and activation oversight.
- Rider account management.
- Shift and zone assignment.
- Rider availability monitoring.
- Delivery dispatch and assignment.
- Reassignment and cancellation oversight.
- Active delivery monitoring.
- Failed delivery investigation.
- COD and remittance verification.
- Rider earnings and payout oversight.
- Support and incident management.
- Rider activity and audit records.

## 21. Important System and Data Requirements

The Rider Side must use real backend data and must not rely on frontend-only mock state for actual delivery operations.

The backend must enforce:

- Rider authorization and account status.
- Shift and timezone eligibility.
- Delivery assignment ownership.
- Valid delivery status transitions.
- Prevention of conflicting assignments.
- Reliable pickup and delivery confirmation.
- Proof-of-delivery validation.
- Accurate COD collection records.
- Separate payment and remittance records.
- Location access restrictions.
- Audit logging.
- Protection against duplicate submissions and repeated status transitions.

The frontend must not be trusted to determine whether a rider is eligible, whether a delivery is complete, or whether a payment has been collected.

All important state changes must be validated and persisted by the Laravel backend.

## 22. Features That May Be Added Later

The following are useful enhancements but should not block the core rider workflow:

- Multiple delivery assignments or batch deliveries.
- Rider performance analytics.
- Rider ratings and customer feedback.
- Incentive and quest programs.
- Heat maps showing high-demand areas.
- Preferred working zones.
- Advanced route optimization.
- In-app voice or messaging.
- Rider referral program.
- Training certificates and learning materials.
- Scheduled payout requests.

These should only be implemented after their business rules and technical requirements have been approved.

## 23. Important Business Decisions to Keep Separate

The Rider Side document describes functionality, not the final business policies.

The following topics should be defined in SALO's separate Business Rules document:

- Rider eligibility and application requirements.
- Vehicle and document requirements.
- Rider approval and suspension policies.
- Shift assignment and scheduling policies.
- Dispatch selection and offer expiration.
- Rider compensation and incentives.
- COD collection and remittance deadlines.
- Failed delivery and return procedures.
- Customer unavailability procedures.
- Rider cancellation and reassignment policies.
- Safety-related exceptions.
- Rider agreements, insurance, and applicable worker protections.

These decisions must be consistent across the Rider, Admin, Restaurant Owner, and Customer modules.

## 24. Definition of Done

The Rider Side should not be considered complete until the following can be verified:

- A customer account can submit a rider application.
- Admin can review and approve or reject the application.
- The rider can complete the required activation process.
- An eligible rider can view assigned shifts.
- The system correctly evaluates online eligibility.
- An eligible rider can go online and become available for dispatch.
- A rider can receive, accept, and decline delivery offers.
- The system prevents conflicting assignments.
- The rider can confirm restaurant arrival and order pickup.
- The rider can navigate to the customer.
- The rider can complete a delivery using the required proof.
- Failed deliveries can be reported and reviewed.
- Customer tracking receives appropriate location updates.
- COD collection is recorded separately from remittance.
- Only authorized Admin personnel can confirm COD remittance.
- Earnings and delivery history use authoritative backend records.
- Riders can submit support requests and incident reports.
- Important rider actions are recorded in activity logs.
- Customer and restaurant interfaces receive the correct delivery updates.
- Backend and frontend tests cover the important workflows.
- The complete flow is manually verified using appropriate test accounts and devices.

**Final requirement:** The Rider Side must function as a complete delivery operations workspace, not merely as an interface for accepting orders. Its primary responsibilities are rider eligibility, availability, dispatch, pickup, delivery execution, location updates, proof of delivery, payment collection records, and rider support.