import dotenv from "dotenv";
dotenv.config(); // ✅ MUST be first

import sql from "mssql";

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER, // MUST be string
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 20,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000,
  },
};

// 🔍 DEBUG LOG (temporary, remove later)
console.log("DB CONFIG CHECK:", {
  user: config.user,
  server: config.server,
  database: config.database,
});

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log("✅ MSSQL connected");
    return pool;
  })
  .catch(err => {
    console.error("❌ DB Connection Failed:", err);
    throw err;
  });

export { sql, poolPromise };
