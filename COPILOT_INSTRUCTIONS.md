# SALO — GitHub Copilot Instructions

**Project:** SALO — Where Good Food Brings Us Together.  
**Purpose:** Project-wide development instructions for GitHub Copilot.

---

## 1. Project Overview

SALO is a restaurant marketplace and management platform that brings customers, restaurant owners, restaurant staff, riders, and administrators together.

The platform supports:

- Restaurant discovery and browsing.
- Online food ordering.
- Multi-restaurant checkout.
- Food delivery and pickup.
- Restaurant table reservations.
- Restaurant business management.
- Restaurant staff and permission management.
- Rider applications, dispatch, delivery tracking, and proof of delivery.
- Platform administration, reports, fees, promotions, and account management.

Always consider how a change affects the entire platform, not just the individual page or feature being modified.

## 2. Required Technology Stack

Use the following technologies:

- **Frontend:** React.js
- **Backend:** PHP with Laravel Framework
- **Database:** MySQL
- **API:** RESTful API
- **Styling:** Follow the existing frontend styling conventions and installed libraries.
- **Image and File Storage:** Local application storage.

Do not introduce a different framework, database, cloud storage provider, or major dependency without explicit approval.

### Important storage requirement

SALO uses local application storage for uploaded images and files.

- Do not implement Amazon S3 or another cloud storage provider.
- Do not introduce AWS dependencies or configuration unless explicitly approved.
- Follow Laravel's existing local filesystem configuration.
- Validate uploaded files and enforce appropriate file size and type restrictions.
- Store file references or paths in the database, not the actual binary file contents.
- Ensure uploaded files can be accessed through the application's intended public or authorized routes.

## 3. Read the Project Documentation First

Before implementing or modifying a feature, inspect the relevant project documentation.

Important references:

- `SKILLS.md` — General project development guidance and workflows.
- `docs/` — System documentation and technical references.
- `docs/CUSTOMER_SIDE.md` — Customer-side functionality.
- `docs/SALO_PLAN_v2.md` — Project plan and development phases.
- `docs/API_CONTRACT.md` — API contracts and expected request/response structures.
- `docs/SALO_BUSINESS_RULES.md` — Business policies, financial rules, payment handling, and edge cases.

Other role-specific documents may exist in `docs/`. Check the directory before creating a new document.

**Documentation rules:**

1. Treat approved documentation as the primary reference for expected functionality.
2. Do not invent business policies when the documentation does not define them.
3. Identify contradictions between existing code and approved documentation.
4. Do not silently change approved requirements.
5. If a requirement is unclear or has important financial, security, or operational consequences, explain the issue and ask for clarification.
6. Do not duplicate existing documentation unnecessarily.
7. Update relevant documentation when an approved implementation changes the system's behavior.

## 4. General Development Principles

Follow these principles throughout the project:

- Write clean, readable, maintainable, and reusable code.
- Follow the existing architecture and naming conventions.
- Organize code by feature and responsibility.
- Keep frontend presentation, business logic, API communication, and backend processing properly separated.
- Avoid unnecessary duplication.
- Avoid excessively large components, controllers, and service classes.
- Use reusable components where appropriate.
- Keep responsibilities clear.
- Use meaningful variable, function, class, and file names.
- Handle loading, empty, success, validation, and error states.
- Implement proper responsive layouts.
- Maintain accessibility and usability.
- Avoid placeholder implementations presented as completed functionality.
- Do not introduce unrelated changes while working on a specific feature.

Do not rewrite working parts of the application just to impose a different coding style.

## 5. Inspect Before Modifying

Before changing any existing code:

1. Inspect the current project structure.
2. Read the relevant documentation.
3. Locate the existing implementation.
4. Identify related components, services, routes, controllers, models, migrations, and tests.
5. Understand existing dependencies and relationships.
6. Check whether the functionality already exists.
7. Identify possible effects on other roles and features.

Do not immediately create new files or duplicate existing functionality.

When a feature already has an implementation, improve or extend it instead of creating a competing implementation.

## 6. Frontend Development Rules

Use React.js and follow the existing project conventions.

Organize frontend code according to its responsibilities, including:

- Pages
- Components
- Layouts
- Services
- Hooks
- Contexts
- Utilities
- Assets
- Feature-specific modules

Frontend requirements:

- Use the existing API client and service layer for backend communication.
- Do not put direct API requests throughout unrelated components.
- Avoid unnecessary hardcoded data.
- Do not use mock data as a substitute for a working backend integration.
- Keep loading, error, empty, and success states consistent.
- Validate forms on the client for usability, but never rely on frontend validation alone.
- Protect role-specific pages and actions.
- Do not expose private information in public-facing pages.
- Follow the existing routing and authentication approach.

### Visual consistency and design-system rules

SALO must feel like one product across the public site and the Customer, Owner, Rider, and Admin interfaces. Before creating or changing UI, inspect the existing landing page, shared components, design tokens, and established patterns.

