# Developer Guide — Ecommerce API

## 1. Prerequisites

- Node.js (compatible with Express 5 / Mongoose 9 — Node 18+ recommended)
- A MongoDB instance (local `mongod` or Atlas)
- A Razorpay test account (for payment flows)
- An SMTP account/relay (for email flows — password reset, order emails, delivery OTP)

## 2. Setup

```bash
npm install
```

Create a `.env` file in the project root with:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/ecommerce
JWT_SECRET=<a long random string>
CLIENT_URL=http://localhost:4200

RAZORPAY_KEY_ID=<razorpay key id>
RAZORPAY_KEY_SECRET=<razorpay key secret>

SMTP_HOST=<smtp host>
SMTP_PORT=587
SMTP_USER=<smtp user>
SMTP_PASS=<smtp password>
EMAIL_FROM=no-reply@yourapp.com
```

All of these are read directly via `process.env` (no config-schema validation layer exists — a missing var fails at the point of use, e.g. a missing `JWT_SECRET` breaks every `protect`-guarded route, a missing SMTP var breaks the first email send).

## 3. Running

```bash
npm run dev     # nodemon, auto-restart
npm start        # node src/server.js
```

Server listens on `PORT` (default `5000`). On boot it connects to MongoDB (`src/config/db.js`); if the connection fails, the process exits (`process.exit(1)`).

## 4. Bootstrapping data

- **First user is admin automatically.** Register once via `POST /api/auth/register` and that account is `role: "admin"`.
- **Promote an existing user to admin:**
  ```bash
  node scripts/promoteToAdmin.js user@example.com
  ```
- **Seed products from a JSON dump** (`products.json` in project root, expects Mongo extended-JSON `$oid`/`$date` shapes):
  ```bash
  node seed.js
  ```
  Note: `seed.js` hardcodes `mongodb://127.0.0.1:27017/ecommerce` rather than reading `MONGO_URI` — point it at the same DB you're running against, or edit the constant.
- **Migrate legacy string-category products** to real `Category` references:
  ```bash
  npm run migrate:categories
  ```

## 5. Testing

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

Tests live under `tests/`, mirroring `controllers/` and `src/middleware/`. Controllers are unit-tested by mocking Mongoose models directly (Jest `jest.mock(...)`) and using `tests/helpers/mockRes.js` to stub Express's `res`. There is no integration/e2e suite hitting a real (or in-memory) MongoDB — tests don't require a running database.

When adding a controller, add a matching `tests/controllers/<name>.controller.test.js` following the existing pattern: mock the model module, call the exported handler directly with a fake `req`/`res`, assert on `res.status`/`res.json` calls.

## 6. Project structure

```
controllers/          Route handlers (business logic + response shaping) — legacy top-level location
routes/                Express routers — legacy top-level location
src/
  app.js               Express app assembly: middleware + route mounting
  server.js             Entry point: loads env, connects DB, starts listener
  config/
    db.js               Mongoose connection
    razorpay.js          Razorpay SDK client
  constants/
    indianStates.js      Enum used by Address validation
  middleware/
    auth.middleware.js    JWT verification ("protect")
    authorize.middleware.js  Role gate ("authorize(...roles)")
  models/               Mongoose schemas (one file per collection)
utils/
  generateToken.js       JWT signing helper
  sendEmail.js            Nodemailer wrapper
  notification.js         In-app notification helper (best-effort, non-throwing)
scripts/                One-off / operational Node scripts (not part of the running server)
tests/                  Jest specs, mirrors controllers/ + src/middleware/
```

**Note the split:** `controllers/` and `routes/` sit at the project root, while `models/`, `middleware/`, and `config/` sit under `src/`. This is existing/inherited structure, not a convention to replicate deliberately — when adding a new domain, follow whichever sibling feature you're closest to (e.g. notifications) for import-path consistency.

## 7. Adding a new API resource — the established pattern

Every existing resource follows the same shape. To add one (e.g. "reviews"):

1. **Model** — `src/models/Review.js`, a Mongoose schema with `timestamps: true`.
2. **Controller** — `controllers/review.controller.js`, one exported async function per action. Each handler:
   - Runs `validationResult(req)` first if the route has `express-validator` rules, short-circuiting with `400` on failure.
   - Wraps logic in `try/catch`, returning `{ success: false, message }` with an appropriate status on error, `500` for unhandled ones.
   - Returns `{ success: true, message?, data?, ... }` on success.
3. **Routes** — `routes/review.routes.js`, an `express.Router()`. Apply `protect` (and `authorize("admin")` where needed) per-route or via `router.use(protect)` if every route in the file requires auth (see `cart.routes.js`, `wishlist.routes.js`, `address.routes.js`).
4. **Mount** — add `app.use("/api/reviews", require("./../routes/review.routes"));` in [src/app.js](../src/app.js).
5. **Tests** — `tests/controllers/review.controller.test.js`, mocking the model.

## 8. Auth model

- `POST /api/auth/register` / `login` return a JWT (`generateToken`, 7-day expiry, payload `{ id, role }`).
- Clients send `Authorization: Bearer <token>` on protected routes.
- `protect` ([src/middleware/auth.middleware.js](../src/middleware/auth.middleware.js)) verifies the token and sets `req.user = { id, role }`. It does **not** hit the database — role comes straight from the token claim, so a role change (e.g. via `promoteToAdmin.js`) only takes effect on the user's *next* login/token issuance.
- `authorize("admin")` ([src/middleware/authorize.middleware.js](../src/middleware/authorize.middleware.js)) checks `req.user.role` against the allowed list; must run after `protect`.
- Passwords are hashed with `bcrypt` (cost factor 10); the `password` field has `select: false` and must be explicitly `.select("+password")`ed (see `login`).
- Every login attempt (success or failure) is logged to `SignInActivity` (TTL: 90 days) — failures do not throw and never block the response.

## 9. Conventions to follow

- **Response envelope**: always `{ success: boolean, message?, data?, ... }`. Keep this consistent for any new endpoint.
- **Pagination**: `?page=&limit=`, response includes `total`, `page`, `totalPages`, `data` (see any `get*` list handler for the exact pattern, e.g. `getOrders`, `getMyNotifications`).
- **Mongo ID validation**: routes taking an ID in the body/params typically validate with `express-validator`'s `.isMongoId()`; handlers that don't (e.g. product/category `:id` params) catch `error.kind === "ObjectId"` instead. Prefer the `express-validator` approach for new routes.
- **Ownership checks**: for user-scoped resources, filter queries by `user: req.user.id` rather than trusting a client-supplied user id (see addresses, cart, wishlist, orders `getOrderById`/`cancelOrder`).
- **Notifications**: use `createUserNotification` from `utils/notification.js` for any user-facing event worth surfacing in-app; it swallows its own errors, so it's safe to `await` without a try/catch.
- **Email failures should not silently corrupt state**: when an email send is essential to the action (e.g. reset-password, delivery OTP), the existing pattern rolls back the just-set field on send failure — follow it for similar flows.
- No repo-wide linter/formatter is configured — match the (loose, mixed-indentation) style of the file you're editing rather than introducing a new one.

## 10. Debugging tips

- `morgan("dev")` logs every request/response to stdout.
- Several controllers still have stray `console.log` debug lines (e.g. `auth.controller.js` logging the full user record on login, `authorize.middleware.js` logging `req.user`). These are pre-existing noise, not intentional logging — fine to leave in place unless you're touching that code anyway, but don't add more of them.
- There is no centralized error-handling middleware; every controller catches its own errors. An uncaught throw outside a controller (e.g. in a route-level `express-validator` misconfiguration) will propagate to Express's default handler.
