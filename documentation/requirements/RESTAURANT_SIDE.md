# SALO — Restaurant Owner Side Functional Requirements

**Project:** SALO — Where Good Food Brings Us Together.  
**Document Type:** Functional Requirements Specification  
**Module:** Restaurant Owner Side  
**Status:** Functional Reference Document  
**Starting Condition:** Restaurant partnership application has already been approved.

---

# 1. Introduction

## 1.1 Purpose

This document defines the functional requirements, features, workflows, and expected behavior of the SALO Restaurant Owner Side.

The Restaurant Owner Side is the business management workspace provided to approved restaurant partners.

It allows restaurant owners and their authorized staff members to manage restaurant information, public profiles, menus, orders, reservations, tables, inventory, operating hours, team members, and business activities.

## 1.2 System Overview

The Restaurant Owner Side functions as a centralized restaurant management system.

It provides restaurant owners with the ability to:

- Manage their restaurant profile.
- Customize their customer-facing restaurant page.
- Manage restaurant branches and locations, when supported.
- Manage menus, categories, and menu item availability.
- Manage add-ons and customization options.
- Receive and process customer orders.
- Manage delivery and pickup orders.
- Manage table reservations.
- Configure tables and seating capacities.
- Monitor available inventory and menu item stock.
- Manage restaurant operating hours.
- Manage multiple restaurant owners and authorized staff members.
- Invite people to become co-owners or staff members.
- Assign staff responsibilities and permissions.
- View restaurant activities and audit logs.
- Monitor business performance and reports.

## 1.3 Starting Condition

This document assumes:

- The restaurant has already been approved by SALO.
- The restaurant has at least one approved owner.
- A restaurant may have one or multiple approved owners.
- Each owner has access to the restaurant business workspace.
- The restaurant has an existing business profile that can be maintained and updated.

The partnership application and administrator approval process are covered by their respective modules.

---

# 2. Restaurant Owner Account and Workspace

## 2.1 Restaurant Owner Account

Each restaurant owner uses their existing SALO account to access the Restaurant Owner Side.

An owner must not need a separate account to manage a restaurant.

The same account may also be used to access normal customer functionality.

If multiple people own the same restaurant, each owner must use their own individual SALO account. Owners must not share one account or login credentials.

## 2.2 Restaurant Workspace

After accessing the Restaurant Owner Side, an owner should be presented with the restaurant management workspace.

The workspace should provide access to the following sections:

1. Overview
2. Business Profile
3. Menu Management
4. Orders
5. Reservations
6. Tables
7. Inventory and Stock
8. Team and Staff
9. Reports and Statistics
10. Activity Logs
11. Settings

The navigation must be organized into separate sections rather than placing every management feature on one long page.

All approved owners of the same restaurant must be able to access the same restaurant workspace.

The available workspace features for ordinary staff members must depend on their assigned permissions.

## 2.3 Multiple Restaurant Management

If an owner is associated with multiple approved restaurants or branches, the workspace should provide a way to select which restaurant or branch they are currently managing.

Information and operations must be associated with the correct restaurant.

The owner must be able to distinguish between restaurant-wide information and branch-specific information where applicable.

This functionality is separate from multiple ownership of one restaurant.

An individual may own multiple restaurants, while one restaurant may also have multiple approved owners.

## 2.4 Multiple Owners of One Restaurant

SALO must support a restaurant having more than one approved owner.

A restaurant may have one or multiple owners associated with it.

Each owner must be connected to the restaurant through an individual ownership membership linked to their existing SALO user account.

All approved owners of the same restaurant must have owner-level access to the restaurant workspace.

The system must support:

- Multiple owners associated with one restaurant.
- Displaying the current approved owners of a restaurant.
- Inviting an existing SALO user to become a co-owner.
- Sending ownership invitations through the SALO platform.
- Allowing the invited user to review and accept or decline the invitation.
- Recording the date an owner joins the restaurant.
- Recording ownership membership status.
- Viewing ownership membership history.
- Managing ownership membership through authorized ownership procedures.
- Recording ownership-related activities in Activity Logs.

An invited person must not become an owner until the required ownership invitation or approval process has been completed.

Ownership membership must be distinguished from ordinary staff membership.

A co-owner must not be treated as an ordinary staff member merely because they are also part of the restaurant team.

All approved owners must be recognized as owners by the system, regardless of which owner originally created or registered the restaurant.

Ownership transfer, removal, disputes, and owner deactivation must follow separate approved Business Rules.

---

# 3. Restaurant Overview Dashboard

## 3.1 Overview

The Overview page provides a summary of the restaurant's current business activities.

It should give the owners a quick understanding of the restaurant's operational condition.

## 3.2 Dashboard Information

The dashboard may display:

- Total Orders
- Pending Orders
- Accepted Orders
- Preparing Orders
- Ready for Pickup
- Out for Delivery
- Completed Orders
- Cancelled Orders
- Pending Reservations
- Confirmed Reservations
- Today's Reservations
- Available Tables
- Menu Items
- Sold-Out Items
- Low-Stock Items
- Today's Sales
- Weekly Sales
- Monthly Sales
- Recent Activities

## 3.3 Dashboard Navigation

Dashboard summaries should be clickable where appropriate.

Examples:

- Clicking Pending Orders opens the Orders section filtered by pending orders.
- Clicking Pending Reservations opens the Reservations section.
- Clicking Low-Stock Items opens the Inventory section.
- Clicking Today's Sales opens the relevant sales report.

## 3.4 Dashboard Updates

The dashboard should reflect current business information.

It should display appropriate loading, empty, and error states.

Information must come from actual restaurant records and transactions.

All owners with access to the restaurant should see the appropriate restaurant-wide dashboard information.

---

# 4. Business Profile Management

## 4.1 Overview

The Business Profile section allows restaurant owners to manage the information displayed on their public restaurant page.

The public restaurant page must use the same restaurant information managed through the Restaurant Owner Side.

This creates a connection between the customer-facing restaurant page and the restaurant management workspace.