- Reuse shared components for buttons, inputs, cards, badges, modals, dropdowns, navigation, and other common UI. Extend a shared component when needed instead of creating a one-off styled equivalent.
- Use only existing design tokens for colors, spacing, border radii, shadows, and typography. Do not invent visual values or add tokens without a justified design-system update.
- Use SALO orange (`#F36B2B`) for primary actions and selected states, not as a large background. Use other palette colors only as defined by existing tokens and their semantic purpose.
- Keep light-mode backgrounds pure white or light neutral gray; never use beige, cream, ivory, or warm off-white. Keep dark mode in the genuinely dark `#171717` family.
- Keep the same color system, typography, component styling, spacing, top-bar and sidebar treatment, logo treatment, and interaction patterns across roles. Vary content and information density, not the visual system.
- Prefer open layouts with clear hierarchy over unnecessary nested cards.
- Keep hover, focus, active, and loading states consistent with shared components and existing motion tokens.
- Match the established image treatment, including aspect ratio, fit, radius, hover behavior, and placeholder style.

Before implementation, confirm whether an existing component or pattern can be reused. Before marking UI work complete, compare it with the landing page and official design system. Resolve inconsistencies instead of introducing a new visual language.

### Mock data

Mock data may be used for development and previews when appropriate.

However:

- Clearly distinguish mock data from actual backend data.
- Do not silently switch production functionality to mock data.
- Do not claim a feature is fully integrated when it still depends on mock data.
- Preserve the existing development data-mode configuration unless its modification is approved.

## 7. Backend Development Rules

Use Laravel conventions and the existing backend architecture.

Follow the established separation of responsibilities:

- Routes
- Middleware
- Controllers
- Form Requests
- Services
- Repositories, where used
- Models
- Resources
- Policies and authorization
- Database migrations
- Tests

Backend requirements:

- Validate incoming requests.
- Enforce authorization on the backend.
- Use database transactions for operations requiring atomic changes.
- Avoid exposing internal database structures unnecessarily.
- Use appropriate HTTP status codes.
- Return consistent API response structures.
- Handle exceptions properly.
- Prevent duplicate processing of sensitive operations.
- Use eager loading where appropriate.
- Avoid N+1 database queries.
- Keep financial calculations accurate using appropriate decimal-safe handling.
- Never trust client-provided prices, discounts, fees, permissions, or payment status.

Never rely exclusively on frontend restrictions for security.

## 8. Database Safety Rules

Database operations must be handled carefully.

**Never perform these actions without explicit user approval:**

- Drop a database.
- Recreate a database.
- Truncate tables.
- Delete existing production data.
- Run destructive SQL statements.
- Reset or refresh a database.
- Execute migrations against a live database when their effects have not been reviewed.
- Modify existing records in bulk.
- Change the database structure in a way that could cause data loss.

Additional requirements:

1. Verify the effective database connection and target before running database-related commands.
2. Never assume that a database is safe to modify simply because its name contains `test`.
3. Do not create or drop databases automatically.
4. Do not run destructive database commands as part of automated setup or testing.
5. Review existing migrations before creating new ones.
6. Avoid modifying old migrations that may already have been executed.
7. Prefer new, reversible migrations for approved schema changes.
8. Preserve existing records and relationships.
9. Do not modify the live `salo` database unless the user explicitly approves the specific operation.
10. If the database target is uncertain, stop and ask.

### Database change documentation

Whenever an approved database-related change is made, document:

- What changed.
- Why it changed.
- Tables and columns affected.
- New or modified relationships.
- Migration files involved.
- Data impact.
- Rollback considerations.
- Tests or verification performed.

Save the change documentation in the appropriate location under `docs/`.

## 9. User Roles and Authorization

SALO has multiple user types and platform capabilities.

These include:

- Customer
- Restaurant Owner
- Restaurant Staff
- Rider
- Administrator

A user may have more than one capability. Do not automatically assume that a restaurant owner cannot also use SALO as a customer.

Requirements:

- Enforce role and permission checks on the backend.
- Do not treat hidden frontend buttons as authorization.
- Keep restaurant-specific permissions isolated.
- Prevent staff from accessing restaurants they are not assigned to.
- Prevent riders from accessing deliveries not assigned to them unless an explicitly authorized administrative function allows it.
- Restrict administrative operations to authorized administrators.
- Preserve ownership and audit history when ownership or staff assignments change.
- Follow the approved Business Rules documentation for role-related policies.

Do not invent new roles, permission levels, or ownership-transfer policies without approval.

## 10. Financial and Transaction Integrity

Payments and financial operations require special care.

Follow `docs/SALO_BUSINESS_RULES.md` and the approved financial architecture.

Important requirements:

