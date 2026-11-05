# SALO — Customer Side Functional Requirements

**Project:** SALO — Where Good Food Brings Us Together.  
**Document Type:** Functional Requirements Specification  
**Module:** Customer Side  
**Status:** Functional Reference Document

---

# 1. Introduction

## 1.1 Purpose

This document defines the functional requirements, workflows, and expected behavior of the SALO Customer Side.

The Customer Side allows customers to discover restaurants, browse menus, place food orders, arrange deliveries or pickups, make table reservations, manage their accounts, and monitor their transactions.

It also provides existing customers with access to the restaurant partnership application, allowing interested customers to begin the process of becoming SALO restaurant partners.

This document serves as the reference for designing, implementing, testing, and maintaining customer-facing functionality.

## 1.2 System Overview

SALO is an online restaurant ordering and reservation platform that connects customers with participating restaurants.

Customers can:

- Discover and explore restaurants.
- Browse restaurant profiles and menus.
- Customize food orders.
- Order from multiple restaurants.
- Assign different delivery addresses to different restaurant orders within one checkout.
- Choose delivery or pickup where supported.
- Track their orders.
- Reserve actual restaurant tables.
- Pay applicable reservation fees.
- Manage their personal information and saved addresses.
- Apply to become a SALO restaurant partner.

## 1.3 Core Customer Experience Principles

SALO must follow these principles:

1. **Explore First** — Customers should be able to explore restaurants before completing optional profile information.
2. **Personalize Gradually** — Request additional information only when needed.
3. **Order Conveniently** — Minimize unnecessary steps during ordering and checkout.
4. **Reserve Confidently** — Show actual table availability, reservation requirements, and payment policies.
5. **Be Transparent** — Clearly display prices, fees, order status, reservation status, and cancellation policies.
6. **Maintain Customer Control** — Allow customers to manage their addresses, preferences, orders, and reservations.
7. **Make Partnership Accessible** — Give interested customers a clear way to explore becoming a SALO restaurant partner.

---

# 2. Customer Registration and Authentication

## 2.1 Account Registration

Customers must be able to create an account using the following required information:

- Full Name
- Username
- Email Address
- Password

The registration form must not require the following information:

- Phone Number
- Delivery Address
- Profile Picture

These details can be collected later through guided onboarding or when a feature requires them.

## 2.2 Registration Validation

The system must:

- Require all mandatory registration fields.
- Validate email format.
- Enforce unique email addresses.
- Enforce unique usernames.
- Apply password security requirements.
- Hash passwords securely.
- Display understandable validation messages.
- Prevent duplicate account registration.

## 2.3 Login

Customers must be able to log in using their supported account credentials.

The system must:

- Authenticate credentials securely.
- Reject incorrect credentials.
- Maintain authenticated sessions.
- Provide logout functionality.
- Prevent unauthorized access to customer-specific information.

## 2.4 Account Recovery

Customers should be able to recover access to their accounts through a secure password-reset process.

The system must not reveal whether an arbitrary email address belongs to an account through unnecessarily detailed error messages.

---

# 3. Guided Customer Onboarding

## 3.1 Welcome Experience

After successful registration or first login, customers should receive a personalized greeting.

Example:

"Hi, Cassidy! Welcome to SALO."

The onboarding experience must be friendly, simple, and easy to understand.

## 3.2 Additional Information Collection

The system may guide customers through providing:

1. Phone Number
2. Delivery Address
3. Additional address details when needed

These steps should be skippable when the information is not immediately necessary.

## 3.3 Onboarding Experience

- Customers must be allowed to explore SALO without completing all optional onboarding steps.
- The system must not repeatedly interrupt customers with the same onboarding request.
- Previously submitted information must be retained.
- Customers must be able to update their information through account settings.
- Information required for a particular transaction must be requested before that transaction proceeds.

---

# 4. Customer Dashboard

## 4.1 Dashboard Overview

The customer dashboard serves as the primary discovery and navigation page.

It should provide access to:

- Search
- Restaurant Categories
- Featured Restaurants
- Suggested for You
- Popular Restaurants
- Nearby Restaurants
- Promotions and Discounts
- All Restaurants
- Favorite Restaurants
- Active Orders
- Upcoming Reservations

## 4.2 Featured Restaurants

The system may display restaurants selected or designated by the platform administrator.

Featured status must come from actual platform configuration or database records.

## 4.3 Suggested for You

The system may recommend restaurants based on:

- Customer favorites
- Previous orders
- Frequently viewed restaurant categories, if tracked
- Restaurant popularity
- Customer location, when available and permitted
- Ratings and reviews
- Available promotions

Recommendations must be based on actual available data.

The system must not claim that recommendations are AI-powered unless an actual AI recommendation mechanism is implemented.

## 4.4 Popular Restaurants

Popular restaurants may be determined using approved metrics such as:

- Number of completed orders
- Customer engagement
- Ratings and reviews
- Other platform-defined popularity indicators

The calculation must be consistent and must not use fabricated metrics.