All approved owners with access to the restaurant must be able to manage the business profile.

## 4.2 Public Restaurant Page Preview

The owners must be able to view how their restaurant appears to customers.

The preview should display the same major sections customers can see, including:

- Restaurant Logo
- Cover Photo
- Restaurant Name
- Description
- Cuisine Type
- Restaurant Address
- Operating Hours
- Contact Information
- Delivery and Pickup Information
- Reservation Availability
- Ratings and Reviews
- Menu Categories
- Menu Items
- Promotions
- Branch Information, when applicable

Owners must be able to access editing controls from the Business Profile section.

The public page must display only information intended for customers.

Internal management information, ownership records, staff records, activity logs, sales figures, and other private business information must not appear on the public page.

## 4.3 Restaurant Logo

Owners must be able to:

- Upload a restaurant logo.
- Preview the uploaded image.
- Replace the existing logo.
- Remove the logo when permitted.

The logo should be displayed consistently across the restaurant's public page and other relevant platform locations.

## 4.4 Restaurant Cover Photo

Owners must be able to:

- Upload a cover photo.
- Preview the cover photo.
- Replace the existing cover photo.
- Remove the cover photo when permitted.

The cover photo should be displayed prominently on the public restaurant page.

## 4.5 Restaurant Information

Owners must be able to update:

- Restaurant Name, when permitted
- Restaurant Description
- Cuisine Type
- Food Categories
- Contact Information
- Email Address
- Phone Number
- Other supported public business information

Changes must be reflected in the restaurant's customer-facing page.

## 4.6 Restaurant Location and Address

Every restaurant must have a registered physical location.

Owners must be able to manage:

- Country
- Region
- Province
- City or Municipality
- Barangay
- Street Address
- Building or House Number
- Landmark
- Map Location
- Geographic Coordinates, when supported

The interface should provide a map-based location selector where available.

Owners must be able to adjust the map pin to represent the restaurant's actual location.

## 4.7 Delivery Service Coverage

The restaurant's registered location and delivery coverage must determine the areas where it can serve customers.

Owners must be able to configure the supported delivery service area through available platform tools.

Possible coverage configurations include:

- Selected Cities or Municipalities
- Selected Barangays
- Delivery Zones
- Configured Delivery Radius
- Other supported geographic coverage methods

The system should provide a visual representation of the restaurant's service area when map-based coverage is supported.

Owners should be able to review whether a customer's delivery address is within the restaurant's service coverage.

The system must distinguish the restaurant's physical address from its delivery coverage area.

## 4.8 Delivery and Pickup Availability

Owners must be able to manage whether the restaurant currently offers:

- Delivery
- Pickup
- Both Delivery and Pickup

The public restaurant page must reflect the currently configured services.

## 4.9 Restaurant Profile Preview

Owners should be able to preview the public restaurant page before or after making changes.

The preview should resemble the actual customer-facing experience.

Owners must not need to navigate to a separate customer account to see their restaurant's public page.

## 4.10 Restaurant Profile Photos

Owners must be able to manage supported restaurant gallery photos.

The gallery may include:

- Restaurant Interior
- Restaurant Exterior
- Food Photos
- Dining Area
- Other Restaurant Photos

Owners should be able to add, replace, reorder, and remove gallery images where supported.

---

# 5. Operating Hours and Restaurant Availability

## 5.1 Operating Hours

Owners must be able to configure the restaurant's weekly operating schedule.

The schedule should support:

- Monday
- Tuesday
- Wednesday
- Thursday
- Friday
- Saturday
- Sunday

Each day should support:

- Opening Time
- Closing Time
- Closed Status

## 5.2 Multiple Operating Periods

The system should support restaurants that operate in multiple periods within one day.

Example:

- 8:00 AM – 12:00 PM
- 1:00 PM – 9:00 PM

## 5.3 Overnight Operating Hours

The operating schedule must support overnight business hours.

Example:

- 6:00 PM – 2:00 AM

The system must correctly determine whether the restaurant is currently open.

## 5.4 Temporary Closures

Owners must be able to configure temporary closures.

Examples:

- Holidays
- Renovations
- Private Events
- Emergency Closures
- Maintenance

The closure information must be reflected in the customer-facing restaurant page.

## 5.5 Accepting Orders and Reservations

Owners should have separate controls for:

- Accepting Orders
- Accepting Reservations

This allows the restaurant to temporarily stop accepting orders while continuing to accept reservations, or vice versa, when its operations permit.

The interface should clearly display the current availability state.

---

# 6. Menu Management

## 6.1 Overview

The Menu Management section allows owners and authorized staff to manage the restaurant's food and beverage offerings.

Menu information must be reflected on the customer-facing restaurant page.

## 6.2 Menu Categories

Owners must be able to:

- Create menu categories.
- Edit menu categories.
- Delete menu categories when permitted.
- Reorder categories.
- Set category visibility.

Examples:

- Best Sellers
- Rice Meals
- Burgers
- Pasta
- Pizza
- Beverages
- Desserts
- Snacks

## 6.3 Menu Items

Owners must be able to:

- Add a menu item.
- Edit an existing menu item.
- Remove or archive a menu item.
- Assign an item to a category.
- Change item availability.
- Update item pricing.
- Upload or replace its photo.
- Update its description.

## 6.4 Menu Item Information

Each menu item may contain:

- Item Name
- Item Photo
- Description
- Category
- Regular Price
- Discounted Price, when applicable
- Preparation Information
- Availability
- Stock Quantity, when inventory tracking is enabled
- Add-on Groups
- Customization Options
- Dietary Information, when supported

## 6.5 Menu Item Photos

Owners must be able to:

- Upload menu item photos.
- Preview photos.
- Replace photos.
- Remove photos.
- View the photo displayed to customers.

The image upload interface should support appropriate image validation and preview.

## 6.6 Menu Item Availability

Owners and authorized staff must be able to manage whether a menu item is:

- Available
- Sold Out
- Temporarily Unavailable
- Hidden from the Customer Menu

The public restaurant page must reflect the item's current availability.

