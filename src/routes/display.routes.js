import express from 'express'
import { executeQuery } from '../config/executeQuery.js'

const config = {
    EXTERNAL_API_URL2: 'http://eastmanone.com/eastmen_api/Getpowerlist_v4.php',
    EXTERNAL_BEARER_TOKEN: 'mySuperSecretToken123!@#11',
    EXTERNAL_API_URL_PLANT_INFO: 'http://eastmanone.com/eastmen_api/GetGenerationDataDashboardByMerchant.php'
}

const router = express.Router();

router.post('/fetch-device-dashboard-info', async (req, res) => {
    try {
        const { plantId } = req.body;
        if (!plantId) {
            return res.status(400).json({ success: "0", message: "IMEI (device_id) is required" });
        }
        const proxyBody = new URLSearchParams();
        proxyBody.append('plant_id', plantId);
        const externalResponse = await fetch(config.EXTERNAL_API_URL_PLANT_INFO, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: proxyBody, // Send the x-www-form-urlencoded data
        });
        if (!externalResponse.ok) {
            console.error(`External API error: ${externalResponse.status} ${externalResponse.statusText}`);
            return res.status(externalResponse.status).json({ success: "0", message: `External API error: ${externalResponse.statusText}` });
        }
        const data = await externalResponse.json();
        res.json(data);
    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.status(500).json({ success: "0", message: "Internal server error" });
    }
});

router.post('/fetch-graph-data', async (req, res) => {
    try {
        const { IMEI, activeType, FromDate, ToDate, plantId } = req.body;

        console.log("Incoming Body:", req.body);

        // ✅ Validation based on activeType
        if (!activeType || !plantId) {
            return res.status(400).json({
                success: "0",
                message: "activeType or PlantId is required"
            });
        }



        // ✅ Build x-www-form-urlencoded body
        const proxyBody = new URLSearchParams();


        proxyBody.append('CustomerProductID', plantId);

        // proxyBody.append('device_id', IMEI);
        if (FromDate) proxyBody.append('Date', FromDate);
        if (ToDate) proxyBody.append('ToDate', ToDate);


        // ✅ Append type only once
        proxyBody.append('type', activeType);

        console.log("Proxy Body:", proxyBody.toString());

        // ✅ External API call
        const externalResponse = await fetch(config.EXTERNAL_API_URL2, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${config.EXTERNAL_BEARER_TOKEN}`
            },
            body: proxyBody.toString()
        });

        if (!externalResponse.ok) {
            const errorText = await externalResponse.text();
            console.error("External API Error:", errorText);

            return res.status(externalResponse.status).json({
                success: "0",
                message: "External API error",
                error: errorText
            });
        }

        const data = await externalResponse.json();
        console.log("Proxy Response:", data);

        return res.json(data);

    } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({
            success: "0",
            message: "Internal server error"
        });
    }
});

export default router;