## 4.5 Nearby Restaurants

When customers permit location access, the system may display restaurants near their current location.

If location access is unavailable or denied, customers must still be able to explore restaurants using search and available location filters.

---

# 5. Restaurant Discovery and Search

## 5.1 Search Functionality

Customers must be able to search for restaurants using:

- Restaurant Name
- Cuisine
- Food Category
- Location
- Other supported searchable restaurant information

Search results should be relevant to the customer's search terms.

## 5.2 Restaurant Filters

The system should support filtering by:

- Cuisine
- Food Category
- Location
- Customer Rating
- Delivery Availability
- Pickup Availability
- Open Now
- Price Range
- Available Promotions
- Reservation Availability

Only filters supported by actual restaurant and platform data should be displayed.

## 5.3 Sorting

Customers should be able to sort restaurant results using supported options such as:

- Recommended
- Popularity
- Highest Rated
- Nearest
- Price

Sorting must use actual data and must not misrepresent restaurant rankings.

## 5.4 Restaurant Availability

Restaurant availability must reflect its actual operating status.

The system must distinguish between:

- Open
- Closed
- Temporarily Unavailable
- Not Accepting Orders
- Not Accepting Reservations

A restaurant being open does not automatically mean it is accepting every type of transaction.

---

# 6. Restaurant Details

## 6.1 Restaurant Profile

Each restaurant must have a customer-facing profile containing applicable information:

- Restaurant Name
- Logo
- Cover Photo
- Description
- Cuisine or Food Categories
- Address and Location
- Contact Information
- Operating Hours
- Current Operating Status
- Delivery Availability
- Pickup Availability
- Reservation Availability
- Ratings and Reviews
- Menu
- Promotions
- Branch Information, when applicable

## 6.2 Operating Hours

Customers must be able to view the restaurant's operating schedule.

The system must correctly handle:

- Different operating hours per day
- Closed days
- Temporary closures
- Special operating schedules
- Overnight operating hours

The displayed operating status must use the restaurant's configured schedule and applicable closure records.

## 6.3 Restaurant Menu

Customers must be able to browse available menu categories and menu items.

Menu information may include:

- Item Name
- Item Photo
- Description
- Price
- Category
- Availability
- Add-ons
- Customization Options
- Applicable Promotions

## 6.4 Sold-Out Items

Menu items marked unavailable or sold out must be clearly identified.

Customers must not be allowed to add unavailable items to their cart.

Availability must be validated again by the backend when the customer submits an order.

## 6.5 Ratings and Reviews

Customers may view available restaurant ratings and reviews.

If the platform supports customer reviews, submission must be restricted to eligible customers based on the applicable platform functionality.

The system must not fabricate ratings or reviews.

---

# 7. Favorite Restaurants

## 7.1 Favorite Functionality

Customers must be able to add restaurants to their favorites.

They must also be able to remove restaurants from their favorites.

## 7.2 Favorite Management

- Favorites must be associated with the authenticated customer.
- Customers must only access and manage their own favorites.
- Favorite restaurants must remain accessible through a dedicated Favorites section.
- Removing a restaurant from favorites must not delete the restaurant itself.

---

# 8. Menu Customization and Cart

## 8.1 Adding Menu Items

Customers must be able to:

- Select a menu item.
- View its description and price.
- Select available add-ons.
- Choose customization options.
- Specify quantity.
- Add special instructions when supported.
- Add the configured item to their cart.

## 8.2 Add-on Options

The system must support applicable add-on configurations:

- Required Add-ons
- Optional Add-ons
- Minimum Selection
- Maximum Selection
- Additional Prices

The backend must validate add-on selections and calculate the correct item price.

The frontend must not be trusted as the final authority for pricing.

## 8.3 Cart Management

Customers must be able to:

- View cart contents.
- Increase item quantity.
- Decrease item quantity.
- Remove items.
- Review customizations.
- Review item prices.
- View subtotals.
- Continue browsing restaurants.
- Proceed to checkout.

## 8.4 Cart Price Validation

Before order submission, the backend must validate:

- Menu item existence
- Menu item availability
- Current menu price
- Selected add-ons
- Add-on availability
- Quantity limits
- Restaurant ordering availability
- Applicable promotions

If an item or price changes, customers must be informed before confirming the transaction.

---

# 9. Multi-Restaurant Cart and Consolidated Checkout

## 9.1 Multi-Restaurant Ordering

Customers must be able to add items from different participating restaurants to one customer-facing cart.

Example:

- Restaurant A — Burger and Fries
- Restaurant B — Pizza
- Restaurant C — Milk Tea

The cart must group items according to their respective restaurants.

## 9.2 Consolidated Checkout

The customer should be able to review and submit eligible restaurant orders through one consolidated checkout experience.

The system should maintain the relationship between:

- Main Customer Checkout or Parent Order
- Restaurant-Specific Sub-Orders
- Individual Order Items
- Payment Records
- Delivery or Pickup Fulfillment Records

Each restaurant must receive and manage only its own relevant order information.