## 6.7 Menu Item Pricing

Owners must be able to update menu item prices.

Price changes must be reflected in future customer orders.

Previously submitted orders must retain their original transaction pricing.

## 6.8 Add-ons and Customization

Owners must be able to configure add-on groups for menu items.

Examples:

- Extra Cheese
- Extra Rice
- Additional Meat
- Drink Size
- Sauce Options
- Toppings

Each add-on configuration may include:

- Add-on Name
- Additional Price
- Availability
- Required or Optional Selection
- Minimum Selection
- Maximum Selection

Owners should be able to preview how add-ons appear to customers.

## 6.9 Menu Search and Filtering

Owners and authorized staff should be able to search and filter menu items by:

- Item Name
- Category
- Availability
- Stock Status

This makes it easier to manage restaurants with large menus.

---

# 7. Orders Management

## 7.1 Overview

The Orders section allows restaurant owners and authorized staff to receive, review, and process incoming customer orders.

The restaurant must only access orders associated with its own restaurant or authorized branches.

## 7.2 Orders Dashboard

The Orders section should provide separate views or filters for:

- New Orders
- Pending Orders
- Accepted Orders
- Preparing Orders
- Ready for Pickup
- Ready for Dispatch
- Out for Delivery, when relevant
- Completed Orders
- Rejected Orders
- Cancelled Orders

## 7.3 New Order Notifications

When a customer submits an order, the restaurant should receive an appropriate notification.

The order should appear in the restaurant's order management interface.

The interface should provide a clear indication when an order requires staff action.

## 7.4 Order Details

Restaurant owners and authorized staff must be able to view relevant order information:

- Order Reference
- Customer Information
- Ordered Items
- Item Quantities
- Selected Add-ons
- Special Instructions
- Order Subtotal
- Applicable Discounts
- Applicable Charges
- Fulfillment Method
- Delivery Address, for delivery orders
- Pickup Information, for pickup orders
- Payment Status
- Order Time
- Requested Schedule, when applicable

## 7.5 Order Acceptance

Authorized staff assigned to order handling must be able to:

- Review incoming orders.
- Accept orders.
- Reject orders when permitted.
- Provide a rejection reason when required.
- View order details.

After acceptance, the order should move to the appropriate preparation workflow.

## 7.6 Order Preparation

Authorized staff must be able to update order progress.

Possible preparation stages include:

- Accepted
- Preparing
- Ready for Pickup
- Ready for Dispatch

The interface should make it easy to update order progress.

## 7.7 Delivery Orders

For delivery orders, the restaurant must be able to:

- Review the delivery destination.
- Review delivery instructions.
- Prepare the order.
- Mark the order as ready for dispatch.
- View available rider or dispatch information when supported.

The restaurant must not be able to arbitrarily change the customer's confirmed delivery destination.

## 7.8 Pickup Orders

For pickup orders, staff must be able to:

- Review pickup information.
- Prepare the order.
- Mark it as ready for pickup.
- Verify the appropriate pickup completion process.
- Mark the order as completed when the pickup is confirmed.

## 7.9 Scheduled Orders

The restaurant should be able to view scheduled orders separately from immediate orders.

Scheduled orders should display:

- Requested Date
- Requested Time
- Fulfillment Method
- Preparation Requirements
- Order Status

## 7.10 Priority Orders

When Priority Ordering is supported, the restaurant interface should clearly identify priority orders.

The interface must display the applicable priority information and any operational instructions.

## 7.11 Order Cancellation

Authorized staff should be able to review cancellation requests.

The order interface must clearly distinguish between:

- Customer Cancellation Request
- Restaurant Rejection
- Restaurant-Initiated Cancellation, when supported
- Completed Cancellation

The restaurant should be able to view the relevant cancellation information and status.

## 7.12 Multi-Restaurant Customer Orders

When a customer places one consolidated checkout containing multiple restaurants, each restaurant must only receive and manage its own sub-order.

The restaurant must not see another restaurant's private order details, staff information, or internal operations.

## 7.13 Order Search and Filtering

Staff should be able to search orders using:

- Order Reference
- Customer Name, when permitted
- Order Date
- Order Status
- Fulfillment Method

---

# 8. Reservation Management

## 8.1 Overview

The Reservations section allows the restaurant to manage table reservations submitted by customers.

It must provide the restaurant with a dedicated reservation management interface separate from food order management.

## 8.2 Reservation Dashboard

The dashboard should display:

- New Reservation Requests
- Pending Reservations
- Approved Reservations
- Confirmed Reservations
- Today's Reservations
- Upcoming Reservations
- Cancelled Reservations
- Completed Reservations
- No-Show Reservations

## 8.3 Reservation Details

Authorized reservation staff must be able to view:

- Reservation Reference
- Customer Name
- Contact Number
- Reservation Date
- Reservation Time
- Number of Guests
- Assigned Table
- Special Requests
- Reservation Fee
- Payment Status
- Reservation Status
- Submission Date

## 8.4 Reservation Approval

Authorized staff assigned to reservation management must be able to:

- Review new reservation requests.
- View table availability.
- Approve reservations.
- Reject reservations.
- Provide a rejection reason when required.
- Assign an available table.
- View reservation payment status.

## 8.5 Reservation Calendar

The restaurant should have a calendar interface to visualize reservations.

The calendar should support:

- Daily View
- Weekly View
- Monthly View

Reservations should be displayed according to their date, time, and assigned table.

Staff should be able to select a reservation to view its details.

## 8.6 Reservation Status Updates

Authorized staff must be able to update reservation progress.

Possible statuses include:

- Pending
- Approved
- Awaiting Payment
- Confirmed
- Arrived
- Seated
- Completed
- Cancelled
- No-Show
- Expired

The interface must distinguish approval, payment, and actual customer arrival.

## 8.7 Customer Arrival

The restaurant must be able to identify customers who have arrived for their reservations.

Authorized staff should be able to:

- Mark a reservation as Arrived.
- Confirm the assigned table.
- Mark the customer as Seated.
- Mark the reservation as Completed.

