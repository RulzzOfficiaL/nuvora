const express = require("express");
const Transaction = require("../models/Transaction");
const { verifyWithShopeePublicKey } = require("../utils/shopee");

const router = express.Router();

/**
 * POST /api/webhook/shopee
 * Endpoint yang didaftarkan ke ShopeePay untuk notifikasi pembayaran.
 *
 * Header yang biasanya dikirim ShopeePay (contoh):
 *   X-Shopee-Signature: <base64>
 *   X-Shopee-Timestamp: <unix>
 *
 * Body: JSON payload dari ShopeePay.
 */
router.post("/shopee", async (req, res) => {
  try {
    var signature =
      req.headers["x-shopee-signature"] ||
      req.headers["x-signature"] ||
      "";
    var rawBody = req.rawBody || JSON.stringify(req.body); // butuh rawBody (lihat catatan di bawah)

    // 1) Verifikasi signature (kalau public key sudah ada)
    if (process.env.SHOPEE_PUBLIC_KEY) {
      var ok = verifyWithShopeePublicKey(rawBody, signature);
      if (!ok) {
        console.warn("❌ Signature webhook tidak valid");
        return res.status(401).json({ error: "invalid signature" });
      }
    } else {
      console.warn("⚠️  SHOPEE_PUBLIC_KEY kosong — verifikasi signature dilewati (mode dev)");
    }

    // 2) Ambil data penting dari payload (sesuaikan field dgn dokumentasi resmi)
    var data = req.body || {};
    var refId =
      data.reference_id ||
      data.referenceId ||
      data.merchant_ref ||
      data.trx_id ||
      null;
    var status =
      data.status ||
      data.transaction_status ||
      data.payment_status ||
      null;

    if (!refId) {
      return res.status(400).json({ error: "reference_id tidak ditemukan di payload" });
    }

    var trx = await Transaction.findOne({ trxId: refId });
    if (!trx) {
      console.warn("Webhook: trx tidak ditemukan:", refId);
      return res.json({ ok: true, note: "trx tidak ditemukan, diabaikan" });
    }

    trx.rawCallback = data;

    var s = String(status).toUpperCase();
    if (s === "SUCCESS" || s === "PAID" || s === "SETTLED" || s === "COMPLETED") {
      if (trx.status !== "PAID") {
        trx.status = "PAID";
        trx.paidAt = new Date();
      }
    } else if (s === "EXPIRED") {
      trx.status = "EXPIRED";
    } else if (s === "CANCELED" || s === "CANCELLED" || s === "FAILED") {
      trx.status = "CANCELED";
    }

    await trx.save();

    // ShopeePay biasanya mengharapkan response 200 cepat
    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

