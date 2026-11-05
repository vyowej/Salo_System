SALO --- Development Rules and Technical Standards
Project: SALO --- Online Food Ordering and Table Reservation System
Tagline: Where Good Food Brings Us Together.
Document:Official development rules
Applies to: All developers, contributors, and AI coding assistants
working on SALO

1. Purpose and Authority of This Document

SALO is a student-developed web-based system that combines:

-  Online food ordering
-  Restaurant table reservations
-  Restaurant and menu management
-  Food delivery and rider management
-  Payment and transaction management
-  Platform administration

This document defines the required technology stack, architecture,
development standards, business rules, security requirements, database
safeguards, testing expectations, and change-control procedures for
SALO.

1.1 Authority
1.  These rules are the authoritative development standards for SALO.
2.  All development work must comply with this document and the
    currently approved system architecture, business rules, and database
    design.
3.  Do not assume that a proposed feature, dependency, schema change, or
    architectural change has been approved.
4.  If a task conflicts with these rules or with an existing approved
    implementation, stop and request clarification before making the
    conflicting change.
5.  If a rule needs to change, document the proposed change and obtain
    explicit approval before applying it.
6.  Where project-specific approved documentation is more specific than
    this document, follow the approved project-specific documentation
    unless it conflicts with a higher-priority requirement or an
    explicit newer decision.

2. Required Technology Stack
The following technologies are mandatory. Do not replace them without
explicit approval:

Frontend - React.js
Frontend language - JavaScript
Backend - PHP with Laravel Framework
Database - MySQL
Local development environment - XAMPP
Frontend package manager - npm
Frontend build tool - Vite
Backend dependency manager - Composer
Frontend/backend communication - REST API
API data format - JSON
Version control - Git and GitHub
Image and file storage - Local storage only

2.1 Technology restrictions
1.  React must be used for the frontend.
2.  Laravel and PHP must be used for the backend.
3.  MySQL must be the only application database management system unless
    an explicitly approved exception is documented.
4.  XAMPP must provide the local Apache and MySQL environment.
5.  Vite must be used for the React frontend build and development
    workflow.
6.  npm must manage frontend dependencies.
7.  Composer must manage PHP/Laravel dependencies.
8.  REST APIs must be used for frontend/backend communication.
9.  JSON must be the standard API request and response format, except
    where a file upload or another explicitly documented content type is
    required.
10. Git and GitHub must be used for version control and source-code
    history.
11. Do not introduce Docker, PostgreSQL, MongoDB, Firebase, AWS, cloud
    storage, another backend framework, or another frontend framework
    without explicit approval.
12. Do not introduce a new framework, library, service, or major
    dependency merely because it is convenient. Explain its purpose,
    alternatives, security implications, and effect on the existing
    architecture before requesting approval.


3. System Architecture and Separation of Responsibilities

3.1 Frontend responsibilities
React is responsible for:
-   Rendering user interfaces.
-   Handling user interactions.
-   Managing frontend presentation state.
-   Performing client-side usability checks.
-   Calling Laravel REST API endpoints.
-   Displaying backend responses, validation errors, and status updates.

React must not:
-   Connect directly to MySQL.
-   Contain database credentials.
-   Decide authoritative prices, discounts, payment results,
    permissions, or order statuses.
-   Be treated as the security boundary for protected operations.
-   Store secret keys or sensitive backend credentials.

3.2 Backend responsibilities
Laravel is responsible for:
-   API routing and request handling.
-   Authentication and authorization.
-   Server-side validation.
-   Business rules and workflows.
-   Database access and transaction management.
-   File upload processing and access control.
-   Payment verification and transaction records.
-   Order, reservation, restaurant, and delivery operations.
-   Consistent API responses and server-side error handling.

3.3 Database responsibilities
MySQL is responsible for persistent application data, including:
-   User accounts and roles.
-   Restaurant profiles and staff relationships.
-   Menus and food items.
-   Carts and orders.
-   Reservations and table availability.
-   Payments and financial records.
-   Rider profiles, shifts, and delivery assignments.
-   Notifications and audit records.

3.4 General architecture rules
1.  Keep frontend, backend, and database responsibilities separate.
2.  React and Laravel must communicate through documented APIs.
3.  All authoritative business rules must be enforced on the backend.
4.  Do not duplicate important business rules in multiple places without
    a clear reason.
5.  Organize code by feature and responsibility.
6.  Keep controllers focused on HTTP handling; place reusable business
    operations in appropriately organized services or domain classes.
7.  Avoid excessively large components, controllers, or service files.
8.  Use consistent naming conventions and project structure.
9.  Do not introduce microservices or additional architectural layers
    without approval.
10. Preserve the existing approved architecture when adding features.