## 8.8 Reservation Cancellation

Staff should be able to review customer cancellation requests and applicable reservation information.

The system must display relevant fee and payment information.

## 8.9 Reservation Fee Management

The restaurant should be able to view reservation fee information.

The interface may display:

- Required Reservation Fee
- Payment Method
- Payment Status
- Payment Reference
- Payment Deadline
- Refund Information, when applicable

## 8.10 Reservation Search and Filtering

Authorized staff should be able to search reservations by:

- Reservation Reference
- Customer Name
- Reservation Date
- Reservation Status
- Assigned Table

---

# 9. Table Management

## 9.1 Overview

The Tables section allows the restaurant to manage its physical dining tables and their seating capacities.

The reservation system must use actual restaurant table records rather than treating individual seats as separate reservations.

## 9.2 Table Registration

Owners or authorized staff must be able to add tables.

Each table may contain:

- Table Name or Number
- Seating Capacity
- Table Description
- Dining Area
- Availability
- Table Status

Examples:

- Table 1 — 2 Persons
- Table 2 — 4 Persons
- Table 3 — 6 Persons
- Table 4 — 8 Persons

## 9.3 Table Organization

The restaurant should be able to organize tables according to dining areas.

Examples:

- Indoor
- Outdoor
- VIP Area
- Family Area
- Private Dining

## 9.4 Table Status

The system should support table statuses such as:

- Available
- Reserved
- Occupied
- Unavailable
- Maintenance

The displayed status must reflect the actual reservation and restaurant operations.

## 9.5 Table Availability

The system must use table capacity, reservation schedules, and existing reservations when determining table availability.

A table already reserved or occupied must not appear as freely available for an overlapping reservation.

## 9.6 Table Assignment

Authorized reservation staff should be able to assign available tables to reservations.

The interface should show which tables are available for the selected date and time.

## 9.7 Table Editing

Owners or authorized staff must be able to:

- Edit table information.
- Change seating capacity when appropriate.
- Change dining area.
- Mark a table unavailable.
- Restore a table to availability.

Changes to table information must not silently invalidate existing confirmed reservations.

---

# 10. Inventory and Stock Management

## 10.1 Overview

The Inventory and Stock section allows the restaurant to monitor available ingredients, supplies, and menu item quantities.

It helps the restaurant identify items that are running low or unavailable.

## 10.2 Inventory Items

The restaurant should be able to manage inventory records containing:

- Ingredient or Supply Name
- Category
- Unit of Measurement
- Current Quantity
- Minimum Stock Level
- Maximum Stock Level, when used
- Supplier Information, when supported
- Expiration Date, when applicable

## 10.3 Stock Management

Authorized staff should be able to:

- Add stock.
- Record stock received.
- Record stock usage.
- Adjust stock quantities.
- View stock movement history.
- Mark inventory items unavailable.
- View low-stock items.

## 10.4 Stock Alerts

The system should identify:

- In-Stock Items
- Low-Stock Items
- Out-of-Stock Items
- Expiring Items, when expiration tracking is supported

The dashboard should highlight important stock conditions.

## 10.5 Menu Item Stock

The restaurant should be able to manage the available quantity of menu items when item-level stock tracking is enabled.

Example:

- Chicken Rice — 20 available
- Beef Burger — 15 available
- Milk Tea — 30 available

The restaurant should be able to mark an item sold out when its available quantity reaches zero.

## 10.6 Ingredient-Based Availability

Where recipe or ingredient relationships are supported, the system may connect menu items to the ingredients used to prepare them.

This allows the platform to help determine whether a menu item can still be prepared based on ingredient availability.

The system must not automatically assume that every restaurant uses the same ingredient or recipe structure.

## 10.7 Stock History

The restaurant should be able to review stock movements, including:

- Stock Added
- Stock Deducted
- Stock Adjusted
- Stock Returned
- Other Recorded Changes

Each stock movement should identify its date, quantity, and responsible user.

## 10.8 Sales and Stock Relationship

The system may integrate order completion and inventory management.

When an order is processed, the platform should follow the restaurant's configured inventory deduction method.

The restaurant must be able to review how sales and stock movements affect item availability.

---

# 11. Promotions and Discounts

## 11.1 Overview

The restaurant should be able to create and manage available promotions when the platform supports restaurant-managed promotions.

## 11.2 Promotion Information

A promotion may contain:

- Promotion Name
- Description
- Discount Type
- Discount Value
- Start Date
- End Date
- Eligible Menu Items
- Applicable Categories
- Minimum Purchase Amount
- Usage Limit
- Promotion Image

## 11.3 Promotion Management

Authorized staff should be able to:

- Create promotions.
- Edit promotions.
- Activate promotions.
- Deactivate promotions.
- View promotion performance.

## 11.4 Customer Visibility

Active promotions intended for customers should appear on the restaurant's public page and applicable menu items.

Expired or inactive promotions must not be presented as currently available.

---

# 12. Team and Staff Management

## 12.1 Overview

The Team and Staff section allows restaurant owners to invite people to become part of the restaurant's team.

The owners should be able to manage team members, assign responsibilities, and control access to restaurant management features.

The system must distinguish between:

- Restaurant Owners
- Restaurant Staff

Multiple owners may have owner-level access to the same restaurant.

Staff members receive access according to their assigned responsibilities and permissions.

## 12.2 Restaurant Team Structure

The suggested team structure is:

**Restaurant Owner / Co-Owner**

- Full restaurant management access.
- Accesses the restaurant workspace.
- Manages the restaurant profile and operations.
- Invites and manages staff.
- Assigns staff responsibilities.
- Monitors restaurant operations.
- Manages restaurant settings and team permissions.
- Can view the restaurant's ownership membership.
- Can invite eligible SALO users to become co-owners through the ownership invitation process.

All approved owners must be treated as owners of the same restaurant.

The system must not automatically treat the first registered owner as the only legitimate owner unless a separate approved policy explicitly defines a particular responsibility.

**Restaurant Manager**