## 9.3 Independent Restaurant Order Processing

Each restaurant sub-order must have independent:

- Acceptance or rejection
- Preparation status
- Cancellation handling
- Fulfillment status
- Delivery or pickup information
- Applicable charges

One restaurant's order status must not automatically overwrite another restaurant's status.

## 9.4 Parent Order Status

The consolidated order must reflect the overall progress of its restaurant sub-orders.

The system must distinguish the parent order's overall status from individual restaurant sub-order statuses.

For example, if one restaurant accepts an order while another rejects it, the system must represent both outcomes accurately.

## 9.5 Partial Acceptance and Rejection

The platform must define how the consolidated checkout behaves when only some restaurant sub-orders are accepted.

The customer must receive clear information about:

- Accepted sub-orders
- Rejected sub-orders
- Cancelled sub-orders
- Applicable refunds
- Remaining payable amounts

Payment adjustments must follow the platform's payment and refund processes.

---

# 10. Multiple Delivery Addresses

## 10.1 Overview

Customers must be able to save multiple delivery addresses in their account.

Customers must also be able to assign different delivery addresses to different restaurant sub-orders within one consolidated checkout.

Example:

- Restaurant A → Home Address
- Restaurant B → Office Address
- Restaurant C → School Address

The system must support this functionality without requiring customers to create separate accounts or unrelated checkouts.

## 10.2 Saved Address Management

Customers must be able to:

- Add a delivery address.
- Edit an existing address.
- Delete an address when permitted.
- Set a main or default address.
- Select an address during checkout.
- Assign a label to an address.

Suggested address labels:

- Home
- Office
- School
- Other

## 10.3 Address Information

The address form should support applicable structured information:

- Recipient Name
- Contact Number
- Region
- Province
- City or Municipality
- Barangay
- Street
- Building or House Number
- Subdivision or Landmark
- Delivery Instructions
- Geographic Coordinates, when supported

The address structure must be flexible enough to accommodate different geographic address formats.

## 10.4 Default Address Behavior

If a customer has a main/default address:

- The system must automatically select it for each restaurant delivery group by default.
- Customers must be able to change the destination of each restaurant group.
- Changing the destination of one restaurant group must not automatically change the other groups.
- Customers must be able to review all assigned destinations before submitting checkout.

## 10.5 Address Assignment Level

The preferred default behavior is assigning a delivery address at the restaurant sub-order level.

Example:

**Restaurant A**
- Burger
- Fries
- Milk Tea
- Delivery Address: Home

**Restaurant B**
- Pizza
- Pasta
- Delivery Address: Office

This is simpler than asking customers to assign an address to every individual menu item.

If customers need items from the same restaurant delivered to different destinations, the system must support separating them into distinct fulfillment groups or sub-orders while retaining their restaurant association.

## 10.6 Delivery Coverage Validation

Each restaurant and delivery destination must be validated independently.

The system must:

- Check whether the restaurant delivers to the selected destination.
- Apply the restaurant's supported delivery coverage.
- Display when a destination is outside the delivery area.
- Prevent checkout for unsupported delivery destinations.
- Allow the customer to select another valid address or pickup if supported.

The system must never silently replace an unavailable delivery address with the customer's default address.

## 10.7 Delivery Fees

Delivery fees must be calculated according to the platform's and restaurant's configured pricing.

Each restaurant delivery group must have its own applicable delivery fee.

The system must not assume that one delivery fee covers multiple restaurants or multiple delivery destinations.

## 10.8 Address Snapshot

When an order is successfully submitted, the applicable delivery address must be stored as an order or fulfillment snapshot.

Updating or deleting a customer's saved address must not change the destination of an existing order.

The historical order must retain the address originally confirmed by the customer.

---

# 11. Delivery and Pickup

## 11.1 Fulfillment Options

Customers must be able to choose from the fulfillment methods supported by each restaurant:

- Delivery
- Pickup

A restaurant may support one or both options.

The system must not display unsupported fulfillment methods.

## 11.2 Delivery

For delivery orders, customers must:

- Select a valid delivery address.
- Provide recipient/contact information when required.
- Review the delivery fee.
- Review delivery instructions.
- Confirm the delivery destination before checkout.

## 11.3 Pickup

For pickup orders, customers must:

- Review the restaurant pickup location.
- Review applicable pickup instructions.
- Select an available pickup schedule when supported.
- Receive pickup status updates.

Delivery address information must not be required for a pickup-only transaction unless another applicable process requires it.

## 11.4 Mixed Fulfillment

If a consolidated checkout contains multiple restaurants, each restaurant sub-order may use its own supported fulfillment method.

Example:

- Restaurant A → Delivery to Home
- Restaurant B → Pickup
- Restaurant C → Delivery to Office

The system must clearly display the fulfillment method for every restaurant group.

---

# 12. Order Timing

## 12.1 Standard Orders

Standard orders are processed according to the restaurant's normal ordering and preparation workflow.

The system must validate restaurant availability before accepting the order.

