# Node.js Learning Roadmap

This roadmap is based on the concepts implemented in this ecommerce API. Use
the checkboxes to track your learning, not only the features that are already
present in the code.

## 1. Topics Already Practiced Here

### JavaScript and Node.js fundamentals

- [x] CommonJS modules with `require` and `module.exports`
- [x] `async`/`await`, Promises, and asynchronous database/API operations
- [x] npm and `package.json` scripts
- [x] Environment variables with `dotenv`
- [x] Running scripts with Node.js and using `nodemon` during development
- [x] Reading configuration and handling process startup

### HTTP APIs with Express

- [x] Creating an Express application and starting an HTTP server
- [x] Routing with `express.Router()`
- [x] Route parameters, query parameters, and JSON request bodies
- [x] Middleware composition and route-level middleware
- [x] REST-style CRUD endpoints
- [x] HTTP status codes and consistent JSON response envelopes
- [x] CORS, security headers with Helmet, and request logging with Morgan
- [x] Serving static files from the `uploads` directory

### MongoDB and Mongoose

- [x] Connecting Node.js to MongoDB with Mongoose
- [x] Mongoose schemas, models, timestamps, enums, defaults, and indexes
- [x] References between documents and `populate`
- [x] Embedded arrays and denormalized order-item snapshots
- [x] CRUD queries, filtering, sorting, pagination, and aggregation-style data
- [x] Unique constraints and ownership queries by the authenticated user
- [x] MongoDB TTL indexes for expiring sign-in activity
- [x] Change streams for product updates

### Authentication and authorization

- [x] Password hashing with `bcrypt`
- [x] JWT creation, expiry, and Bearer-token authentication
- [x] Express authentication middleware
- [x] Role-based authorization for admin/customer actions
- [x] Password reset tokens and email-based reset flows
- [x] Sign-in activity logging

### Validation and security

- [x] Request validation with `express-validator`
- [x] MongoDB ObjectId validation
- [x] Ownership checks for user resources
- [x] HMAC-SHA256 payment signature verification
- [x] Timing-safe comparison for payment signatures
- [x] Basic security middleware with Helmet and CORS

### Integrations and real-time features

- [x] Sending email with Nodemailer and SMTP
- [x] Razorpay order creation and payment verification
- [x] Socket.IO server and connection/disconnection events
- [x] Broadcasting product changes from a MongoDB change stream
- [x] In-app notifications
- [x] File-upload dependency and upload middleware concepts

### Testing and project maintenance

- [x] Unit testing controllers with Jest
- [x] Mocking models and Express response objects
- [x] Testing authentication and authorization middleware
- [x] Running tests in watch mode and generating coverage reports
- [x] Seed, migration, and admin-promotion scripts
- [x] Reading architecture and scaling documentation

## 2. Topics Present but Needing Deeper Practice

These concepts exist in the project, but should be studied until you can
implement them without copying an existing controller.

- [ ] Express error-handling middleware and `next(error)`
- [ ] Centralized response and error patterns
- [ ] Configuration validation at startup
- [ ] MongoDB transactions with `session.withTransaction`
- [ ] Atomic stock updates and concurrency/race-condition handling
- [ ] MongoDB indexes and query performance analysis with `explain()`
- [ ] Robust pagination, filtering, and full-text search
- [ ] JWT security choices: refresh tokens, revocation, rotation, and cookies
- [ ] Rate limiting, brute-force protection, and request-size limits
- [ ] Secure file-upload validation, storage, and image processing
- [ ] Socket.IO authentication, rooms, namespaces, and scaling with an adapter
- [ ] Payment idempotency, retries, and webhook handling
- [ ] Background jobs for email and other slow work
- [ ] Integration tests using a real or in-memory MongoDB
- [ ] API documentation with OpenAPI/Swagger
- [ ] Structured logging, request IDs, and error monitoring

## 3. Important Node.js Topics Not Yet Covered Here

### Core Node.js

- [ ] Node.js event loop, timers, microtasks, and backpressure
- [ ] The `fs`, `path`, `url`, `events`, `stream`, and `buffer` modules
- [ ] Building an HTTP server with Node's built-in `http` module
- [ ] Streams and streaming large files or responses
- [ ] Worker threads and child processes
- [ ] Graceful shutdown and handling `SIGTERM`/`SIGINT`
- [ ] Process memory, CPU profiling, and diagnosing leaks

### API and application design

- [ ] Layered architecture with controllers, services, and repositories
- [ ] Dependency injection and testable application composition
- [ ] API versioning and backward compatibility
- [ ] Idempotency keys and reliable retry design
- [ ] Caching with Redis
- [ ] Message queues and event-driven architecture
- [ ] Webhooks and webhook signature verification

### Testing and quality

- [ ] Integration tests against MongoDB
- [ ] End-to-end tests against a running API
- [ ] Contract testing
- [ ] Load and stress testing
- [ ] Mutation testing and meaningful coverage targets
- [ ] ESLint, Prettier, and pre-commit checks

### Production and deployment

- [ ] Docker and Docker Compose
- [ ] CI/CD pipelines
- [ ] HTTPS, reverse proxies, and TLS termination
- [ ] Health checks and readiness checks
- [ ] Horizontal scaling and load balancing
- [ ] Redis or another shared store for Socket.IO scaling
- [ ] Database backups, migrations, and rollback strategy
- [ ] Monitoring, metrics, tracing, and alerting
- [ ] Secrets management and environment-specific configuration

## 4. Recommended Study Order

1. Master the existing request flow: route -> middleware -> controller -> model.
2. Add centralized error handling and configuration validation.
3. Learn MongoDB indexes, transactions, and concurrency by improving checkout.
4. Add integration tests with an in-memory or test MongoDB.
5. Learn streams, graceful shutdown, and process-level Node.js behavior.
6. Add Redis caching, rate limiting, and a background email queue.
7. Document the API with OpenAPI and add end-to-end tests.
8. Containerize the app and learn deployment, monitoring, and scaling.

## 5. Good Practice Projects for This Repository

- Add a transactional checkout that cannot oversell stock.
- Add a centralized error handler and request ID middleware.
- Add refresh-token authentication with token rotation.
- Add product image uploads with type, size, and ownership checks.
- Add Razorpay webhook support and idempotent payment processing.
- Move email sending to a background queue.
- Add integration and end-to-end tests for registration, checkout, and payment.
- Add Docker, health endpoints, CI, and production logging.