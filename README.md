# Savor

Savor is a food marketplace with a Next.js frontend and a NestJS API. Customers
can create accounts, vendors can register and run a storefront, and public menus
are served from a SQLite database.

## Requirements

- Node.js 20 or later
- npm

## Local development

From the `my-app` directory:

```powershell
npm install
Copy-Item backend\.env.example backend\.env
```

The local SQLite URL is configured by default as `file:./dev.db`, which stores
the database at `backend\prisma\dev.db`. You can use it as-is for development.
If you use a different database, set `DATABASE_URL` in `backend\.env`.

For local development, the API generates a temporary session secret if
`JWT_SECRET` is missing or still has the example value. Sessions will expire
when the API restarts. For production, set `JWT_SECRET` to a unique random
value of at least 32 characters. Then initialize the local database:

```powershell
npm run db:push
```

Account registration now requires email verification. Configure `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` in `backend\.env` to send verification
links. For Gmail, use `smtp.gmail.com`, port `465`, your Gmail address, and a
Google App Password (enable 2-Step Verification in the Google account first).
`MAIL_FROM` is optional and defaults to `SMTP_USER`. Verification links expire
after 24 hours; users can request a replacement link from the signup page.
Run `npm run db:push` after updating the app to add the verification fields to
an existing local database.

Start the backend and frontend in separate terminals:

```powershell
npm run dev:api
npm run dev
```

To run the compiled backend, build it before starting it:

```powershell
npm run build:api
npm run start:prod --workspace savor-api
```

The production start script also builds the API before launching
`backend\dist\main.js`. For local development, use `npm run dev:api` instead;
do not run a separate TypeScript watcher and production server against the same
`dist` folder at the same time.

The frontend runs at `http://localhost:3000`; the API runs at
`http://localhost:4000/api`. The frontend defaults to that API URL. Set
`NEXT_PUBLIC_API_URL` in the frontend environment to the full API base URL,
including `/api`, if you use a different API origin. `FRONTEND_ORIGIN` in
`backend\.env` controls the allowed frontend
origin; multiple origins can be comma-separated.

The `/fitness-guide` page provides meal photo estimates and packaged-food
barcode lookups. Barcode data comes from Open Food Facts. To enable meal-photo
analysis, set `OPENAI_API_KEY` in `backend\.env`; optionally set
`OPENAI_VISION_MODEL` to choose a compatible vision model (defaults to
`gpt-4o-mini`). Keep this key server-side and never add it to a `NEXT_PUBLIC_`
variable. Meal photos are sent to the configured AI provider for analysis.
Results are estimates, not medical advice.

Run only one API process on a given port. If startup reports that the port is
already in use, reuse the running API or stop the other process before starting
another one. You can set `PORT` in `backend\.env` to use another available
port; if you do, point `NEXT_PUBLIC_API_URL` at that port as well. Open store
listings include vendors' optional WhatsApp number and up to two recent reviews
alongside the total review count.

## Accounts and storefronts

- `/account` creates and signs in customer accounts.
- `/vendor` creates a customer account or signs in, then lets the signed-in
  customer activate vendor access before creating their store.
- `/vendor/dashboard` is the dedicated vendor workspace for store details,
  inventory, sales summaries, and live order preparation updates.
- Open vendor stores and their products appear in the public marketplace.
  Customers can share browser location to sort open stores by distance; vendors
  can add or update store coordinates from store setup or the dashboard.
  Closed stores are removed from listings and the marketplace refreshes store
  availability every 20 seconds; items left in a bag from a closed store are
  marked unavailable.
- Passwords are hashed with bcrypt. Sessions use short-lived JWTs in HTTP-only
  cookies; the API enforces role access for vendor store management.

Public registration creates customer accounts only. A signed-in customer can
activate vendor access with `POST /api/auth/become-vendor`; the endpoint changes
the account role and refreshes its session cookie. A production marketplace
should add vendor identity/business verification and an administrative review
workflow before allowing stores to take orders.

## API routes

- `POST /api/auth/register` — create an unverified customer account and email a
  verification link.