## 12.2 Priority Orders

Customers may select Priority Ordering if the restaurant and platform support it.

If implemented, the system must:

- Clearly explain what Priority means.
- Display applicable additional charges.
- Validate restaurant capacity.
- Validate operational eligibility.
- Avoid promising guaranteed delivery or preparation times without actual operational support.

Priority must not be displayed as a functional option if the backend cannot enforce its behavior.

## 12.3 Scheduled Orders

Customers may schedule orders for a future date and time when supported.

The system must validate:

- Restaurant operating hours
- Available scheduling windows
- Minimum advance notice
- Maximum scheduling period
- Restaurant capacity
- Order cut-off times
- Applicable fulfillment availability

Each restaurant sub-order must be validated independently.

## 12.4 Timing Consistency

The selected timing option must be clearly associated with the relevant restaurant order.

The system must not imply that all restaurants in one consolidated checkout have identical preparation or fulfillment schedules when they do not.

---

# 13. Checkout

## 13.1 Checkout Summary

Before submitting an order, customers must be able to review:

- Restaurant names
- Ordered menu items
- Item quantities
- Selected add-ons
- Special instructions
- Item subtotals
- Restaurant-specific fulfillment methods
- Delivery addresses
- Delivery fees
- Applicable discounts
- Taxes or other configured charges
- Payment method
- Final payable amount

## 13.2 Customer Information Validation

For delivery orders, the system must ensure the required recipient/contact and address information is available.

For pickup orders, the system must validate the required customer contact information according to the checkout requirements.

If information is missing, customers should be guided to complete it without losing their cart.

## 13.3 Final Price Calculation

The backend must calculate the authoritative final order amount.

The calculation must account for:

- Menu item prices
- Add-ons
- Quantities
- Promotions
- Delivery fees
- Applicable taxes
- Other configured charges

The frontend must not be trusted to submit the final payable amount.

## 13.4 Checkout Confirmation

Before final submission, customers must be able to review their complete order.

The system must prevent duplicate order submissions caused by repeated clicks, network retries, or similar conditions.

---

# 14. Payments

## 14.1 Supported Payment Methods

The platform may support payment methods such as:

- Online Payment
- Cash on Delivery
- Cash on Pickup
- Other configured payment methods

Only payment methods that have been implemented and configured must be presented to customers.

## 14.2 Online Payment

When online payment is available, the system must:

- Present the supported payment options.
- Initiate the appropriate payment process.
- Record payment references.
- Verify payment results through trusted backend mechanisms.
- Update payment status only after reliable confirmation.

The frontend must not mark an order as paid merely because the customer clicked a payment button or returned from a payment page.

## 14.3 Payment Status

The system should support applicable payment states:

- Pending
- Processing
- Paid
- Failed
- Cancelled
- Refunded
- Partially Refunded

Payment status must be separate from order fulfillment status.

## 14.4 Consolidated Payment

When a consolidated checkout contains multiple restaurant sub-orders, the system must maintain the relationship between the overall payment and the individual restaurant orders.

Partial acceptance, cancellation, and refunds must be represented accurately.

The system must not charge customers twice for the same checkout because of repeated requests.

## 14.5 Cash Payments

For cash-based transactions, the system must distinguish between:

- Payment method selected
- Payment expected
- Payment collected
- Payment confirmed

Selecting Cash on Delivery or Cash on Pickup does not mean payment has already been received.

---

# 15. Order Tracking

## 15.1 Customer Order History

Customers must be able to view their previous and current orders.

The order history should include:

- Order Reference
- Order Date
- Restaurant
- Items
- Total Amount
- Fulfillment Method
- Payment Status
- Order Status

## 15.2 Order Status

The platform may use the following order lifecycle states, subject to the implemented backend workflow:

- Pending
- Accepted
- Preparing
- Ready for Pickup
- Ready for Dispatch
- Out for Delivery
- Completed
- Rejected
- Cancelled

The actual lifecycle must account for delivery and pickup differences.

## 15.3 Restaurant-Specific Tracking

For consolidated orders, customers must be able to view each restaurant sub-order independently.

Each restaurant group must display its own:

- Restaurant
- Items
- Order Status
- Fulfillment Method
- Destination, when applicable
- Preparation Progress
- Rider Information, when applicable
- Estimated Arrival, when available

## 15.4 Delivery Tracking

When rider tracking is available, customers may view:

- Rider Assignment
- Rider Information
- Delivery Progress
- Last Known Location
- Estimated Arrival Time, when supported

The system must not display fabricated rider locations or estimated arrival times.

Location information must follow the platform's privacy and tracking processes.

## 15.5 Notifications

Customers should receive relevant updates when:

- An order is submitted.
- A restaurant accepts or rejects an order.
- Preparation begins or progresses.
- An order is ready for pickup.
- A rider is assigned.
- Delivery begins.
- An order is completed.
- A payment succeeds or fails.
- A cancellation or refund is processed.

The system must not claim that a notification was sent unless the notification process actually succeeded.

---