4. Frontend Development Rules --- React
- Use React for all frontend pages and interfaces.
- Follow the existing project conventions before introducing a new folder structure or coding style.
- Use reusable components where appropriate.
- Use React Hooks appropriately for state and lifecycle-related behavior.
- Use the project's established state-management approach. Do not add a state-management library without approval.
- Use Axios or Fetch API for backend communication. Prefer the approach already established in the project; do not introduce both without a justified need.
- Keep API communication in organized service modules rather than scattering request logic throughout components.
- Keep components, pages, layouts, hooks, contexts, utilities, and assets organized by feature and responsibility.
- Handle loading, empty, success, and error states.
- Display backend validation errors in a clear and useful way.
- Do not hardcode production data or authoritative business rules in frontend components.
- Do not use mock data as a substitute for actual backend functionality.
- Mock data may only be used for an explicitly approved isolated UI prototype or test, and must not be mistaken for live data.
- Do not place secret keys, database credentials, private tokens, or sensitive configuration in frontend environment variables. Frontend environment variables must be treated as publicly visible.
- Do not use PHP to generate React pages.
- Do not claim a frontend feature is complete if it is not connected to the required backend workflow.
- Maintain responsive layouts and usable interfaces across supported screen sizes.
- Preserve existing working UI and behavior unless a change is explicitly requested or approved.


5. Backend Development Rules --- Laravel Custom-Built Implementation
5.1 Core requirement
Laravel must be used as the backend framework, but all SALO-specific
core application functionality and business logic must be
custom-developed.

The purpose is to build SALO's actual workflows and rules rather than
assembling the application from ready-made modules, starter kits, or
packages that implement those workflows automatically.

Laravel's basic framework infrastructure is allowed. This includes,
where appropriate:

-   Routing
-   Controllers
-   Middleware structure
-   Configuration
-   Environment configuration
-   Database connections
-   Eloquent ORM and query builder
-   Database transactions
-   Basic request and response infrastructure
-   Laravel's underlying secure framework utilities

Using these framework facilities does not mean the application
functionality is prebuilt. The actual SALO authentication rules,
permissions, workflows, validations, and business logic must still be
implemented by the project.

5.2 Prohibited prebuilt solutions for core functionality
Do not install or use the following as substitutes for custom implementation:

- Laravel Breeze: Ready-made authentication scaffolding
- Laravel Jetstream: Ready-made account and authentication features
- Laravel Fortify: Prebuilt authentication implementation
- Laravel Sanctum: Prebuilt API token/session authentication solution for SALO
- Laravel Passport: Prebuilt OAuth/API authentication solution for SALO
- Spatie Laravel Permission: Ready-made role and permission management
- Filament: Ready-made administration panel
- Laravel Nova: Ready-made administration panel
- Backpack: Ready-made administration panel
- CRUD generator packages: Automatic generation of application CRUD functionality
- Prebuilt restaurant/order/reservation modules: Ready-made SALO business workflows 
- Prebuilt delivery/dispatch modules : Ready-made rider and delivery workflows


Also prohibited:
1.  Starter kits or scaffolding that generate core SALO functionality.
2.  Third-party packages that replace the need to implement SALO-specific business rules.
3.  Copying a ready-made application and merely changing its branding.
4.  Installing packages without reviewing their purpose, dependencies,
    license, maintenance status, and security implications.
5.  Adding a package first and seeking approval afterward.


5.3 Permitted framework infrastructure
1.  Laravel routing, controllers, middleware structure, configuration,
    database connectivity, Eloquent, query builder, and transaction
    facilities may be used.
2.  Use secure, established PHP and Laravel cryptographic primitives
    rather than inventing encryption or password-hashing algorithms.
3.  Basic framework utilities may be used when they do not replace a
    prohibited core SALO feature.
4.  If uncertain whether a package or Laravel feature counts as a
    prohibited prebuilt solution, explain the proposed use and request
    approval before implementation.
5.  Do not manually recreate low-level cryptography, secure
    random-number generation, or other security-critical primitives.

5.4 Required custom implementations
The following SALO-specific functionality must be implemented by the
project:

1.  Registration, login, logout, and account lifecycle.
2.  Authentication flow and session/token lifecycle.
3.  Role and permission checks.
4.  Restaurant registration and approval workflow.
5.  Restaurant ownership and staff access rules.
6.  Menu and food availability management.
7.  Cart and checkout rules.
8.  Order creation, processing, status transitions, and cancellation.
9.  Table, time-slot, and reservation availability rules.
10. Discount eligibility and calculation rules.
11. Payment workflow and transaction records.
12. Rider application and approval.
13. Rider shift and availability rules.
14. Delivery eligibility, dispatch, offers, and assignment.
15. Delivery status transitions and tracking.
16. Proof-of-delivery workflow.
17. Cash collection and remittance records.
18. Administrative management and audit workflows.
19. SALO-specific notifications and notification rules.
20. All other SALO-specific business rules.


