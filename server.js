require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");
const qrisRoutes = require("./routes/qris");
const webhookRoutes = require("./routes/webhook");

const app = express();

app.use(cors());
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "QRIS Backend", time: new Date() });
});

app.use("/api/qris", qrisRoutes);
app.use("/api/webhook", webhookRoutes);

const PORT = process.env.PORT || 3000;

connectDB().catch(err => console.error("MongoDB error:", err.message));
module.exports = app;