# 16. Order Cancellation

## 16.1 Cancellation Functionality

Customers may request cancellation through their order details when cancellation is available.

The interface must clearly explain whether cancellation is currently available.

## 16.2 Restaurant-Specific Cancellation

For consolidated orders, cancellation must be handled at the appropriate restaurant sub-order level.

The interface must clearly identify which restaurant order is being cancelled.

## 16.3 Cancellation Information

The system must record and display relevant cancellation information:

- Cancellation Request
- Cancelled Order or Sub-Order
- Cancellation Reason
- Date and Time
- Applicable Payment Adjustment
- Refund Status, if applicable

## 16.4 Refund Handling

Refunds must follow the configured payment and refund processes.

The system must not display a refund as completed before receiving reliable confirmation.

---

# 17. Table Reservations

## 17.1 Reservation Overview

Customers must be able to reserve actual restaurant tables through SALO.

The reservation system is table-based, not seat-based.

Customers reserve a table with a defined capacity rather than purchasing individual seats.

## 17.2 Restaurant Reservation Availability

Only restaurants that accept reservations should offer the reservation feature.

The system must display the restaurant's available reservation schedules and applicable information.

## 17.3 Table Information

Restaurants may configure tables with capacities such as:

- 2 Persons
- 4 Persons
- 6 Persons
- 8 Persons

Other capacities may be supported.

Table availability must come from actual restaurant table records and reservation schedules.

## 17.4 Reservation Form

Customers should be able to provide:

- Restaurant
- Reservation Date
- Preferred Time
- Number of Guests
- Available Table
- Contact Name
- Contact Number
- Special Requests

The system must validate the requested guest count against the selected table's capacity.

## 17.5 Availability Checking

Before accepting a reservation request, the backend must verify:

- Restaurant reservation availability
- Operating hours
- Reservation schedule
- Table capacity
- Existing reservations
- Temporary table holds, when supported
- Closure dates
- Reservation restrictions

The system must prevent double booking.

## 17.6 Table Selection

Customers may select from available tables when the restaurant supports customer table selection.

If the restaurant uses automatic table assignment, the system must clearly communicate that the final table assignment is determined by the restaurant.

The platform must not display unavailable tables as selectable.

## 17.7 Reservation Status

The system may display reservation statuses such as:

- Pending
- Approved
- Rejected
- Awaiting Payment
- Confirmed
- Completed
- Cancelled
- No-Show
- Expired

The customer interface must distinguish restaurant approval from payment completion.

A reservation must not be represented as fully confirmed if required approval or payment conditions remain incomplete.

---

# 18. Reservation Fees and Payments

## 18.1 Reservation Fee Disclosure

If a restaurant requires a reservation fee, the customer must be informed before submitting the reservation.

The system must display:

- Reservation Fee Amount
- Fee Calculation, if applicable
- Payment Deadline
- Available Payment Methods
- Refundability
- Cancellation Policy
- No-Show Policy

## 18.2 Non-Refundable Reservation Fees

If the reservation fee is non-refundable, this must be clearly disclosed before payment.

Customers must explicitly acknowledge the applicable policy.

The system must not hide the non-refundable condition in an inaccessible section of the interface.

## 18.3 Reservation Payment Options

Depending on restaurant configuration, customers may be offered:

- Online Payment
- Pay at Restaurant

The platform must only display payment options supported by the restaurant and the system.

## 18.4 Payment Verification

Selecting a payment method does not mean payment has been completed.

For online payment, the system must verify the payment result.

For pay-at-restaurant reservations, the system must retain the appropriate payment expectation until the restaurant confirms collection.

## 18.5 Reservation and Payment States

Reservation approval and reservation payment must be tracked separately.

For example:

- Reservation Status: Approved
- Payment Status: Pending

This distinction prevents the platform from incorrectly treating an unpaid reservation as fully settled.

---

# 19. Reservation Cancellation and No-Show

## 19.1 Customer Cancellation

Customers should be able to cancel reservations through their reservation details when cancellation is available.

The interface must display applicable cancellation information before the customer confirms cancellation.

## 19.2 Cancellation Records

The system must retain relevant information:

- Reservation Reference
- Cancellation Requester
- Cancellation Reason
- Cancellation Date and Time
- Previous Reservation Status
- Applicable Fee or Refund Information

## 19.3 No-Show

The system must support the display of a no-show status when the restaurant records that a customer failed to arrive within the applicable reservation policy.

## 19.4 Reservation Expiration

Pending reservations or temporary table holds must display their expiration information when applicable.

Expired reservations must no longer appear as active confirmed reservations.

---

# 20. Food Ordering with Reservations

## 20.1 Separate Transactions

Customers may reserve a table and order food in connection with that reservation when supported.

The system must distinguish between:

- Table Reservation
- Reservation Fee
- Food Order
- Food Payment

These must remain logically separate transactions.

## 20.2 Reserve Now, Order Later

Customers should be able to reserve a table without placing a food order.

A food order must not be mandatory unless the restaurant's configured reservation experience requires it.