6. Authentication, Accounts, and Role Management

6.1 Account rules
1.  Implement the authentication and account workflows specifically for SALO.
2.  Never store plain-text passwords.
3.  Hash passwords using secure, established password-hashing mechanisms supported by PHP.
4.  Never create a custom cryptographic algorithm.
5.  Implement secure login, logout, password change, and password recovery procedures.
6.  Protect against brute-force login attempts through appropriate rate limiting and monitoring.
7.  Use secure session or token handling, including expiration and revocation.
8.  Do not store authentication secrets in local storage or expose them to unauthorized frontend code.
9.  Protect session cookies with appropriate security attributes when cookie-based sessions are used.
10. Define secure handling for password reset tokens and verificationcodes.
11. Account deactivation and deletion must follow approved retention and privacy rules.
12. Do not erase historical orders, payments, reservations, or delivery records merely because an account is deactivated.
13. Preserve the ability to identify the correct historical transaction owner while respecting privacy and retention requirements.


6.2 Multiple roles under an account

SALO has four primary roles:
-   Customer
-   Restaurant Owner (Seller)
-   Rider
-   Administrator

A person may act as a customer and a restaurant owner using the same
user account. Do not force a restaurant owner to maintain a separate
customer account solely to use customer features.

The system must distinguish a person's account identity from their
approved roles, restaurant relationships, and permissions.

Rider and administrator privileges must only be granted through their
approved processes. Do not allow users to grant themselves privileged
roles.


6.3 Role-based access control
1.  Implement custom role and permission logic.
2.  Enforce authorization on the backend for every protected operation.
3.  Hiding a frontend button is not authorization.
4.  Customers may access only their own private account information,
    orders, reservations, and relevant payment/delivery details.
5.  Sellers may access only restaurants they own or are explicitly
    authorized to manage.
6.  Restaurant staff may access only the functions and records permitted
    by their assigned permissions.
7.  Riders may access only their own rider information and authorized
    delivery assignments.
8.  Administrators may perform platform-wide actions only according to
    their authorized privileges.
9.  Prevent privilege escalation and unauthorized role changes.
10. Test both permitted and denied access for every important
    role-protected operation.


7. Database Rules --- MySQL

7.1 Database requirements
1.  MySQL is the required application DBMS.
2.  Use the existing approved SALO database and schema as the starting
    point.
3.  Review the authoritative schema and existing database documentation
    before proposing structural changes.
4.  Maintain appropriate primary keys, foreign keys, unique constraints,
    indexes, and relationship rules.
5.  Use appropriate data types, precision, nullability, and default
    values.
6.  Use database constraints to enforce data integrity where
    appropriate.
7.  Use transactions for operations that must succeed or fail as a unit.
8.  Prevent duplicate records where uniqueness is required.
9.  Preserve historical transaction information.
10. Use pagination for large datasets.
11. Avoid unnecessary queries and inefficient database access.
12. Do not create duplicate or unnecessary tables.
13. Document significant schema changes and their effect on existing
    records.

7.2 Existing authoritative schema and migration safeguards
1.  The existing SALO database schema and its approved SQL definition
    are authoritative.
2.  Do not automatically replace, recreate, or redesign the existing
    schema.
3.  Do not run Laravel migrations against an existing database until the
    migration plan and target database have been reviewed and explicitly
    approved.
4.  For the existing schema, use the approved SQL/database change
    process.
5.  New Laravel migrations may be introduced only when explicitly
    approved and checked for compatibility with the authoritative
    schema.
6.  Never use `migrate:fresh`, `db:wipe`, destructive rollback
    operations, or equivalent destructive commands against the working
    database without explicit approval.
7.  Never assume that a database named `testing`, `test`, or `salo_test`
    is safe. Verify the actual connection configuration and database
    name before executing tests or seeders.
8.  Automated tests must use a separately configured test database.
9.  Do not run seeders against the working database unless the exact
    seeder, target database, and expected effects have been reviewed and
    explicitly approved.
10. Seeders must be repeatable or protected against accidental duplicate
    data where appropriate.
11. Never overwrite existing user, restaurant, order, reservation,
    payment, or rider data with demonstration records.
12. Back up relevant data before an approved risky database operation.

7.3 Data lifecycle
1.  Define when records should be active, inactive, archived, or
    deleted.
2.  Use soft deletion or archival where historical records must remain
    available.
3.  Do not cascade-delete financial or transactional history
    unintentionally.
4.  Define retention and deletion policies for personal information and
    uploaded files.
5.  Record important changes to financial, order, reservation, and
    delivery records.


8. API Standards and Integration
1.  React must communicate with Laravel through REST APIs.
2.  Use JSON for normal API requests and responses.
3.  Use appropriate HTTP methods and status codes.
4.  Keep endpoint naming and response structures consistent.
5.  Document API endpoints, required parameters, authentication
    requirements, and response formats.