- Supervises daily restaurant operations.
- May manage several operational sections when assigned.
- Monitors orders, reservations, menu availability, and staff activities.
- May assist in coordinating restaurant operations.

**Order Handler**

- Receives and reviews incoming orders.
- Accepts or rejects orders when assigned.
- Updates order preparation status.
- Manages pickup and dispatch preparation.

**Reservation Handler**

- Reviews reservation requests.
- Checks table availability.
- Approves or rejects reservations when assigned.
- Assigns tables.
- Updates customer arrival and seating status.

**Inventory or Stock Manager**

- Monitors available ingredients and supplies.
- Records stock movements.
- Updates inventory quantities.
- Monitors low-stock and unavailable items.

**Menu Manager**

- Manages menu items and categories.
- Updates item descriptions and photos.
- Updates menu prices.
- Manages add-ons and customization options.
- Updates menu item availability.

**Other Assigned Staff**

- May receive specific permissions for selected restaurant functions.

These are suggested functional positions. The actual access of each staff member must be based on assigned permissions.

## 12.3 Staff Invitation

Restaurant owners must be able to invite a person to join the restaurant team as staff.

The invitation interface should provide a search field.

Owners should be able to search using:

- Username
- Email Address

The system should display matching eligible SALO user accounts.

Owners should be able to select the intended person and send an invitation.

Staff invitations must be distinct from ownership invitations.

## 12.4 Staff Invitation Information

The invitation should contain:

- Restaurant Name
- Inviting Owner
- Invited User
- Assigned Position
- Assigned Responsibilities
- Invitation Date
- Invitation Status

## 12.5 Staff Invitation Acceptance

The invited person should receive an invitation through their SALO account.

The invitation should be accessible through a notification or dedicated invitations section.

The invited person should be able to:

- View the invitation.
- Review the restaurant name.
- View the assigned position.
- Review the requested responsibilities.
- Accept the invitation.
- Decline the invitation.

Once accepted, the person becomes a member of that restaurant's staff team and can access the assigned workspace features.

The person must use their existing SALO account.

## 12.6 Staff Invitation Status

The team management interface should display:

- Pending
- Accepted
- Declined
- Expired
- Revoked

Owners should be able to review pending invitations and revoke them when appropriate.

## 12.7 Assigning Staff Positions

Owners should be able to assign a staff member a position.

Suggested positions:

- Manager
- Order Handler
- Reservation Handler
- Inventory Manager
- Menu Manager
- Custom Staff Position

Owners should be able to change a staff member's position and assigned responsibilities.

## 12.8 Permission Assignment

The system should provide permission controls for assigning access to specific restaurant functions.

Possible permission groups include:

**Business Profile**

- View Business Profile
- Edit Business Profile
- Manage Restaurant Photos
- Manage Location and Delivery Coverage
- Manage Operating Hours

**Menu Management**

- View Menu
- Create Menu Items
- Edit Menu Items
- Delete or Archive Menu Items
- Manage Menu Photos
- Manage Menu Availability
- Manage Pricing
- Manage Add-ons

**Orders**

- View Orders
- Accept Orders
- Reject Orders
- Update Preparation Status
- Manage Pickup Progress
- View Customer Order Information

**Reservations**

- View Reservations
- Approve Reservations
- Reject Reservations
- Assign Tables
- Update Reservation Status
- Manage Customer Arrival

**Tables**

- View Tables
- Add Tables
- Edit Tables
- Manage Table Availability

**Inventory**

- View Inventory
- Add Stock
- Deduct Stock
- Adjust Stock
- View Stock History

**Promotions**

- View Promotions
- Create Promotions
- Edit Promotions
- Activate or Deactivate Promotions

**Reports**

- View Sales Reports
- View Order Reports
- View Reservation Reports
- View Inventory Reports

**Team Management**

- View Team Members
- Invite Staff
- Manage Staff Permissions

Ownership membership must not be assigned through ordinary staff permission settings.

A staff member must not become a co-owner simply because they have extensive staff permissions.

## 12.9 Staff Management Interface

The Team page should display:

- Staff Name
- Username
- Email Address
- Profile Picture, when available
- Assigned Position
- Assigned Responsibilities
- Membership Status
- Date Joined

Owners should be able to open a staff member's details and manage their assigned access.

## 12.10 Staff Removal and Access Changes

Owners should have access to staff management actions such as:

- Change Position
- Update Permissions
- Suspend Access
- Remove Staff Member

When a staff member is removed or their access is suspended, their access to the restaurant workspace must be updated accordingly.

These staff actions must not accidentally modify an individual's ownership membership.

## 12.11 Staff Workspace

Staff members should see a restaurant workspace that reflects their assigned responsibilities.

Examples:

- Order handlers should have access to the Orders section.
- Reservation handlers should have access to the Reservations and relevant Tables sections.
- Inventory managers should have access to Inventory.
- Menu managers should have access to Menu Management.
- Managers should see the operational sections assigned to them.

The interface should not display inaccessible management controls as if the staff member can use them.

## 12.12 Ownership Invitation and Co-Owner Management

The restaurant must support a separate process for inviting another SALO user to become a co-owner.

The ownership invitation interface should allow an existing owner to:

1. Open the ownership management area.
2. Search for an existing SALO user using their username or email address.
3. Select the intended user.
4. Review the selected user's account information.
5. Send an ownership invitation.
6. View the invitation status.

The invited user should receive an ownership invitation through their SALO account.

The invitation should display:

- Restaurant Name
- Inviting Owner
- Invited User
- Invitation Date
- Invitation Status
- Ownership Invitation Details

The invited user must be able to:

- View the invitation.
- Review the restaurant they are being invited to co-own.
- Review the inviting owner.
- Accept the invitation.
- Decline the invitation.

Once the invitation has been accepted and the required process is completed, the user must appear in the restaurant's approved owners list.

The newly approved co-owner must receive owner-level access to the restaurant workspace.

The system must record the ownership membership and the user who initiated the invitation.

Ownership invitations must not be confused with ordinary staff invitations.