## 20.3 Pre-Ordering Food

If supported, customers may place a food pre-order linked to an existing reservation.

The system must:

- Link the food order to the reservation.
- Validate menu availability.
- Validate the restaurant's pre-order functionality.
- Preserve the reservation record independently.
- Track food payment separately from reservation fees.

## 20.4 Separate Status Display

A confirmed table reservation does not automatically mean that food has been ordered.

A completed food payment does not automatically mean that the table reservation is confirmed.

---

# 21. Customer Account Management

## 21.1 Customer Profile

Customers must be able to view and manage their account information.

The profile may include:

- Full Name
- Username
- Email Address
- Phone Number
- Profile Picture
- Saved Addresses

## 21.2 Profile Editing

Customers should be able to update editable information.

The system must validate changes and protect account ownership.

Sensitive changes, such as email or password changes, must follow appropriate verification procedures.

## 21.3 Saved Addresses

Customers must have a dedicated address management section.

It must support the address management and default-address functionality described in Section 10.

## 21.4 Order History

Customers must be able to review previous orders and access their relevant transaction details.

## 21.5 Reservation History

Customers must be able to review:

- Upcoming Reservations
- Pending Reservations
- Confirmed Reservations
- Completed Reservations
- Cancelled Reservations

## 21.6 Account Deactivation and Deletion

Customers should be able to request account deactivation or deletion through account settings.

The system must provide information about the effects of account deletion, particularly for pending orders, active reservations, outstanding payments, refunds, and historical transaction records.

---

# 22. Become a SALO Partner — Restaurant Partnership Application

## 22.1 Overview

SALO must provide existing customers with an option to apply to become restaurant partners.

A person interested in registering a restaurant or food business must first have a regular SALO customer account.

The partnership application must be accessible through the existing customer account.

The customer must not need to create another account just to begin the partnership application.

## 22.2 Entry Point — Become a Partner of SALO

The customer interface must provide a visible partnership option.

Recommended placement:

- Customer Profile
- Account Settings
- Account or Services section

Suggested presentation:

**Partner with SALO!**

"Have a restaurant or food business? Join SALO and reach more customers through our platform."

Suggested call-to-action:

**[Become a Partner]**

The design should make the option easy to discover without interfering with normal customer activities.

## 22.3 Partnership Application Access

When the customer selects the partnership option, the system should open the restaurant partnership application experience.

The application interface should provide:

- An introduction to becoming a SALO partner.
- Information about the application process.
- The required application information.
- An application form.
- A way to save or continue an incomplete application, when supported.
- An application submission confirmation.

## 22.4 Restaurant Partnership Application Form

The application form may collect information such as:

- Restaurant or Business Name
- Business Description
- Business Category
- Cuisine Type
- Restaurant Address
- Contact Information
- Restaurant Logo
- Restaurant Cover Photo
- Supporting Business Information
- Other required documents

The form must clearly distinguish required and optional information.

The system must validate submitted information and uploaded files.

Restaurant logo and cover photo should be collected during the application when required. Approved information should be reused when creating or activating the restaurant business profile to avoid unnecessary duplicate uploads.

## 22.5 Application Progress and Status

Customers must be able to view their partnership application through their existing account.

The interface should provide relevant application status information, such as:

- Draft
- Submitted
- Under Review
- Additional Information Required
- Approved
- Rejected
- Withdrawn

The customer should be able to open the application details and review relevant updates.

## 22.6 Updating an Application

When an application requires additional information, the customer should be guided to the relevant application section.

The interface should identify:

- Information that needs correction
- Missing documents
- Additional details requested
- Application status
- Available next steps

Previously submitted information should be retained where possible so customers do not need to complete the entire form again.

## 22.7 Partnership Application Notifications

Customers should receive relevant notifications about their application, including:

- Application successfully submitted
- Application under review
- Additional information requested
- Application approved
- Application rejected

Notifications must reflect actual application status changes.

## 22.8 After Application Approval

Once the partnership application has been approved and the business workspace is available, the customer interface should provide an option to open the Restaurant Owner workspace.

Suggested button:

**[Open Restaurant Workspace]**

The same account should continue to provide access to normal customer functionality.

The user should not need a separate login just to access their restaurant workspace.

## 22.9 Customer and Restaurant Workspace Navigation

The platform should provide a convenient way for users with an approved restaurant workspace to navigate between:

- Customer Side
- Restaurant Owner Side

The interface may use a workspace switcher, account menu, or another suitable navigation pattern.

The selected workspace should determine which navigation and features are displayed.

## 22.10 Partnership Application Interface by Status

The partnership section should adapt to the customer's application status.

| Application Situation | Suggested Interface |
|---|---|
| No application | Become a Partner of SALO |
| Draft application | Continue Application |
| Submitted application | Application Submitted |
| Under review | View Application Status |
| Additional information required | Update Application |
| Approved | Open Restaurant Workspace |
| Rejected | View Application Result |
| Withdrawn | View Application / Start New Application if available |