6.  Validate all incoming data on the backend.
7.  Never trust frontend-supplied prices, totals, discount amounts,
    payment statuses, roles, ownership claims, or delivery statuses.
8.  Return useful validation and error messages without exposing stack
    traces, secrets, or internal implementation details.
9.  Apply authentication and authorization to protected endpoints.
10. Configure CORS for approved frontend origins only.
11. Use rate limiting for sensitive endpoints such as login, password
    recovery, and transaction submission.
12. Prevent duplicate submissions for sensitive operations through
    appropriate idempotency or duplicate-request protection.
13. Use pagination and filtering conventions consistently.
14. Keep API behavior backward-compatible where practical; document and
    approve breaking changes.
15. Consider an API version prefix if required by the approved
    architecture. Do not introduce a new versioning structure without
    reviewing existing routes.
16. Do not expose internal database errors directly to users.


9. Business Rules --- Customer and Ordering
1.  Customers may browse restaurants that are approved and available to the public.
2.  Restaurant operating status and ordering availability must be checked by the backend.
3.  Only available food items may be added to a valid order.
4.  The backend must retrieve and verify current item prices.
5.  The backend must calculate authoritative subtotals, fees, discounts, and totals.
6.  Never trust totals calculated only by React.
7.  Orders must preserve historical snapshots of item names, unit prices, quantities, and applied discounts.
8.  Changes to a menu item must not silently rewrite historical order details.
9.  Validate quantities, item availability, restaurant status, and applicable order restrictions.
10. Define whether an order may contain items from only one restaurant. Follow the approved SALO business rule.
11. Define checkout behavior when an item becomes unavailable or its price changes before submission.
12. Prevent duplicate order creation from repeated submissions.
13. Maintain a clear order status history.
14. Enforce valid status transitions on the backend.
15. Cancellation eligibility must depend on the approved order lifecycle and business rules.
16. Record cancellation reasons and relevant timestamps.
17. Do not treat an order as delivered merely because a rider has accepted it or marked it picked up.
18. Preserve order history for customers and authorized restaurant/admin users.


10. Business Rules --- Restaurant and Seller Management
1.  A restaurant must complete registration and required review before
    becoming publicly available.
2.  Only authorized administrators may approve or reject restaurant
    applications.
3.  A seller may manage only restaurants they own or are authorized to
    manage.
4.  A seller must not access another restaurant's private orders,
    reservations, staff, or financial records.
5.  Restaurant profiles must include the required business information.
6.  Restaurants must have configurable operating hours and availability.
7.  Restaurant availability must affect ordering and reservation
    eligibility.
8.  Sellers may add, edit, and manage their food items.
9.  Sellers may update item descriptions, prices, images, and
    availability.
10. Sold-out or unavailable items must not be purchasable.
11. Price changes must not alter historical order snapshots.
12. Restaurant staff access must be limited to assigned restaurants and permissions.
13. Staff management must include appropriate invitation/assignment, activation, deactivation, and permission checks.
14. Restaurant deactivation must not erase historical transactions.
15. Important seller actions must be recorded where auditability is required.


11. Business Rules --- Table Reservations
1.  Customers may reserve tables only at eligible, approved restaurants.
2.  Reservation dates and times must follow restaurant operating hours and reservation policies.
3.  Validate the number of guests against table capacity and restaurant rules.
4.  Prevent overlapping bookings for the same table and time period.
5.  Prevent reservations for unavailable tables or blocked time slots.
6.  Prevent double-booking under simultaneous reservation requests.
7.  Use database transactions and appropriate locking or constraints to protect reservation availability.
8.  Define reservation statuses and permitted status transitions.
9.  Record reservation creation, confirmation, cancellation, and completion timestamps as appropriate.
10. Define whether reservations require seller confirmation or may be automatically confirmed.
11. Define cancellation deadlines and applicable fees or restrictions before implementation.
12. Do not invent reservation policies when the approved requirements are unclear.
13. Customers may view and manage only their own reservations.
14. Sellers may manage reservations only for their authorized restaurants.
15. Preserve reservation history for authorized users and administrative review.


12. Business Rules --- Discounts and Promotions
1.  All discount calculations must be performed or verified by the backend.
2.  Define discount type, amount, eligibility, validity period, and applicable restaurant or items.
3.  Enforce minimum purchase requirements where applicable.
4.  Enforce maximum discount amounts where applicable.
5.  Enforce usage limits and per-customer restrictions.
6.  Prevent expired, inactive, or unauthorized discount codes from being applied.
7.  Prevent duplicate use where prohibited.
8.  Define whether discounts can be combined.
9.  Preserve the applied discount details in the order's historical record.
10. Do not invent discount stacking or eligibility rules without approval.


