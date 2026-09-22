const mongoose = require("mongoose");

async function connectDB() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI belum diisi di .env");
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected:", mongoose.connection.name);
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;

