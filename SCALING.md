# MongoDB Scaling & Advanced Features Guide

This document explains how to set up and configure MongoDB advanced features for the Ecommerce API, specifically Replication, Sharding, and Transactions.

## 1. Replica Sets and Transactions

In `order.controller.js`, the `checkout` process uses MongoDB **Transactions** (`session.withTransaction`) to ensure that order creation, stock deduction, and cart clearing all happen atomically.

**Important:** MongoDB requires the database to be running as a **Replica Set** to support transactions. If you are running a standalone MongoDB instance, transactions will fail (the code currently includes a fallback, but for production, you must use a Replica Set).

### Converting Local MongoDB to a Replica Set
If you are running MongoDB locally, you can easily convert it to a single-node replica set for development:

1. Stop your MongoDB service.
2. Start `mongod` with the `--replSet` flag:
   ```bash
   mongod --replSet rs0
   ```
3. Open the `mongosh` shell and initialize the replica set:
   ```javascript
   rs.initiate()
   ```

### Updating `MONGODB_URI`
Once your replica set is running, you must update your `.env` connection string to point to it:
```env
# Example Replica Set Connection String
MONGODB_URI=mongodb://127.0.0.1:27017/ecommerce?replicaSet=rs0
```
For MongoDB Atlas, this is handled automatically (Atlas clusters are replica sets by default).

---

## 2. Sharding

Sharding is used to distribute data across multiple machines. It is highly recommended for massive scale. We have added a `shardKey` definition in `src/models/Order.js` for the `user` field.

### Enabling Sharding on the Database
To actually shard the collection, you must run administrative commands on a MongoDB sharded cluster via the `mongosh` shell. 

1. Enable sharding on the database:
   ```javascript
   sh.enableSharding("ecommerce")
   ```
2. Shard the `orders` collection using the index we defined:
   ```javascript
   sh.shardCollection("ecommerce.orders", { user: 1 })
   ```

### Updating `MONGODB_URI` for a Sharded Cluster
When connecting to a sharded cluster, you connect to the `mongos` router instead of the individual `mongod` instances:
```env
# Example Sharded Cluster Connection String
MONGODB_URI=mongodb://mongos-router:27017/ecommerce
```

---

## 3. Compound Indexes

We have added compound indexes to optimize queries:
- **Order Model (`src/models/Order.js`)**
  - `{ user: 1, createdAt: -1 }`: Optimizes the "My Orders" user history.
  - `{ orderStatus: 1, paymentMethod: 1 }`: Optimizes the admin "All Orders" dashboard filters.
- **Product Model (`src/models/Product.js`)**
  - `{ category: 1, isActive: 1 }`: Optimizes retrieving active products within a specific category.

Mongoose will automatically build these indexes when the app starts. If you have a massive production database, you may want to set `autoIndex: false` in mongoose configurations and build indexes manually in the background using `db.collection.createIndex()`.

---

## 4. Aggregation Pipelines

We have added a `$match`, `$group`, `$sort`, and `$project` aggregation pipeline in `getSalesAnalytics` (`controllers/order.controller.js`). 

- **Endpoint**: `GET /api/orders/admin/sales-analytics`
- **Purpose**: Groups completed orders by day to show daily revenue and order counts, which is perfect for building an admin dashboard chart.
