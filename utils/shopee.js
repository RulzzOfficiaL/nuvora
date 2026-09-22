const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SHOPEE_HOST = "https://openapi.shopee.co.id"; // sesuaikan kalau beda (mis. partner.shopeemobile.com untuk SEA)

let cachedToken = { value: null, expiresAt: 0 };

/**
 * Ambil private key milik merchant dari file PEM.
 * Dipakai untuk menandatangani request ke ShopeePay (RSA-SHA256).
 */
function loadPrivateKey() {
  var p = process.env.SHOPEE_PRIVATE_KEY_PATH;
  if (!p) throw new Error("SHOPEE_PRIVATE_KEY_PATH belum diisi di .env");
  var abs = path.isAbsolute(p) ? p : path.join(__dirname, "..", p);
  return fs.readFileSync(abs, "utf8");
}

/**
 * Sign string pakai private key → base64.
 */
function signWithPrivateKey(rawStr) {
  var priv = loadPrivateKey();
  var signer = crypto.createSign("RSA-SHA256");
  signer.update(rawStr);
  signer.end();
  return signer.sign(priv, "base64");
}

/**
 * Verifikasi signature dari ShopeePay pakai public key mereka.
 * Public key didapat dari dokumentasi resmi ShopeePay (bukan kamu yang bikin).
 */
function verifyWithShopeePublicKey(rawStr, signatureBase64) {
  var pub = process.env.SHOPEE_PUBLIC_KEY;
  if (!pub) throw new Error("SHOPEE_PUBLIC_KEY belum diisi di .env");
  var verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(rawStr);
  verifier.end();
  return verifier.verify(pub, signatureBase64, "base64");
}

/**
 * Ambil access token dari ShopeePay.
 * Endpoint & format bisa berbeda tergantung produk (ShopeePay Merchant / SPayLater / dll).
 * Sesuaikan setelah dokumentasi resmi kamu terima.
 */
async function getAccessToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  var partnerId = process.env.SHOPEE_CLIENT_ID;
  var partnerKey = process.env.SHOPEE_CLIENT_SECRET;
  if (!partnerId || !partnerKey) {
    throw new Error("SHOPEE_CLIENT_ID / SHOPEE_CLIENT_SECRET belum diisi di .env");
  }

  var timestamp = Math.floor(Date.now() / 1000);
  var body = JSON.stringify({
    partner_id: Number(partnerId),
    timestamp: timestamp,
    sign: "" // akan diisi di bawah
  });

  // Contoh pola sign (sesuaikan dengan dokumen resmi):
  // base_string = partner_id + path + timestamp + body
  var baseString = partnerId + "/api/v1/access_token" + timestamp + body;
  var signature = signWithPrivateKey(baseString);

  var resp = await fetch(SHOPEE_HOST + "/api/v1/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partner_id: Number(partnerId),
      timestamp: timestamp,
      sign: signature
    })
  });

  var data = await resp.json();
  if (!data.access_token) {
    throw new Error("Gagal ambil access_token: " + JSON.stringify(data));
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expire_in || 3600) * 1000
  };
  return cachedToken.value;
}

/**
 * Buat QRIS dinamis via API ShopeePay.
 * (Nanti dipakai di routes/qris.js untuk mode "server-side QRIS")
 */
async function createDynamicQrisFromShopee(amount, refId) {
  var token = await getAccessToken();
  var timestamp = Math.floor(Date.now() / 1000);

  var payload = {
    merchant_id: Number(process.env.SHOPEE_MERCHANT_ID),
    store_id: Number(process.env.SHOPEE_STORE_ID),
    amount: Number(amount),
    currency: "IDR",
    reference_id: refId,
    timestamp: timestamp
  };

  var bodyStr = JSON.stringify(payload);
  var baseString =
    process.env.SHOPEE_CLIENT_ID +
    "/api/v1/qris/dynamic" +
    timestamp +
    bodyStr;

  payload.sign = signWithPrivateKey(baseString);

  var resp = await fetch(SHOPEE_HOST + "/api/v1/qris/dynamic", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(payload)
  });

  return resp.json();
}

module.exports = {
  signWithPrivateKey,
  verifyWithShopeePublicKey,
  getAccessToken,
  createDynamicQrisFromShopee
};