13. Business Rules --- Payments and Financial Records

13.1 General payment rules
1.  Payment methods must be explicitly approved before implementation.
2.  Support only the payment methods included in the approved SALO
    requirements.
3.  Keep order status, payment status, delivery status, and remittance status separate.
4.  Record payment references, amounts, timestamps, methods, and verification outcomes.
5.  Prevent duplicate payment processing.
6.  Use appropriate database transactions for payment-related record changes.
7.  Never mark a payment successful based solely on a frontend message or redirect.
8.  Do not store card numbers, banking passwords, PINs, or other
    prohibited sensitive payment credentials.
9.  Refunds, reversals, and disputes must follow documented rules.
10. Keep an auditable history of important financial events.

## 13.2 Cash on Delivery (COD)

1.  COD must be supported only as defined by the approved payment
    requirements.
2.  The authoritative amount due must be calculated by the backend.
3.  Record the amount expected to be collected.
4.  Record the collection result and relevant delivery evidence.
5.  A rider may record the collection event only within their authorized
    delivery workflow.
6.  A rider must not mark cash as remitted to the platform.
7.  Cash collection, delivery completion, and cash remittance must be
    separate events.
8.  Only authorized personnel may confirm remittance.
9.  Record who confirmed remittance, when it occurred, and the amount.
10. Do not allow a partial collection to be treated as full payment
    unless a specific approved policy supports it.

## 13.3 Online payments

1.  Do not select or integrate a payment gateway without explicit approval.
2.  Verify online payment results through the provider's server-side verification or authenticated webhook mechanism.
3.  Verify transaction references, amount, currency, and relevant order association.
4.  Authenticate and validate webhook messages according to the provider's documented method.
5.  Handle duplicate and out-of-order webhook events safely.
6.  Do not expose provider secret keys in React or public repositories.
7.  Keep online payment verification separate from delivery completion.


14. Business Rules --- Rider and Delivery Management

14.1 Rider registration and approval
1.  Riders must submit the required application information.
2.  Rider applications must be reviewed through the approved
    administrative workflow.
3.  Only approved and eligible riders may receive delivery assignments.
4.  Rejected, suspended, or inactive riders must not receive new
    assignments.
5.  Protect rider personal information and documents.
6.  Record application decisions and relevant administrative actions.

14.2 Shifts and availability
1.  Riders may receive assignments only when eligible under the approved
    shift and availability rules.
2.  Validate shift start and end times using the correct local time zone
    and approved scheduling rules.
3.  Prevent conflicting active assignments.
4.  Define how breaks, shift completion, late arrival, and
    unavailability affect dispatch eligibility.
5.  Do not bypass shift validation in dispatch logic.
6.  Record relevant shift changes and administrative overrides.

14.3 Dispatch and assignments
1.  Dispatch eligibility must be determined by backend rules.
2.  Only eligible riders may receive delivery offers.
3.  Assignment creation and acceptance must be handled through
    controlled backend operations.
4.  Prevent two riders from simultaneously securing the same exclusive
    assignment.
5.  Use transactions or appropriate concurrency controls for assignment
    acceptance.
6.  Record offers, acceptance, rejection, expiration, reassignment, and
    cancellation events as applicable.
7.  Do not assign conflicting active deliveries to a rider.
8.  Define what happens when a rider does not respond to an offer.
9.  Define reassignment rules before implementing automatic
    reassignment.
10. Preserve assignment history.

14.4 Delivery lifecycle
Use only approved delivery statuses and transitions. The currently
defined delivery lifecycle includes:

-   Offered
-   Accepted
-   Picked Up
-   Delivered
-   Delivery Failed
-   Cancelled

Additional rules:

1.  Enforce status transitions on the backend.
2.  Record the actor, timestamp, and relevant details for each important
    transition.
3.  Riders must not arbitrarily change delivery statuses.
4.  A rider must not independently cancel an order after pickup.
5.  A failed delivery must include an appropriate reason and follow the
    review process.
6.  Reassignment and cancellation must follow approved rules.
7.  Do not treat a failed delivery as a successful delivery.
8.  Customer confirmation and delivery disputes must follow documented
    procedures.
9.  Do not introduce automatic completion after a time period unless the
    policy is explicitly approved and dispute safeguards are
    implemented.

14.5 Location tracking and proof of delivery
1.  Location data must be collected and used only for approved delivery
    purposes.
2.  Restrict location access to authorized users and relevant active
    deliveries.
3.  Do not expose a rider's location after the approved tracking period
    or outside authorized purposes.
4.  Define location update frequency and retention.
5.  Proof of delivery must be linked to the correct delivery record.
6.  Validate uploaded proof files on the backend.
7.  Restrict access to proof of delivery to authorized users.
8.  Record proof submission time and relevant delivery details.
9.  Preserve proof and delivery history according to the approved
    retention policy.