The partnership option should remain accessible through the customer's account even when the customer regularly uses ordering and reservation features.

---

# 23. Notifications and Communication

## 23.1 Notification Center

Customers should have a notification center containing relevant platform updates.

Notifications may include:

- Order Updates
- Payment Updates
- Delivery Updates
- Reservation Updates
- Cancellation Updates
- Refund Updates
- Partnership Application Updates
- Promotions
- Important Account Notices

## 23.2 Notification Management

Customers should be able to:

- View notifications.
- Mark notifications as read.
- Review notification history.
- Manage supported notification preferences.

## 23.3 Notification Accuracy

Notifications must reflect actual backend events.

The system must avoid duplicate or misleading notifications.

---

# 24. Customer-Side Security and Privacy

The customer side must provide the following protections:

1. Customers may access only their own personal account information.
2. Customers may access only their own orders and reservations.
3. Customers may manage only their own saved addresses and favorites.
4. Customers must not be able to change restaurant-owned menu information.
5. Customers must not be able to manipulate order prices through frontend requests.
6. Customers must not be able to access another customer's private delivery information.
7. Payment confirmation must be verified by trusted backend processes.
8. Reservation availability must be validated by the backend.
9. Sensitive account information must be protected.
10. Authentication and authorization must be enforced on protected endpoints.
11. Uploaded customer files must follow the platform's file validation and storage requirements.
12. Customer data must be handled according to applicable privacy requirements.

---

# 25. Required Customer-Side Pages and Navigation

The customer interface should provide the following pages or equivalent navigational destinations.

| Page / Section | Main Function |
|---|---|
| Home / Dashboard | Discover restaurants and access customer features. |
| Restaurant Listing | Browse and filter restaurants. |
| Restaurant Details | View restaurant information, menu, and availability. |
| Search Results | Find restaurants using search criteria. |
| Favorites | Manage favorite restaurants. |
| Cart | Review and manage selected menu items. |
| Checkout | Review fulfillment, addresses, charges, and payment. |
| Order Confirmation | Display successful order submission and reference. |
| My Orders | View current and previous orders. |
| Order Details | View restaurant sub-orders and fulfillment progress. |
| Order Tracking | Follow available delivery or pickup progress. |
| Reservations | Discover reservation-capable restaurants. |
| Reservation Details | View reservation information and status. |
| My Reservations | Manage upcoming and previous reservations. |
| Notifications | Review platform updates. |
| My Profile | Manage customer account information. |
| My Addresses | Manage saved delivery addresses. |
| Account Settings | Manage account and security preferences. |
| Become a Partner | Access the restaurant partnership application. |
| My Partnership Application | View application details and progress. |
| Restaurant Workspace Access | Open the approved Restaurant Owner workspace. |

Navigation labels and layout may evolve, but all approved functionality must remain accessible.

---

# 26. Data and Transaction Integrity Requirements

The customer side depends on consistent relationships between customer accounts, orders, restaurant sub-orders, addresses, payments, reservations, and partnership applications.

## 26.1 Customer and Addresses

One customer may have multiple saved addresses.

One address may be designated as the customer's default address.

An address may be assigned to a restaurant delivery group during checkout.

## 26.2 Customer and Orders

One customer may have multiple orders.

One consolidated checkout may contain multiple restaurant-specific sub-orders.

Each sub-order belongs to its respective restaurant.

## 26.3 Sub-Orders and Fulfillment

Each restaurant sub-order must retain its own fulfillment method and applicable delivery or pickup information.

A restaurant sub-order may require its own delivery destination snapshot.

## 26.4 Orders and Payments

Payments must be associated with the appropriate checkout or transaction records.

Partial acceptance, cancellation, and refund processing must remain traceable.

## 26.5 Customer and Reservations

One customer may have multiple reservations.

Each reservation must be associated with the relevant restaurant, table or assignment, schedule, guest count, and payment information when applicable.

## 26.6 Customer and Partnership Applications

A customer account may have a restaurant partnership application associated with it.

The customer must be able to access their own application information and progress.

An approved application should be connected to the appropriate restaurant business workspace.

## 26.7 Historical Data

Historical transaction records must preserve the information necessary to accurately represent the transaction as it existed when confirmed.

Updating a restaurant profile, menu, customer address, or account information must not silently rewrite historical transaction details.

---

# 27. Implementation and Verification Expectations

All customer-side features must be implemented with corresponding frontend, backend, database, and testing support where applicable.

A feature is not considered complete merely because its interface is visible.

Verification must include:

- Successful customer workflows.
- Validation of required and optional fields.
- Backend authorization.
- Database persistence.
- Error handling.
- Loading and empty states.
- Responsive layouts.
- Data consistency.
- Transaction integrity.
- Relevant automated tests.
- Manual verification of important end-to-end workflows.

## 27.1 Critical End-to-End Scenarios

### Scenario A — New Customer

1. Register with Full Name, Username, Email, and Password.
2. Log in.
3. Explore restaurants without providing an address.
4. Add a phone number and address when needed.
5. Save the information to the account.