- Never mark a payment as successful based only on a frontend response.
- Verify payment results through the approved backend and payment-provider mechanisms.
- Prevent duplicate charges and duplicate payment processing.
- Preserve transaction references and financial history.
- Handle partial payments, partial cancellations, and partial refunds correctly.
- Keep restaurant revenue, SALO revenue, and rider earnings separate.
- Do not calculate financial values using unsafe floating-point operations.
- Record applicable fees, commissions, discounts, and refunds transparently.
- Use database transactions for related financial updates.
- Preserve financial records even when an account or restaurant is deactivated.

Do not independently invent payment, refund, commission, or cancellation policies.

If the existing financial architecture does not support a requested operation, identify the limitation before implementing it.

## 11. API Integration Rules

The frontend and backend must follow a consistent API contract.

Before changing an API:

1. Inspect the existing route.
2. Inspect the controller and related service.
3. Inspect request validation and authorization.
4. Inspect the API response structure.
5. Check which frontend services and pages depend on it.
6. Review `docs/API_CONTRACT.md`.

When modifying an API, update its frontend integration and documentation when necessary.

Do not create duplicate endpoints for functionality that already exists.

Do not silently rename fields, change response structures, or remove endpoints that other features may depend on.

## 12. Security and Privacy

Security is required throughout the system.

- Hash passwords using Laravel's supported password hashing.
- Never store plaintext passwords.
- Protect authenticated routes.
- Validate and authorize all sensitive operations.
- Prevent unauthorized access to private customer, restaurant, rider, and financial information.
- Prevent mass-assignment vulnerabilities.
- Validate uploaded files.
- Protect against SQL injection, XSS, CSRF, and other applicable web vulnerabilities.
- Do not expose secrets, credentials, or sensitive configuration in frontend code.
- Do not commit `.env` files or credentials.
- Avoid logging passwords, payment credentials, authentication tokens, and other sensitive information.
- Follow applicable privacy requirements.

## 13. Testing and Verification

Do not claim that a feature works simply because its code was written.

Use the appropriate verification steps.

### Frontend

Where applicable, run:

- Linting
- Production build
- Relevant frontend tests
- Manual browser verification

### Backend

Where applicable, run:

- Relevant Laravel feature tests
- Unit tests
- Validation tests
- Authorization tests
- Database-related tests using the verified test database

### Integration

Verify important frontend-to-backend workflows, including:

- Authentication and authorization.
- API requests and responses.
- Data persistence.
- Error handling.
- Role and permission restrictions.
- Transaction integrity.
- Relevant edge cases.

If a test cannot run because of PHP version, environment, database, dependency, or configuration problems, report the exact limitation.

Clearly distinguish:

- Implemented
- Tested successfully
- Manually verified
- Not tested
- Blocked by environment

Never fabricate test results.

## 14. Documentation and File Organization

Before creating a new file, inspect the existing folder structure.

- Place files in the correct feature or responsibility folder.
- Follow existing naming conventions.
- Avoid duplicate documentation.
- Keep documentation separate from application code.
- Do not move, rename, or delete existing files without understanding their purpose.
- Do not create unnecessary folders just for appearance.

When updating documentation, preserve relevant existing content and avoid removing approved requirements.

## 15. Development Workflow

For every requested task, follow this workflow:

### Step 1 — Understand
Read the task and relevant documentation. Identify its scope and expected behavior.

### Step 2 — Inspect
Examine existing code, dependencies, database relationships, and related features.

### Step 3 — Plan
Identify the files that need modification, possible risks, and required tests.

### Step 4 — Report blockers
If there are unresolved business rules, conflicting requirements, missing dependencies, or database risks, explain them before proceeding.

### Step 5 — Implement
Make only the changes necessary for the approved task.

### Step 6 — Verify
Run relevant tests, linting, builds, or manual checks.

### Step 7 — Document
Update the relevant documentation and change logs.

### Step 8 — Summarize
Provide a final report containing:

- What was implemented.
- Files created or modified.
- Database changes, if any.
- Tests and commands executed.
- Actual test results.
- Known limitations.
- Remaining work.
- Any decisions requiring user approval.

## 16. Do Not Do These Things

Unless explicitly approved by the user:

- Do not change the required technology stack.
- Do not introduce Amazon S3 or other cloud file storage.
- Do not drop, reset, recreate, or truncate databases.
- Do not run destructive SQL.
- Do not modify the live database casually.
- Do not invent business policies.
- Do not remove existing functionality just because it is inconvenient.
- Do not replace working integrations with mock data.
- Do not create duplicate APIs, services, components, or documentation.
- Do not install unnecessary dependencies.
- Do not modify unrelated files.
- Do not claim that untested functionality is verified.
- Do not silently change approved architecture or requirements.

## 17. Final Principle

**Preserve the integrity of SALO.**

Every implementation must prioritize:

1. Correctness
2. Security
3. Data integrity
4. Business-rule compliance
5. Maintainability
6. Consistency across all user roles
7. Good user experience

When unsure, inspect first, explain the issue, and ask for approval before making a consequential change.

Do not guess when the decision can affect customer payments, restaurant operations, rider earnings, reservations, permissions, or database integrity.