- `POST /api/auth/verify-email` — verify an email with its link token.
- `POST /api/auth/resend-verification` — send another verification link.
- `POST /api/auth/login` — start a session.
- `POST /api/auth/logout` — clear the session cookie.
- `GET /api/auth/me` — return the signed-in account.
- `POST /api/auth/become-vendor` — promote the signed-in customer account to a
  vendor account.
- `GET /api/stores` — list open stores and their menu items. Optional
  `latitude` and `longitude` query parameters sort located stores nearest-first
  and include each store's distance in miles.
- `POST /api/stores` — create the signed-in vendor's store.
- `GET /api/stores/me` — view the signed-in vendor's store.
- `PATCH /api/stores/me/location` — update the signed-in vendor's map
  coordinates.
- `PATCH /api/stores/me/contact` — add or remove a WhatsApp contact number in
  international format for the vendor's store.
- `POST /api/stores/me/status?open=true|false` — open or pause a store.
- `POST /api/stores/me/products` — add a menu item.
- `PATCH /api/stores/me/products/:productId` — edit a menu item owned by the
  signed-in vendor.
- `POST /api/stores/me/products/image` — upload a JPEG, PNG, or WebP menu image
  up to 5 MB; returns an image path for use when creating or editing a menu item.
- `DELETE /api/stores/me/products/:productId` — remove a menu item owned by
  the signed-in vendor.
- `POST /api/orders` — place a customer order from available vendor menu items.
  Mixed-store carts are split into one order per store.
- `GET /api/orders/customer` — list the signed-in customer's latest orders.
- `GET /api/orders/customer/events` — receive live order status updates for the
  signed-in customer.
- `POST /api/orders/:orderId/review` — submit one 1–5 star review for a
  delivered order.
- `GET /api/stores/:storeId/reviews` — read a store's recent customer reviews.
- `POST /api/nutrition/photo` — estimate meal calories and nutrients from a
  JPEG, PNG, or WebP photo (up to 5 MB; requires `OPENAI_API_KEY`).
- `GET /api/nutrition/barcode/:code` — look up packaged-food nutrition using an
  8–14 digit barcode from Open Food Facts.
- `GET /api/orders/:orderId/messages` — read messages between the customer and
  vendor for an order.
- `POST /api/orders/:orderId/messages` — send a message in an order
  conversation.
- `POST /api/orders/:orderId/messages/read` — mark received order messages as
  read for the signed-in participant.
- `POST /api/orders/:orderId/messages/typing` — publish typing state to the
  other order participant.
- `GET /api/orders/:orderId/messages/events` — receive live chat messages for
  an order, including typing indicators. Customer and vendor order event streams
  also announce incoming messages so unread counts refresh live.
- `GET /api/orders/vendor` — list the signed-in vendor's orders.
- `GET /api/orders/vendor/events` — receive `order.updated` server-sent events
  for incoming orders and status changes.
- `PATCH /api/orders/vendor/:orderId/status` — advance or cancel an order.

Order statuses move through `PENDING`, `CONFIRMED`, `PREPARING`, `READY`,
`OUT_FOR_DELIVERY`, and `DELIVERED`. Vendors can cancel an order before it is
out for delivery. The dashboard listens for live events and refreshes every 15
seconds as a fallback. Live events are process-local, so multi-instance
deployments should use a shared pub/sub system. Order chat messages and reviews
are stored in the database; live chat events are process-local, so multi-instance
deployments should also use shared pub/sub for immediate chat delivery.

Vendors may save an optional WhatsApp number in international format
(for example, `+14155552671`) from the store dashboard. The number is used to
build a direct `wa.me` link for that store's order conversations.

Sessions are delivered in HTTP-only cookies. For production, use HTTPS, set a
strong unique `JWT_SECRET`, configure exact trusted frontend origins, and use a
shared rate-limit store if deploying multiple API instances. SQLite is suitable
for local development; use a managed production database and migrations for
deployment. Uploaded menu images are stored in `backend\uploads`; production
deployments should mount persistent storage at that path or replace local
uploads with a managed object-storage service.
