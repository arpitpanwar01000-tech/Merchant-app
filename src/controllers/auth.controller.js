import { executeQuery } from "../config/executeQuery.js";
import { generateToken } from "../utils/jwt.js";
import crypto from "crypto";

/**
 * MD5 hash (legacy support)
 */
function generateMd5Hash(inputString) {
  return crypto
    .createHash("md5")
    .update(inputString, "utf8")
    .digest("hex");
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    // 🔐 hash password using MD5 (because DB uses MD5)
    const hashedPassword = generateMd5Hash(password);

    const users = await executeQuery(
      `
      SELECT
        ID,
        MerchantName,
        MerchantEmail,
        MerchantMobile,
        isactive
      FROM EastmenMechant
      WHERE MerchantEmail = @email
        AND Password = @hashedPassword
      `,
      {
        email,
        hashedPassword,
      }
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = users[0];

    if (!user.isactive) {
      return res.status(403).json({ message: "Account inactive" });
    }

    // ✅ Generate JWT
    const token = generateToken({
      id: user.ID,
      email: user.MerchantEmail,
    });

    res.json({
      token,
      user: {
        id: user.ID,
        name: user.MerchantName,
        email: user.MerchantEmail,
        mobile: user.MerchantMobile,
      },
    });

  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * AUTO LOGIN (/me)
 */
export const me = async (req, res) => {
  res.json({
    user: req.user,
  });
};
