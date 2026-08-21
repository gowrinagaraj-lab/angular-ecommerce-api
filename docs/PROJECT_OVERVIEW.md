# Project Overview — Ecommerce API

## What this is

A REST API for an e-commerce platform, built with Node.js, Express, and MongoDB (Mongoose). It provides the backend for a storefront: product/category catalog, cart, wishlist, checkout with Razorpay payments, order lifecycle (including OTP-verified delivery), address book, authentication with role-based access, and in-app notifications.

A companion Angular frontend (`projects/frontend`) consumes this API.

## Core domains

| Domain | Responsibility |
|---|---|
| **Auth** | Registration, login, password reset, JWT issuance, sign-in activity audit log |
| **Catalog** | Products and categories (CRUD, search, filtering, pagination) |
| **Cart** | Per-user cart with stock-aware add/update/remove |
| **Wishlist** | Per-user saved products |
| **Addresses** | Per-user address book with a single default address |
| **Orders** | Checkout, order status lifecycle, cancellation, OTP-verified delivery, admin stats |
| **Payments** | Razorpay order creation and signature-verified payment confirmation |
| **Notifications** | In-app notifications, admin broadcast, per-user read/unread state |

## Tech stack

- **Runtime**: Node.js (CommonJS modules)
- **Framework**: Express 5
- **Database**: MongoDB via Mongoose 9
- **Auth**: JSON Web Tokens (`jsonwebtoken`) + `bcrypt` password hashing
- **Validation**: `express-validator`
- **Payments**: Razorpay SDK, HMAC-SHA256 signature verification
- **Email**: `nodemailer` (SMTP)
- **Security/middleware**: `helmet`, `cors`, `morgan` (dev logging)
- **File uploads**: `multer` (dependency present; not currently wired into routes)
- **Testing**: Jest, with hand-rolled `res` mocks for controller unit tests

## Key business rules worth knowing

- **First registered user becomes admin.** Every subsequent registration is a `customer`. There is no separate admin-invite flow — promotion after the fact is done via `scripts/promoteToAdmin.js`.
- **Stock is authoritative on `Product.stock`.** It's decremented at checkout (COD) or at payment verification (CARD/UPI), and restored on cancellation.
- **Checkout is not atomic.** Order creation, stock decrement, and cart clearing are separate sequential writes with no MongoDB transaction wrapping them (see [Architecture](./ARCHITECTURE.md#known-gaps) for the implication).
- **Delivery confirmation is OTP-based.** An admin generates a one-time code (emailed to the customer), and a second admin call verifies it to mark the order `Delivered`.
- **A user's cart and wishlist are singleton documents** (unique index on `user`), not one row per item.
- **Addresses maintain exactly one default** — writes that set a new default unset all others for that user in the same request.

## Where to go next

- New to the codebase and setting up locally → [Developer Guide](./DEVELOPER_GUIDE.md)
- Understanding how requests flow, data relationships, and integrations → [Architecture Topology](./ARCHITECTURE.md)