10. A delivery must not be marked complete merely because an image
    upload succeeded.

14.6 COD collection and remittance
Follow Section 13.2. Riders may record authorized collection events but
must not confirm their own remittance to the platform.


15. Notifications
1.  Notifications must be based on actual backend events.
2.  Do not display a successful transaction notification before the
    backend confirms the event.
3.  Prevent duplicate notifications for the same event where practical.
4.  Restrict private notifications to their intended recipients.
5.  Define notification events for orders, reservations, payments, rider
    assignments, delivery updates, and important account actions.
6.  Maintain notification history where required.
7.  Define read/unread behavior and notification retention.
8.  Do not introduce SMS, email, or push notification providers without
    approval.


16. Image and File Storage --- Local Only
1.  Store all application-uploaded images and files locally.
2.  Use Laravel's local storage facilities where appropriate.
3.  Do not use AWS S3, Firebase Storage, Cloudinary, or any external
    cloud file-storage service without explicit approval.
4.  Separate public files, such as approved restaurant/menu images, from
    private files, such as rider documents and proof of delivery.
5.  Validate file size, allowed file type, and actual file content on
    the backend.
6.  Do not trust the original filename or browser-provided MIME type.
7.  Generate unique, unpredictable filenames.
8.  Reject executable and otherwise unsafe uploads.
9.  Re-encode images where appropriate to reduce risk from malicious or
    malformed files.
10. Restrict private-file access through backend authorization.
11. Do not expose private files through predictable public URLs.
12. Define replacement, deletion, and retention rules.
13. Do not delete a file still referenced by historical or active
    records without an approved process.
14. Document storage paths and backup requirements.
15. Do not claim local storage is backed up unless a backup process has
    actually been configured and verified.


17. Security and Data Privacy
1.  Validate all incoming data on the backend.
2.  Use parameterized database access through approved framework
    facilities.
3.  Protect against SQL injection.
4.  Protect against Cross-Site Scripting (XSS) through appropriate
    output handling.
5.  Apply CSRF protection where the authentication and request
    architecture requires it.
6.  Configure CORS for approved origins only.
7.  Use HTTPS in production.
8.  Apply appropriate rate limiting to sensitive endpoints.
9.  Prevent unauthorized access and privilege escalation.
10. Protect passwords, tokens, session identifiers, API keys, and
    payment credentials.
11. Never commit `.env` files or secrets to GitHub.
12. Never expose `.env` contents in logs, screenshots, reports, or API
    responses.
13. Do not log passwords, complete tokens, or sensitive payment
    credentials.
14. Restrict access to personal information according to role and
    business need.
15. Maintain audit logs for sensitive administrative, account, payment,
    and delivery actions.
16. Define retention and deletion procedures for personal data and
    uploaded files.
17. Follow applicable Philippine data privacy requirements, including
    the Data Privacy Act of 2012 (Republic Act No. 10173).
18. Do not collect personal information that is unnecessary for the
    system's approved purposes.
19. Do not use real customer or financial information in test fixtures.
20. Review security implications before adding any external integration.


18. Local Development Environment --- XAMPP

1.  XAMPP must be used as the local development environment.
2.  Apache and MySQL must be configured and started through the approved
    XAMPP setup.
3.  Laravel must connect to the MySQL instance managed by XAMPP.
4.  Use the correct database host, port, database name, username, and
    password in the local environment configuration.
5.  Do not assume that the default MySQL port or credentials are
    correct; verify the actual local configuration.
6.  React must run through the project's Vite scripts.
7.  Keep frontend and backend startup commands documented.
8.  Do not introduce Docker, another local database server, or another
    local environment without approval.
9.  Do not expose the local development server publicly without explicit
    approval and appropriate security controls.
10. Keep local environment secrets out of source control.
11. Verify the active database connection before running migrations,
    seeders, scripts, or tests.

19. Testing and Quality Assurance

19.1 General testing rules
1.  Every new feature must have appropriate tests.
2.  Test frontend behavior and user interactions.
3.  Test backend services and business rules.
4.  Test API endpoints with valid and invalid requests.
5.  Test authentication and authorization for all relevant roles.
6.  Test database relationships and constraints.
7.  Test error handling and boundary conditions.
8.  Test concurrent operations where conflicts are possible.
9.  Test order, reservation, payment, and rider workflows end to end.
10. Test both successful and unsuccessful scenarios.
11. Use a separate, verified test database.
12. Never use production or authoritative working data for automated
    tests.
13. Do not run destructive test setup against the working database.
14. Do not report a test as passed unless it was actually executed and
    the result verified.
15. Distinguish clearly between implemented, tested, partially tested,
    and unverified functionality.