### Scenario B — Multi-Restaurant Ordering

1. Browse Restaurant A.
2. Add items to the cart.
3. Browse Restaurant B.
4. Add more items.
5. Review the grouped cart.
6. Proceed to one consolidated checkout.
7. Submit the eligible restaurant orders.
8. Track each restaurant sub-order independently.

### Scenario C — Multiple Delivery Addresses

1. Save Home, Office, and School addresses.
2. Add items from Restaurant A and Restaurant B.
3. Proceed to checkout.
4. Assign Home to Restaurant A.
5. Assign Office to Restaurant B.
6. Validate both delivery destinations independently.
7. Calculate applicable delivery fees.
8. Submit the checkout.
9. Verify that each restaurant sub-order retains its correct address snapshot.

### Scenario D — Mixed Fulfillment

1. Add items from two restaurants.
2. Select delivery for Restaurant A.
3. Select pickup for Restaurant B.
4. Review separate fulfillment information.
5. Submit the eligible checkout.
6. Verify that both sub-orders follow their correct workflows.

### Scenario E — Partial Restaurant Rejection

1. Submit a consolidated checkout containing multiple restaurants.
2. One restaurant accepts its sub-order.
3. Another restaurant rejects its sub-order.
4. Verify that both statuses are represented correctly.
5. Verify the appropriate payment adjustment or refund process.
6. Ensure the accepted sub-order can continue processing.

### Scenario F — Table Reservation

1. Open a restaurant that accepts reservations.
2. Select a date and time.
3. Enter the guest count.
4. View available tables.
5. Select a valid table.
6. Review the reservation fee and policies.
7. Submit the reservation.
8. Verify restaurant approval and payment states independently.
9. Confirm the reservation only when its required conditions are satisfied.

### Scenario G — Reservation with Food Pre-Order

1. Make a reservation.
2. Select the food pre-order option if supported.
3. Choose available menu items.
4. Submit the food order.
5. Verify that the food order is linked to the reservation.
6. Verify that reservation and food payment records remain separate.

### Scenario H — Customer Becomes a Restaurant Partner

1. A person creates a normal SALO customer account.
2. The person logs in.
3. The person opens Profile or Account Settings.
4. The person selects "Be a Partner of SALO!"
5. The system opens the restaurant partnership application.
6. The person completes the required application information.
7. The person submits the application.
8. The system displays the application status.
9. The person receives relevant application updates.
10. After approval and workspace activation, the person can open the Restaurant Owner workspace using the same account.
11. The person can still access normal customer features.

---

# 28. Features Requiring Further Business Decisions

The following features require approved platform decisions before their full implementation. Their operational details are documented separately in SALO's Business Rules documentation.

| Feature | Decision Required |
|---|---|
| Multi-restaurant delivery | Whether one rider can handle multiple restaurant orders or each restaurant requires a separate rider. |
| Priority Orders | Exact priority handling, eligibility, and additional fees. |
| Scheduled Orders | Minimum advance notice, maximum scheduling period, and restaurant cut-off rules. |
| Partial Checkout Failure | How the platform handles payment when only some restaurant sub-orders are accepted. |
| Reservation Approval | How long pending reservations remain valid before expiration. |
| Reservation Payment | Whether required payment must be completed before final confirmation. |
| Pay at Restaurant | How unpaid or uncollected reservation fees are handled. |
| Non-Refundable Fees | Exact cancellation and no-show consequences. |
| Table Assignment | Whether customers choose tables or restaurants assign them automatically. |
| Delivery Pricing | Exact delivery fee calculation for each restaurant and destination. |
| Multiple Destinations | Whether separate delivery destinations require separate riders and delivery charges. |
| Account Deletion | Data retention and deletion policy for historical transactions. |
| Partnership Application | Application eligibility, review authority, approval process, and ownership permissions. |

This section identifies topics that need decisions. The authoritative policies and rules must be maintained in the separate Business Rules document.

---

# 29. Definition of Done

A customer-side feature is considered complete only when:

1. Its expected functionality is documented.
2. Its interface is implemented.
3. Its backend behavior is implemented.
4. Its database requirements are satisfied.
5. Required authorization and validation are enforced.
6. Its applicable business rules are followed.
7. Error, loading, and empty states are handled.
8. Relevant automated tests are passing.
9. Important end-to-end scenarios are verified.
10. Documentation reflects the actual implementation.

A visual interface without functional backend integration must not be considered a completed feature.

---

# 30. Document Maintenance

This document is the functional reference for the SALO Customer Side.

Whenever customer-side functionality changes:

- Update this document.
- Record significant changes in the project's documentation change log.
- Keep related API contracts and database documentation consistent.
- Identify whether the change affects other modules, including Restaurant Owner, Rider, or Admin.
- Reference the separate Business Rules document for approved policies and restrictions.
- Avoid duplicating the full business rules in this document.

**End of Document**

**SALO — Where Good Food Brings Us Together.**