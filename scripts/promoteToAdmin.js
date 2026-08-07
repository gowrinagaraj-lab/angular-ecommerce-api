/*
One-off script: promotes an existing user to the "admin" role.

Usage: node scripts/promoteToAdmin.js user@example.com
*/

require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const User = require("../src/models/User");

const run = async () => {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: node scripts/promoteToAdmin.js <email>");
    process.exit(1);
  }

  await connectDB();

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { role: "admin" },
    { new: true }
  );

  if (!user) {
    console.error(`No user found with email "${email}"`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`"${user.email}" is now an admin`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error("Failed to promote user:", error);
  process.exit(1);
});