19.2 Required workflow testing

Test complete workflows for:
-   Customer registration and login.
-   Seller registration, approval, and restaurant setup.
-   Rider application, approval, and eligibility.
-   Menu creation, editing, and availability.
-   Cart, checkout, order creation, and cancellation.
-   Table availability and reservation creation.
-   Reservation confirmation and cancellation.
-   Discount validation and application.
-   COD collection and remittance.
-   Online payment verification, if an approved provider is integrated.
-   Rider shift eligibility and dispatch.
-   Assignment acceptance and reassignment.
-   Pickup, delivery, failed delivery, and proof of delivery.
-   Administrative approvals and account management.
-   Staff permissions and restaurant data isolation.

19.3 Test reporting
Every development task should report:

-   Tests executed.
-   Commands or procedures used.
-   Actual results.
-   Tests not executed and why.
-   Known failures or limitations.
-   Whether the feature was manually verified.
-   Whether any database or environment changes occurred.

------------------------------------------------------------------------

# 20. Documentation and Change Management

1.  Maintain this document as the official SALO development standard.
2.  Document significant implementation changes in Markdown files.
3.  Maintain API documentation.
4.  Maintain database schema and relationship documentation.
5.  Document setup instructions and required environment variables
    without exposing secret values.
6.  Document business rules and important status lifecycles.
7.  Maintain a record of completed features, pending features, known
    issues, and limitations.
8.  Document newly added dependencies and why they were necessary and
    approved.
9.  Record significant database changes and migration/SQL execution
    details.
10. Record test results for completed work.
11. Do not silently change approved requirements.
12. Do not remove working features without explicit approval.
13. Do not claim an external integration is working without verifying
    the actual integration.
14. Keep documentation consistent with the actual implementation.

------------------------------------------------------------------------

# 21. Git and Version Control

1.  Use Git for source-code version control.
2.  Push approved project changes to the appropriate GitHub repository
    and branch.
3.  Do not commit `.env`, passwords, API secrets, private keys, or other
    credentials.
4.  Review `git status` and diffs before committing.
5.  Do not overwrite another contributor's work without review.
6.  Do not force-push or rewrite shared history without explicit
    approval.
7.  Use meaningful commit messages.
8.  Keep generated files and dependencies under the project's
    established Git policy.
9.  Do not commit temporary test data, private uploads, or local
    database files unless explicitly required and approved.
10. Report the branch and commit details when a task includes Git
    operations.

------------------------------------------------------------------------

# 22. Performance and Maintainability

1.  Use pagination for large lists and histories.
2.  Avoid unnecessary database queries.
3.  Use eager loading and indexes where appropriate.
4.  Avoid loading entire tables when only a subset is required.
5.  Keep frontend components modular.
6.  Keep backend business logic organized and reusable.
7.  Avoid unnecessary code duplication.
8.  Do not add caching infrastructure or external services without
    approval.
9.  Optimize images and other uploaded assets appropriately.
10. Do not sacrifice security or data integrity for performance
    shortcuts.
11. Prefer clear, maintainable implementations over unnecessarily
    complicated abstractions.

------------------------------------------------------------------------

# 23. SALO Module Requirements

All modules must follow the same technology, security, database, API,
testing, and documentation rules.

## 23.1 Customer Module

Expected responsibilities include:

-   Registration, login, logout, and account management.
-   Restaurant discovery and browsing.
-   Menu browsing and food availability.
-   Shopping cart and checkout.
-   Food ordering and order history.
-   Payment selection and payment records.
-   Order status and delivery tracking.
-   Table reservations and reservation history.
-   Cancellation workflows.
-   Notifications and profile management.

Customers must only access their own private records and authorized
public restaurant information.

## 23.2 Restaurant Owner / Seller Module

Expected responsibilities include:

-   Seller account and restaurant registration.
-   Restaurant profile management.
-   Restaurant approval status.
-   Operating hours and availability.
-   Menu and food item management.
-   Food images and sold-out status.
-   Order receiving and processing.
-   Order status updates.
-   Table and reservation management.
-   Staff management and permissions.
-   Relevant sales and transaction records.

A seller may also use customer functionality through the same account
where authorized.

## 23.3 Rider Module

Expected responsibilities include:

-   Rider application and approval status.
-   Rider profile and required documents.
-   Shift management and eligibility.
-   Availability management.
-   Delivery offers and assignments.
-   Assignment acceptance and rejection.
-   Restaurant pickup.
-   Delivery status updates.
-   Location tracking for authorized active deliveries.
-   Proof of delivery.
-   Failed delivery reporting.
-   Authorized COD collection records.
-   Delivery history.

Riders must only access their own information and authorized
assignments.

## 23.4 Admin Module

Expected responsibilities include:

