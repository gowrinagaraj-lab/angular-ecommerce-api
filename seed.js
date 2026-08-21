const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const MONGO_URI = "mongodb://127.0.0.1:27017/ecommerce";

async function importData() {
  try {
    await mongoose.connect(MONGO_URI);

    console.log("Connected to MongoDB...");

    const filePath = path.join(__dirname, "products.json");

    if (!fs.existsSync(filePath)) {
      throw new Error(`products.json not found at: ${filePath}`);
    }

    const rawData = fs.readFileSync(filePath, "utf-8");
    const products = JSON.parse(rawData);

    console.log(`Found ${products.length} products`);

    const formattedProducts = products.map((p) => ({
      ...p,

      category:
        typeof p.category === "object" && p.category.$oid
          ? new mongoose.Types.ObjectId(p.category.$oid)
          : new mongoose.Types.ObjectId(p.category),

      createdAt:
        typeof p.createdAt === "object" && p.createdAt.$date
          ? new Date(p.createdAt.$date)
          : new Date(p.createdAt),

      updatedAt:
        typeof p.updatedAt === "object" && p.updatedAt.$date
          ? new Date(p.updatedAt.$date)
          : new Date(p.updatedAt),
    }));

    const result = await mongoose.connection
      .collection("products")
      .insertMany(formattedProducts);

    console.log(
      `Successfully imported ${result.insertedCount} products!`
    );

    await mongoose.disconnect();

    console.log("MongoDB connection closed.");
  } catch (error) {
    console.error("Import failed:");
    console.error(error);

    await mongoose.disconnect();
    process.exit(1);
  }
}

importData();