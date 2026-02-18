import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { poolPromise } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js"
import merchantroutes from "./routes/merchant.routes.js"
import userroutes from "./routes/user.routes.js"
import plantroutes from "./routes/plant.routes.js"

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Eastman MSSQL Backend Running 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/merchant",merchantroutes)
app.use("/api/user",userroutes)
app.use("/api/plant",plantroutes)

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  await poolPromise; // ensure DB connects on boot
  console.log(`✅ Server running on port ${PORT}`);
});
