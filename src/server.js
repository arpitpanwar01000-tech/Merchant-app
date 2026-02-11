import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { poolPromise } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js"

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Eastman MSSQL Backend Running 🚀");
});

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  await poolPromise; // ensure DB connects on boot
  console.log(`✅ Server running on port ${PORT}`);
});
