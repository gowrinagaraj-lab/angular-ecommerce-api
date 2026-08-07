/*
One-off migration: converts legacy Product.category string values
(e.g. "mobiles") into references to Category documents.

Usage: node scripts/migrateProductCategories.js
*/

require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Category = require("../src/models/Category");

const run = async () => {
  await connectDB();

  // Use the native collection so Mongoose doesn't try to cast the
  // legacy string category values to ObjectId while reading them.
  const productsCollection = mongoose.connection.db.collection("products");

  const products = await productsCollection
    .find({ category: { $type: "string" } })
    .toArray();

  console.log(`Found ${products.length} product(s) with a string category`);

  const nameToId = new Map();
  let updated = 0;

  for (const product of products) {
    const rawName = (product.category || "").trim();

    if (!rawName) {
      console.warn(`Skipping product ${product._id}: empty category`);
      continue;
    }

    const key = rawName.toLowerCase();

    let categoryId = nameToId.get(key);

    if (!categoryId) {
      let category = await Category.findOne({
        name: { $regex: `^${key}$`, $options: "i" }
      });

      if (!category) {
        category = await Category.create({ name: key });
        console.log(`Created category "${key}" (${category._id})`);
      }

      categoryId = category._id;
      nameToId.set(key, categoryId);
    }

    await productsCollection.updateOne(
      { _id: product._id },
      { $set: { category: categoryId } }
    );

    updated += 1;
  }

  console.log(`Migrated ${updated} product(s) across ${nameToId.size} categor${nameToId.size === 1 ? "y" : "ies"}`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