## 12.13 Ownership Management Interface

The restaurant workspace should provide a way to view its approved owners separately from ordinary staff.

The ownership management interface should display:

- Owner Name
- Username
- Email Address
- Profile Picture, when available
- Ownership Membership Status
- Date Joined
- Invitation or Approval Information, when applicable

The interface should distinguish approved owners from:

- Pending ownership invitations
- Ordinary staff members
- Suspended or inactive memberships, when applicable

All approved owners must be recognized as owners of the same restaurant.

Ownership changes and removal procedures must follow the separate Business Rules document.

---

# 13. Reports and Statistics

## 13.1 Overview

The Reports and Statistics section allows owners and authorized staff to review restaurant performance.

It should provide information useful for understanding sales, orders, reservations, and inventory.

## 13.2 Sales Reports

The system should provide sales summaries such as:

- Today's Sales
- Weekly Sales
- Monthly Sales
- Custom Date Range
- Sales by Menu Item
- Sales by Category
- Sales by Branch, when applicable

## 13.3 Order Reports

The system should provide:

- Total Orders
- Completed Orders
- Cancelled Orders
- Rejected Orders
- Average Order Value
- Popular Menu Items
- Order Trends

## 13.4 Reservation Reports

The system should provide:

- Total Reservations
- Confirmed Reservations
- Cancelled Reservations
- Completed Reservations
- No-Show Reservations
- Reservation Trends
- Table Utilization

## 13.5 Inventory Reports

The system should provide:

- Current Stock
- Low-Stock Items
- Out-of-Stock Items
- Stock Movement History
- Frequently Used Inventory Items

## 13.6 Report Filtering

Reports should support applicable filters:

- Date Range
- Branch
- Order Status
- Menu Category
- Menu Item
- Fulfillment Method

## 13.7 Report Export

Where supported, authorized users should be able to export reports in appropriate formats such as PDF or CSV.

All owners should be able to access the restaurant's reports, subject to platform-wide financial and data-access policies.

---

# 14. Activity Logs

## 14.1 Overview

The Activity Logs section records important actions performed within the restaurant workspace.

It allows all authorized owners to monitor restaurant activities and identify which team member or owner performed a particular action.

## 14.2 Recorded Activities

The system should record activities such as:

**Business Profile**

- Restaurant Name Updated
- Restaurant Description Updated
- Logo Changed
- Cover Photo Changed
- Restaurant Address Updated
- Delivery Coverage Updated
- Operating Hours Updated

**Menu Management**

- Menu Category Created
- Menu Category Updated
- Menu Item Added
- Menu Item Updated
- Menu Item Removed
- Menu Price Changed
- Menu Availability Changed
- Menu Photo Updated

**Orders**

- Order Accepted
- Order Rejected
- Order Preparation Updated
- Order Marked Ready
- Order Completed
- Order Cancellation Processed

**Reservations**

- Reservation Approved
- Reservation Rejected
- Reservation Table Assigned
- Reservation Status Updated
- Customer Marked as Arrived
- Reservation Completed

**Tables**

- Table Created
- Table Updated
- Table Marked Unavailable
- Table Availability Updated

**Inventory**

- Stock Added
- Stock Deducted
- Stock Adjusted
- Inventory Item Updated

**Team Management**

- Staff Invitation Sent
- Staff Invitation Accepted
- Staff Invitation Declined
- Staff Position Changed
- Staff Permission Updated
- Staff Suspended
- Staff Removed

**Ownership Management**

- Ownership Invitation Sent
- Ownership Invitation Accepted
- Ownership Invitation Declined
- Co-Owner Added
- Ownership Membership Updated
- Ownership Membership Ended, when applicable
- Ownership Transfer Initiated, when supported
- Ownership Transfer Completed, when supported

**Settings**

- Restaurant Settings Updated
- Payment Configuration Updated, when supported

## 14.3 Activity Log Information

Each activity record should contain:

- Activity Description
- User Who Performed the Action
- User Position or Role
- Restaurant
- Affected Record
- Date and Time
- Relevant Before-and-After Information, when applicable

The system must be able to distinguish whether an action was performed by an owner, co-owner, or ordinary staff member.

## 14.4 Activity Log Search and Filtering

Owners and authorized users should be able to filter activities by:

- Staff Member or Owner
- Activity Type
- Module
- Date Range

## 14.5 Activity Log Details

Owners should be able to open an activity record to view additional details.

For important changes, the interface should show the previous value and the updated value.

Activity logs must be distinguishable from ordinary notifications.

They are intended to provide a historical record of restaurant workspace actions.

---

# 15. Restaurant Settings

## 15.1 Overview

The Settings section provides access to restaurant configuration and management options.

## 15.2 Business Settings

Owners should be able to manage:

- Restaurant Information
- Operating Hours
- Delivery and Pickup Availability
- Delivery Coverage
- Branch Information, when applicable

## 15.3 Order Settings

Owners should be able to configure supported ordering options, including:

- Accepted Fulfillment Methods
- Order Preparation Settings
- Scheduled Ordering Availability
- Priority Ordering Availability, when supported
- Other available order configuration options

## 15.4 Reservation Settings

Owners should be able to manage:

- Reservation Availability
- Reservation Schedule
- Available Reservation Time Slots
- Reservation Duration
- Reservation Fee
- Reservation Payment Options
- Table Assignment Preferences
- Reservation Instructions

## 15.5 Notification Settings

Owners should be able to configure supported restaurant notifications.

Examples:

- New Order Notifications
- New Reservation Notifications
- Cancellation Notifications
- Low-Stock Notifications
- Staff Invitation Notifications
- Ownership Invitation Notifications

## 15.6 Payment Settings

Owners should be able to view or manage supported restaurant payment configuration options.

Sensitive payment credentials and financial information must be handled through appropriate protected interfaces.

---

# 16. Restaurant Branch Management

## 16.1 Overview

If a restaurant operates multiple branches, the owners should be able to manage the branches through the Restaurant Owner Side.

Each branch may have its own:

- Branch Name
- Address
- Location
- Operating Hours
- Contact Information
- Delivery Coverage
- Menu Availability
- Tables
- Reservations
- Orders
- Staff Assignments

## 16.2 Branch Selection

Owners should be able to select the branch they want to manage.

The system should clearly identify which branch is currently selected.

## 16.3 Branch-Specific Information

Orders, reservations, inventory, operating hours, and other operational records must be associated with the correct branch when branch management is enabled.

## 16.4 Restaurant-Wide Information

Owners should be able to distinguish between shared restaurant information and branch-specific information.

Changes to one branch must not unintentionally modify unrelated branches.

## 16.5 Owner Access Across Branches

All approved owners of a restaurant should be able to access the restaurant's workspace and its applicable branch management features.

If branch-specific restrictions are introduced in the future, they must be handled through explicitly approved ownership or access policies rather than silently treating a co-owner as ordinary staff.

---

# 17. Restaurant Owner and Staff Navigation

The Restaurant Owner Side should provide a consistent navigation experience.

Suggested sidebar structure:

| Navigation | Purpose |
|---|---|
| Overview | Business dashboard and summaries |
| Business Profile | Manage public restaurant page |
| Menu Management | Manage categories, items, prices, and photos |
| Orders | Process customer orders |
| Reservations | Manage customer reservations |
| Tables | Manage physical dining tables |
| Inventory | Monitor ingredients and stock |
| Promotions | Manage restaurant promotions |
| Team and Staff | Manage restaurant team |
| Reports and Statistics | Review business performance |
| Activity Logs | Review historical workspace activities |
| Settings | Configure restaurant operations |

The available navigation items must reflect the signed-in user's assigned access.

All approved owners must have access to the complete restaurant workspace.

Staff members should see the sections relevant to their assigned responsibilities.

The interface should distinguish ownership management from ordinary staff management.

---

# 18. Data and Transaction Integrity Requirements

The Restaurant Owner Side must maintain consistent relationships between restaurants, owners, branches, users, staff assignments, menus, orders, reservations, tables, inventory, and activities.

## 18.1 Restaurant and Owners

A restaurant may be associated with one or multiple approved owners.

Each ownership membership must be associated with:

- User
- Restaurant
- Ownership Membership Status
- Date Joined
- Relevant Ownership Invitation or Approval Record, when applicable

The system must support multiple ownership records for one restaurant.

Each owner must use their own SALO user account.

All approved owners must be recognized as owners of the same restaurant.

The system must not assume that a restaurant has only one owner.

The system must distinguish between the relationship of a user to a restaurant as an owner and the relationship of a user to a restaurant as ordinary staff.

Ownership membership must not be represented only as an ordinary staff position or permission assignment.

## 18.2 Restaurant and Staff

A restaurant may have multiple staff members.

Each staff membership must be associated with:

- User
- Restaurant
- Assigned Position
- Assigned Permissions
- Membership Status

Staff membership must remain separate from ownership membership.

A staff member must not automatically become an owner because of their assigned position or permissions.

## 18.3 Restaurant and Menu

A restaurant may have multiple menu categories and menu items.

Each menu item must be associated with the correct restaurant and applicable category.

## 18.4 Restaurant and Orders

A restaurant must only access and manage its own orders and relevant sub-orders.

Order history must retain the transaction information associated with the submitted order.

## 18.5 Restaurant and Reservations

A restaurant may have multiple reservations.

Each reservation must be associated with the correct restaurant, schedule, customer, and table assignment when applicable.

## 18.6 Restaurant and Tables

A restaurant may have multiple physical tables.

Each table must retain its own capacity and relevant availability information.

## 18.7 Restaurant and Inventory

A restaurant may maintain multiple inventory records.

Inventory changes must be traceable through stock movement records.

## 18.8 Restaurant and Activity Logs

Important workspace actions must be associated with the user who performed them and the affected restaurant.

Activity history must remain available for authorized review.

Ownership-related actions must also be recorded in the restaurant's activity history.

---

# 19. Implementation and Verification Expectations

All Restaurant Owner Side features must be supported by appropriate frontend, backend, database, and testing functionality.

A management page is not considered complete merely because its interface is visible.

Verification must include:

- Successful restaurant owner workflows.
- Multiple owners accessing the same restaurant.
- Correct ownership membership records.
- Correct ownership invitation and acceptance.
- Correct distinction between owners and ordinary staff.
- Correct staff access.
- Correct permission enforcement.
- Data persistence.
- Backend authorization.
- File upload validation.
- Order processing.
- Reservation management.
- Table availability.
- Inventory updates.
- Activity logging.
- Error handling.
- Loading and empty states.
- Responsive layouts.
- Database consistency.
- Relevant automated tests.
- Manual verification of important end-to-end workflows.

## 19.1 Critical End-to-End Scenarios

### Scenario A — Restaurant Profile Management

1. An owner opens the Restaurant Owner workspace.
2. The owner opens Business Profile.
3. The owner changes the restaurant logo.
4. The owner changes the cover photo.
5. The owner updates restaurant information.
6. The owner updates the restaurant location.
7. The owner configures delivery coverage.
8. The owner previews the public restaurant page.
9. Changes appear on the customer-facing page.
10. Important changes appear in Activity Logs.

### Scenario B — Menu Management

1. An owner opens Menu Management.
2. The owner creates a menu category.
3. The owner adds a menu item.
4. The owner uploads a menu photo.
5. The owner sets its price.
6. The owner configures add-ons.
7. The owner publishes the available menu item.
8. The item appears on the customer-facing restaurant page.
9. The owner marks the item Sold Out.
10. The customer-facing page reflects its new availability.

### Scenario C — Order Processing

1. A customer submits an order.
2. The restaurant receives a new order notification.
3. An authorized order handler opens the order.
4. The handler reviews order details.
5. The handler accepts or rejects the order.
6. If accepted, the handler updates preparation status.
7. The order is marked ready for pickup or dispatch.
8. The relevant order progress is reflected in the customer interface.
9. Important actions appear in Activity Logs.