-   User account management.
-   Seller and restaurant application review.
-   Rider application review and approval.
-   Account restrictions and administrative actions.
-   Restaurant and platform monitoring.
-   Delivery and dispatch oversight.
-   Payment and transaction monitoring.
-   COD remittance confirmation by authorized personnel.
-   Dispute and failed-delivery review.
-   Audit log access.
-   System-level configuration permitted by the approved requirements.

Administrative access must be protected and auditable. Do not expose
unrestricted administrative capabilities to ordinary users.

------------------------------------------------------------------------

# 24. Universal Development Rules

These rules apply to every development task, regardless of module,
feature, developer, or AI coding assistant.

1.  **Follow the Approved Architecture.** Never change the required
    technology stack, architecture, database structure, or approved
    business rules without explicit authorization.
2.  **Inspect Before Implementing.** Inspect the existing project
    structure, source code, database schema, documentation, and related
    functionality before making changes.
3.  **No Unauthorized Implementation.** Do not add, remove, replace, or
    modify features, dependencies, database structures, or
    configurations without proper justification and approval.
4.  **No Prebuilt Core Functionality.** All SALO-specific business logic
    and core application functionality must be custom-developed.
5.  **No Fake Functionality.** Do not use mock data, hardcoded
    responses, simulated transactions, or placeholders as substitutes
    for actual working features.
6.  **Database Protection.** Never execute destructive database
    commands, modify authoritative database structures, or alter actual
    records without explicit approval and safeguards.
7.  **Security First.** Every feature must follow authentication,
    authorization, validation, and data protection requirements.
8.  **Preserve Existing Functionality.** New implementations must not
    break, remove, or unnecessarily rewrite existing working features.
9.  **Test Before Declaring Completion.** Every implementation must
    undergo appropriate testing. Distinguish implemented, tested,
    partially tested, and unverified functionality.
10. **Document Significant Changes.** Record implemented changes,
    affected files, database modifications, dependencies, test results,
    and remaining issues in appropriate Markdown documentation.
11. **No Assumed Approval.** Suggestions, proposed improvements, and
    architectural changes must not be treated as approved until
    explicitly authorized.
12. **Honest Reporting.** Never claim that a feature, integration, test,
    or database operation succeeded unless the result has been verified.
13. **Stop on Unclear or Conflicting Requirements.** Ask for
    clarification before making a potentially destructive,
    security-sensitive, or architecture-changing decision.
14. **Keep Changes Focused.** Implement only what the task requires.
    Avoid unrelated refactoring and scope expansion.
15. **Verify the Target Environment.** Before running commands that can
    alter data or configuration, verify the exact project, branch,
    environment, and database target.

------------------------------------------------------------------------

# 25. Mandatory Instructions for AI Coding Assistants

Before performing any SALO development task:

1.  Read this entire `SALO_DEVELOPMENT_RULES.md` document.
2.  Inspect the existing project structure and relevant implementation.
3.  Review the relevant approved documentation and database schema.
4.  Check the current Git status and existing uncommitted changes.
5.  Identify the files and components that the task may affect.
6.  Explain any conflict between the requested task and the approved
    rules before proceeding.
7.  Do not install packages, change architecture, alter the schema, or
    perform destructive operations without the required approval.
8.  Do not assume a feature is missing merely because it has not yet
    been inspected.
9.  Do not overwrite existing working implementations without
    understanding their dependencies.
10. Implement only the approved scope.
11. Run appropriate tests using the verified test environment.
12. Review the final changes and report the actual results.

### Required completion report

At the end of every implementation task, report:

-   **Summary:** What was implemented.
-   **Files changed:** Exact files created, modified, or deleted.
-   **Database changes:** Exact schema or data changes, or state that
    none occurred.
-   **Dependencies:** Any added or changed dependencies and their
    approval status.
-   **Testing:** Commands or procedures executed and actual results.
-   **Limitations:** Anything incomplete, untested, or requiring
    external configuration.
-   **Security considerations:** Relevant security checks performed.
-   **Documentation:** Markdown files created or updated.
-   **Git status:** Relevant branch, commit, and remaining changes when
    applicable.

Do not report completion if required functionality remains incomplete or
unverified.

------------------------------------------------------------------------

# 26. Final Development Principle

SALO must remain a custom-developed, database-backed web application
using the approved React, Laravel, MySQL, and XAMPP stack.

Laravel may provide basic framework infrastructure, but SALO's actual
application logic, workflows, business rules, and role-specific
functionality must be implemented specifically for this project.

The system must prioritize:

-   Correctness over shortcuts.
-   Data integrity over convenience.
-   Security over speed of implementation.
-   Clear architecture over unnecessary complexity.
-   Tested functionality over unsupported claims.
-   Documented decisions over assumptions.
-   Explicit approval over unauthorized changes.

SALO --- Where Good Food Brings Us Together.