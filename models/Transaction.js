const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    trxId: { type: String, required: true, unique: true, index: true },
    merchantName: { type: String, default: "Toko" },
    amount: { type: Number, required: true },
    staticCode: { type: String, required: true },
    dynamicCode: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "EXPIRED", "CANCELED"],
      default: "PENDING",
    },
    paidAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    rawCallback: { type: Object, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);

