const express = require("express");
const { nanoid } = require("nanoid");
const QRCode = require("qrcode");
const Transaction = require("../models/Transaction");
const { buildDynamicQris } = require("../utils/qris");

const router = express.Router();

/**
 * POST /api/qris/create
 * Body: { staticCode, amount, merchantName?, ttlMinutes? }
 */
router.post("/create", async (req, res) => {
  try {
    const { staticCode, amount, merchantName, ttlMinutes } = req.body;

    if (!staticCode || !amount) {
      return res.status(400).json({ error: "staticCode dan amount wajib diisi." });
    }

    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: "amount harus angka > 0." });
    }

    const dynamicCode = buildDynamicQris(staticCode, amt);
    const trxId = "TRX-" + nanoid(10);
    const ttl = (ttlMinutes || 5) * 60 * 1000;

    // Generate QR di server sebagai Data URL (PNG base64)
    const qrDataUrl = await QRCode.toDataURL(dynamicCode, {
  errorCorrectionLevel: "L",
  width: 800,
  margin: 4,
  color: { dark: "#000000", light: "#FFFFFF" },
});

    const trx = await Transaction.create({
      trxId,
      merchantName: merchantName || "Toko",
      amount: amt,
      staticCode: staticCode.replace(/[\r\n\s]/g, ""),
      dynamicCode,
      expiresAt: new Date(Date.now() + ttl),
    });

    res.json({
      ok: true,
      trxId: trx.trxId,
      amount: trx.amount,
      dynamicCode: trx.dynamicCode,
      qrDataUrl, // <-- frontend pakai ini
      expiresAt: trx.expiresAt,
      status: trx.status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/qris/:trxId
 */
router.get("/:trxId", async (req, res) => {
  const trx = await Transaction.findOne({ trxId: req.params.trxId });
  if (!trx) return res.status(404).json({ error: "Transaksi tidak ditemukan." });

  if (trx.status === "PENDING" && new Date() > trx.expiresAt) {
    trx.status = "EXPIRED";
    await trx.save();
  }

  res.json(trx);
});

/**
 * POST /api/qris/:trxId/paid
 */
router.post("/:trxId/paid", async (req, res) => {
  const trx = await Transaction.findOne({ trxId: req.params.trxId });
  if (!trx) return res.status(404).json({ error: "Transaksi tidak ditemukan." });

  if (trx.status !== "PENDING") {
    return res.status(400).json({ error: `Status saat ini: ${trx.status}` });
  }

  trx.status = "PAID";
  trx.paidAt = new Date();
  await trx.save();

  res.json({ ok: true, trx });
});

/**
 * POST /api/qris/:trxId/cancel
 */
router.post("/:trxId/cancel", async (req, res) => {
  const trx = await Transaction.findOne({ trxId: req.params.trxId });
  if (!trx) return res.status(404).json({ error: "Transaksi tidak ditemukan." });

  trx.status = "CANCELED";
  await trx.save();
  res.json({ ok: true, trx });
});

module.exports = router;
