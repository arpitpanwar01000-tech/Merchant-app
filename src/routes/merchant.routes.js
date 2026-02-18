import express from 'express'
import { executeQuery } from '../config/executeQuery.js';
import { authMiddleware } from '../middleware/auth.middleware.js';


const config = {

  EXTERNAL_API_URL_OVERVIEWINFO: 'http://eastmanone.com/eastmen_api/GetGenerationDataDashboardByMerchant.php',
  
}



const router =express.Router()

router.get('/:merchantId/users', async (req, res) => {
    const { merchantId } = req.params;
    console.log('MID for get merchant user', merchantId);
    const query = 'SELECT * FROM EastmenProduct WHERE MerchantID = @merchantId AND AuthorisedMerchant = 1';
    try {
        const users = await executeQuery(query, { merchantId: merchantId });
        res.json(users);
        console.log('users', users);
    } catch (err) {

        res.status(500).send({ message: 'Failed to fetch users for merchant', error: err.message });
    }
});


router.post('/fetch-device-dashboard', async (req, res) => {
    try {
        const { MerchantID } = req.body;
        // console.log("Incoming request:", req.body);

        if (!MerchantID) {
            return res.status(400).json({
                success: "0",
                message: "MerchantID is required"
            });
        }

        // Prepare x-www-form-urlencoded body
        const proxyBody = new URLSearchParams();
        proxyBody.append('merchant_id', MerchantID);

        // Send request to external API
        const externalResponse = await fetch(config.EXTERNAL_API_URL_OVERVIEWINFO, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: proxyBody
        });

        // Handle external API HTTP errors
        if (!externalResponse.ok) {
            const text = await externalResponse.text();
            return res.status(500).json({
                success: "0",
                message: `External API error: ${externalResponse.status}`,
                details: text
            });
        }

        // Parse JSON safely
        try {
            let externalData = await externalResponse.json();
            return res.json({
                success: "1",
                message: "Dashboard data fetched successfully",
                data: externalData
            });
            // console.log(externalData)
        } catch (err) {
            return res.status(500).json({
                success: "0",
                message: "Invalid JSON received from external API"
            });
        }

        // SUCCESS


    } catch (err) {
        console.error("Server error:", err);
        return res.status(500).json({
            success: "0",
            message: "Internal Server Error",
            error: err.message
        });
    }
});


export default router;
