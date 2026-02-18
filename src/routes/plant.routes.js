import express from "express";
// import fetch from "node-fetch";
import { executeQuery } from "../config/executeQuery.js";
// import crypto from "crypto";
// import { sendOTPEmail } from "../utils/emailService.js";
const router = express.Router();    

const makeApiRequest = async (url, method = 'GET', data = null) => {
    try {
        const config = {
            method: method,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };

        if (data && method.toUpperCase() === 'POST') {
            config.body = data;
        }

        const response = await fetch(url, config);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();

        return {
            success: true,
            data: responseData,
            status: response.status,
            url: url
        };
    } catch (error) {

        return {
            success: false,
            error: error.message,
            status: error.status || 500,
            url: url
        };
    }
};



router.get('/combined-data', async (req, res) => {
    try {
        // Create all API requests as promises
        const promises = [
            // 2. Inverter model list
            makeApiRequest(
                'http://eastmanone.com/eastmen_api/InverterModelList_v1.php',
                'POST',
                'InverterName=GTI'
            ),

            // 3. Installation type
            makeApiRequest(
                'http://eastmanone.com/eastmen_api/Installation_type_v1.php',
                'POST'
            ),

            // 4. System type
            makeApiRequest(
                'http://eastmanone.com/eastmen_api/system_type_v2.php',
                'POST',
                'ProductType=GTI'
            )
        ];

        // Execute all requests concurrently
        const results = await Promise.all(promises);
        console.log('res', results);
        // Format the response
        const response = {
            success: true,
            timestamp: new Date().toISOString(),
            data: {
                //   inverterList: results[0]['data'],
                inverterModelList: results[0],
                installationType: results[1],
                systemType: results[2]
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Error in combined API endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});



router.post('/createPlant', async (req, res) => {
    let connection;
    try {
        console.log('Creating plant with data:', req.body);
        let {
            Product, ModelOfProduct, NameOfPlant, TimeZone, InstallationType,
            SystemType, InstalledCapacityKwp, OperatingDate, Currency,
            UnitCostInrKwh, TotalCostInr, RegisterByType, RegisterByID,
            CustomerID, LoggerId, Address // New required fields
        } = req.body;

        console.log('Received data:', {
            Product, ModelOfProduct, NameOfPlant, TimeZone, InstallationType,
            SystemType, InstalledCapacityKwp, OperatingDate, Currency,
            UnitCostInrKwh, TotalCostInr, RegisterByType, RegisterByID,
            CustomerID, LoggerId, Address
        });

        // Validate all required fields including new ones
        if (!Product || !ModelOfProduct || !NameOfPlant || !RegisterByType || !RegisterByID ||
            !CustomerID || !LoggerId || !Address) {
            throw new Error('Missing required fields. CustomerID, LoggerId, and Address  are required.');
        }

        // Check for duplicate plant name
        const checkNameQuery = `SELECT 1 FROM EastmenProduct WHERE ProductName = @NameOfPlant;`;
        const existingNameResult = await executeQuery(checkNameQuery, { NameOfPlant });
        if (existingNameResult && existingNameResult.length > 0) {
            throw new Error('DUPLICATE_NAME');
        }
         const checkDuplicateLoggerQuery = `SELECT 1 FROM EastmenIotRegister WHERE IMEI = @LoggerId;`;
        const existingLoggerResult = await executeQuery(checkDuplicateLoggerQuery, { LoggerId });
        if (existingLoggerResult && existingLoggerResult.length > 0) {
            throw new Error('DUPLICATE_LOGGER');
        }

        // Begin transaction (if supported by your database)
        // For SQL Server, you might want to use transaction

        // Step 1: Insert into EastmenProduct table
        const createPlantQuery = `
            INSERT INTO EastmenProduct (
                ProductType, InverterModel, ProductName, InstallationType, 
                systemType, InstalltionCapacity, OperatingDate, UnitPrice, 
                TotalCost, RegisterByType, RegisterByID, sequence, InvertName,Address,
                RmuStatus, LoggerStatus, MerchantID, CustomerID, AuthorisedMerchant, AuthorisedType
            )
            VALUES (
                @Product, @ModelOfProduct, @NameOfPlant, @InstallationType, 
                @SystemType, @InstalledCapacityKwp, @OperatingDate, @UnitCostInrKwh, 
                @TotalCostInr, @RegisterByType, @RegisterByID, 'default', 'GTI', @Address,
                'offline', 'offline', @RegisterByID, @CustomerID,1, 'admin'
            );
            SELECT SCOPE_IDENTITY() AS PlantID;  -- Get the newly created PlantID
        `;

        const queryParams = {
            Product,
            ModelOfProduct,
            NameOfPlant,
            InstalledCapacityKwp,
            SystemType,
            TimeZone,
            InstallationType,
            OperatingDate,
            Currency,
            UnitCostInrKwh,
            TotalCostInr,
            RegisterByType,
            RegisterByID,
            CustomerID,
            LoggerId,
            Address
        };

        const plantResult = await executeQuery(createPlantQuery, queryParams);
        const plantId = plantResult[0].PlantID;

        // Step 2: Insert into EastmenIotRegister table
        const insertIotQuery = `
            INSERT INTO EastmenIotRegister (
                CustomerProductID, IMEI, SerialNo, CreatedOn, Type, phase, 
                lat, long, address
            )
            VALUES (
                @PlantID, @LoggerId, @LoggerId, GETDATE(), @Product, 
                @ModelOfProduct, NULL, NULL, NULL
            );
        `;

        const iotParams = {
            PlantID: plantId,
            LoggerId: LoggerId,
            CustomerID: CustomerID,
            Product,
            ModelOfProduct,

        };

        await executeQuery(insertIotQuery, iotParams);

        // If we reach here, both inserts were successful
        res.status(200).json({
            success: true,
            created: true,
            message: 'Plant created successfully',
            plantId: plantId
        });

    } catch (e) {
        console.log('Error:', e);
        let errorMessage = 'Failed to process request due to a server error.';
        let status = 500;

        // Custom error handling based on specific error messages thrown
        if (e.message === 'DUPLICATE_NAME') {
            errorMessage = 'The Plant Name is already taken. Please choose a unique name.';
            status = 409; // HTTP Conflict status
        } else if (e.message.includes('Missing')) {
            errorMessage = e.message;
            status = 400; // Bad Request
        } else if (e.message === 'DUPLICATE_LOGGER') {
            errorMessage = 'The Logger ID (IMEI) is already registered. Please use a different Logger ID.';
            status = 409; // HTTP Conflict status
        }

        // Send a descriptive error response back to the client
        res.status(status).send({
            created: false,
            success: false,
            message: errorMessage,
            error: e.message
        });
    }
});



router.get('/details/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const plantInfo = await executeQuery('SELECT * FROM EastmenProduct WHERE ID = @id', { ID: id });
        if (!plantInfo) {
            return res.status(404).send({ message: 'Plant not found.' });
        }
        console.log('plantInfo', plantInfo);
        res.json(plantInfo);
    } catch (err) {
        res.status(500).send({ message: 'Failed to fetch plant', error: err.message });
    }
});


export default router;
