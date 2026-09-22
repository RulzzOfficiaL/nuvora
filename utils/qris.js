// ================== CRC16-CCITT (EMVCo) ==================
function crc16ccitt(str) {
  let crc = 0xffff;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ================== TLV Parser ==================
function parseTLV(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    if (i + 4 > str.length) break;
    const tag = str.substring(i, i + 2);
    const lenStr = str.substring(i + 2, i + 4);
    const len = parseInt(lenStr, 10);
    if (isNaN(len)) break;
    const valueStart = i + 4;
    const valueEnd = valueStart + len;
    if (valueEnd > str.length) break;
    out.push({
      tag,
      len,
      value: str.substring(valueStart, valueEnd),
      start: i,
      end: valueEnd
    });
    i = valueEnd;
  }
  return out;
}

// ================== Build Dynamic QRIS ==================
function buildDynamicQris(staticCode, amount) {
  // 1. Bersihkan newline/tab + trim awal/akhir.
  //    JANGAN buang spasi di tengah (bisa ngerusak tag 59 Merchant Name).
  let qris = String(staticCode).replace(/[\r\n\t]/g, "").trim();
  if (qris.length < 20) throw new Error("Kode QRIS terlalu pendek / kosong.");

  // 2. Buang CRC lama + tag 63 lama (4 char CRC + 4 char "6304" = 8 char terakhir)
  //    Cek dulu: apakah string diakhiri "6304"?
  if (qris.slice(-8, -4) === "6304") {
    qris = qris.slice(0, -8); // buang "6304" + CRC lama
  } else {
    // Fallback: cuma buang 4 char CRC (asumsi tanpa tag 63 eksplisit)
    qris = qris.slice(0, -4);
  }

  // 3. Parse TLV
  const tlvs = parseTLV(qris);
  if (tlvs.length === 0) throw new Error("Gagal parse TLV.");

  // 4. Validasi
  const tag00 = tlvs.find((t) => t.tag === "00");
  if (!tag00 || tag00.value !== "01") throw new Error("Tag 00 bukan '01'.");

  const tag01 = tlvs.find((t) => t.tag === "01");
  if (!tag01) throw new Error("Tag 01 tidak ditemukan.");

  const tag58 = tlvs.find((t) => t.tag === "58");
  if (!tag58 || tag58.value !== "ID") throw new Error("Bukan QRIS Indonesia.");

  // 5. Bangun ulang TLV
  const amountStr = String(Math.round(amount));
  const amountLen = String(amountStr.length).padStart(2, "0");
  const tag54New = "54" + amountLen + amountStr;

  let rebuilt = "";
  let tag54Inserted = false;

  for (const t of tlvs) {
    // Skip tag 54 lama (kalau ada)
    if (t.tag === "54") continue;

    // Skip tag 63 lama (kalau ada di TLV — biasanya gak ke-parse karena CRC)
    if (t.tag === "63") continue;

    // Sisipkan tag 54 baru sebelum tag 53
    if (t.tag === "53" && !tag54Inserted) {
      rebuilt += tag54New;
      tag54Inserted = true;
    }

    if (t.tag === "01") {
      // Ganti tag 01 jadi dinamis
      rebuilt += "010212";
    } else {
      rebuilt += t.tag + String(t.len).padStart(2, "0") + t.value;
    }
  }

  if (!tag54Inserted) {
    throw new Error("Tag 53 tidak ditemukan.");
  }

  // 6. Tambahkan tag 63 + hitung CRC baru.
  //    Tag 63 = CRC, length = 04, value = 4 char CRC.
  //    CRC dihitung dari SELURUH string TERMASUK "6304".
  const withTag63 = rebuilt + "6304";
  const crc = crc16ccitt(withTag63);
  return withTag63 + crc;
}

module.exports = { crc16ccitt, parseTLV, buildDynamicQris };