### Scenario D — Reservation Management

1. A customer submits a table reservation.
2. The restaurant receives a reservation notification.
3. An authorized reservation handler opens the request.
4. The handler reviews guest count and availability.
5. The handler approves or rejects the reservation.
6. An available table is assigned.
7. Payment information is reviewed when applicable.
8. The reservation status is updated.
9. The customer receives the appropriate update.
10. The action is recorded in Activity Logs.

### Scenario E — Table Management

1. An owner opens Tables.
2. The owner adds a table.
3. The owner sets its capacity.
4. The owner assigns it to a dining area.
5. The table appears in the reservation management interface.
6. A reservation handler assigns it to a customer reservation.
7. The table's availability reflects the reservation schedule.

### Scenario F — Inventory Management

1. An owner adds inventory items.
2. An inventory manager records available quantities.
3. Staff records stock received or used.
4. The system updates current stock.
5. Low-stock items are identified.
6. The owner reviews stock movement history.
7. Menu item availability is updated when applicable.

### Scenario G — Staff Invitation

1. An owner opens Team and Staff.
2. The owner searches for a person using their username or email.
3. The owner selects the intended SALO user.
4. The owner assigns a position and responsibilities.
5. The owner sends the invitation.
6. The invited person receives the invitation.
7. The invited person reviews the restaurant and assigned responsibilities.
8. The invited person accepts the invitation.
9. The person appears in the restaurant staff team.
10. The person's workspace displays their assigned features.

### Scenario H — Staff Permission Management

1. An owner opens the team member's profile.
2. The owner reviews current responsibilities.
3. The owner changes the staff member's assigned permissions.
4. The staff member's available workspace features are updated.
5. Unauthorized management functions are no longer accessible.
6. The permission change appears in Activity Logs.

### Scenario I — Activity Log Review

1. An owner opens Activity Logs.
2. The owner filters activities by staff member or owner.
3. The owner selects a profile update record.
4. The system displays who made the change and when.
5. The owner reviews the previous and updated values when available.

### Scenario J — Multiple Owners and Co-Owner Invitation

1. An approved owner opens the restaurant workspace.
2. The owner opens the ownership management area.
3. The owner searches for an existing SALO user using their username or email.
4. The owner selects the intended user.
5. The owner sends a co-owner invitation.
6. The invited user receives an ownership invitation through their SALO account.
7. The invited user reviews the restaurant and invitation details.
8. The invited user accepts the invitation.
9. The system completes the required ownership membership process.
10. The newly approved co-owner appears in the restaurant's owners list.
11. The new co-owner can access the same restaurant workspace using their own SALO account.
12. The system records the ownership invitation and membership activity in Activity Logs.

### Scenario K — Multiple Owners Accessing the Same Restaurant

1. Two or more approved owners sign in using their individual SALO accounts.
2. Each owner opens the same restaurant workspace.
3. Each owner can view the restaurant's applicable dashboard information.
4. Each owner can access owner-level management features.
5. One owner updates the restaurant profile.
6. The updated information is visible to the other owners.
7. The action is recorded with the identity of the owner who performed it.
8. The other owners can review the activity record.

---

# 20. Features Requiring Further Business Decisions

The following topics require approved platform-wide policies or operational decisions. Their authoritative policies must be maintained in SALO's separate Business Rules documentation.

| Feature | Decision Required |
|---|---|
| Staff Hierarchy | Final position structure and staff permissions. |
| Staff Invitations | Invitation expiration and handling of repeated invitations. |
| Staff Permissions | Exact permissions available for each management function. |
| Ownership Invitations | Invitation expiration, repeated invitations, and approval requirements. |
| Ownership Changes | Ownership transfer, owner removal, ownership disputes, and owner deactivation procedures. |
| Owner Authority | Whether any ownership actions require agreement or approval from other owners. |
| Restaurant Locations | Whether one restaurant account can manage multiple branches. |
| Delivery Coverage | Exact supported geographic coverage and delivery fee configuration. |
| Order Acceptance | Acceptance time limits and handling of unprocessed orders. |
| Reservation Management | Approval deadlines, temporary table holds, and reservation capacity. |
| Table Scheduling | Table turnover and reservation duration configuration. |
| Inventory | Automatic or manual stock deduction and inventory adjustment procedures. |
| Promotions | Discount eligibility, stacking, and funding arrangements. |
| Activity Logs | Log retention and access policies. |
| Reports | Financial data access and reporting permissions. |

The ability to support multiple owners is a functional requirement of the Restaurant Owner Side.

The detailed policies governing ownership invitations, ownership removal, transfers, disputes, and owner deactivation must be documented separately.

These decisions must be documented separately rather than embedded as duplicate policy definitions in this functional requirements document.

---

# 21. Definition of Done

A Restaurant Owner Side feature is considered complete only when:

1. Its expected functionality is documented.
2. Its interface is implemented.
3. Its backend behavior is implemented.
4. Its database requirements are satisfied.
5. Authentication and authorization are enforced.
6. Staff permissions are correctly applied.
7. Multiple ownership is supported where applicable.
8. Ownership and staff membership are correctly distinguished.
9. Data is correctly associated with the restaurant and applicable branch.
10. Customer-facing information is updated where required.
11. Activity logs record important actions.
12. Error, loading, and empty states are handled.
13. Relevant automated tests are passing.
14. Important end-to-end workflows are verified.
15. Documentation reflects the actual implementation.

A visual management interface without functional backend integration must not be considered a completed feature.

---

# 22. Document Maintenance

This document is the functional reference for the SALO Restaurant Owner Side.

Whenever restaurant management functionality changes:

- Update this document.
- Record significant changes in the project's documentation change log.
- Keep related API contracts and database documentation consistent.
- Identify whether the change affects Customer, Rider, or Admin modules.
- Reference the separate Business Rules document for approved policies and restrictions.
- Avoid duplicating the full business rules in this document.

---

**End of Document**

**SALO — Where Good Food Brings Us Together.**