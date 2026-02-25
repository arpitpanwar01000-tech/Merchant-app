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


router.get('/filtered-plants', async (req, res) => {
    try {
        // 1. Get the filter text from the query parameters
        const filterText = req.query.filterText || '';
        console.log(`Received Filter Text: ${filterText}`);

        let baseQuery = `FROM EastmenProduct AS EP 
            INNER JOIN 
                EastmenIotRegister AS EIR ON EP.ID = EIR.CustomerProductID 
            INNER JOIN 
                EastmenCustomer AS EC ON EP.CustomerID = EC.ID
            LEFT JOIN EastmenMechant EM ON EP.MerchantID = EM.ID
                
            
        `;
        let whereClauses = [];
        let params = {};

        // 3. Construct the WHERE clause to search only IMEI OR CustomerEmail
        if (filterText) {
            const filterValueWithWildcards = `%${filterText}%`;
            whereClauses.push(`
                (
                    EIR.IMEI LIKE @filterText 
                    OR EC.Email LIKE @filterText 
                )
            `);
            params['filterText'] = filterValueWithWildcards;
        }

        let whereSql = '';
        if (whereClauses.length > 0) {
            whereSql = ' WHERE ' + whereClauses.join(' AND ');
        }

        const selectColumns = `
            SELECT 
                EP.*, 
                EIR.IMEI, 
                EC.Email as Email
        `;
        const dataQuery = `${selectColumns} ${baseQuery} ${whereSql}`;

        const products = await executeQuery(dataQuery, params);
        res.json({
            data: products,
            total: products.length,
        });

    } catch (err) {
        // console.error('Failed to fetch filtered products:', err);
        res.status(500).send({
            message: 'Failed to fetch products (Check SQL syntax and table/column names)',
            error: err.message
        });
    }
});



router.post('/authreq', async (req, res) => {
    console.log("hit")
    const { merchantId, AuthorisedType, id, directAuth = false } = req.body;
    console.log(merchantId, AuthorisedType, id, directAuth);
    try {

        if (directAuth) {
            const sqlQuery = `
            UPDATE EastmenProduct
            SET
            MerchantID = @merchantId,
            AuthorisedType = @AuthorisedType,
            AuthorisedMerchant = 1
            WHERE
            ID = @id;
            `;
            const params = {
                id: id,
                merchantId: merchantId,
                AuthorisedType: AuthorisedType,
                authorisedRequestBy: 'ADMIN' // Key now matches '@authorisedRequestBy'
            };
            await executeQuery(sqlQuery, params);
            res.status(200).send({ message: `Product with ID ${id} was updated successfully.` });
        } else {

            const sqlQuery = `
            UPDATE EastmenProduct
            SET
            MerchantID = @merchantId,
            AuthorisedType = @AuthorisedType,
            AuthorisedRequest = 1,
            AuthorisedRequestBY = @authorisedRequestBy, -- Corrected typo in column name if it exists in DB
            AuthorisedRequestDate = GETDATE()
            WHERE
            ID = @id;
            `;
            const params = {
                id: id,
                merchantId: merchantId,
                AuthorisedType: AuthorisedType,
                authorisedRequestBy: 'MERCHANT' // Key now matches '@authorisedRequestBy'
            };
            await executeQuery(sqlQuery, params);
            res.status(200).send({ message: `Product with ID ${id} was updated successfully.` });
        }
    } catch (err) {
        console.error('Database update error:', err);
        res.status(500).send({ message: 'Failed to update product', error: err.message });
    }
});



router.post('/devices/:macId/:type/LOG', async (req, res) => {
    const { macId, type } = req.params;
    console.log("macId:", macId, "type:", type)
    if (!macId || !type) {
        return res.status(400).json({ message: 'macId and type are required' });
    }

    try {
        const macIdInput = String(macId);
        const params = { macIdInput };

        let loggerData = [];

        if (type === 'GTI') {


            const loggerQuery = `
        SELECT TOP 1 *
        FROM EastmenGTILAlloggerData
        WHERE MAC = @macIdInput
      `;

            loggerData = await executeQuery(loggerQuery, params);
        } else if (type === 'NON_GTI') {



            const loggerQuery = `
        SELECT TOP 1 *
        FROM EastmenInverterLoggerData
        WHERE IMEI = @macIdInput
      `;

            loggerData = await executeQuery(loggerQuery, params);
        } else {
            return res.status(400).json({
                message: 'Invalid type. Use GTI or NON_GTI'
            });
        }

        return res.json({
              macId,
              type,
              loggerData
        });

    } catch (err) {
        console.error('Device API Error:', err);
        return res.status(500).json({
            message: 'Failed to fetch device data',
            error: err.message
        });
    }
});


router.post('/devices/:macId/:type/INV', async (req, res) => {
    const { macId, type } = req.params;
    console.log("macId:", macId, "type:", type)
    console.log("inverter hit")
    if (!macId || !type) {
        return res.status(400).json({ message: 'macId and type are required' });
    }

    try {
        const macIdInput = String(macId);
        const params = { macIdInput };

        let inverterData = [];

        if (type === 'GTI') {

            const inverterQuery = `
                SELECT TOP 1 *
                FROM EastmenAllGTIInverterData
                WHERE MAC = @macIdInput
                ORDER BY server_datetime DESC
              `;

            inverterData = await executeQuery(inverterQuery, params);

        } else if (type === 'NON_GTI') {

            const inverterQuery = `
                SELECT TOP 1 *
                FROM EastmenInverterData
                WHERE IMEI = @macIdInput
                ORDER BY server_datetime DESC
              `;
            inverterData = await executeQuery(inverterQuery, params);


        } else {
            return res.status(400).json({
                message: 'Invalid type. Use GTI or NON_GTI'
            });
        }

        return res.json({
            macId,
            type,
            inverterData,
        });

    } catch (err) {
        console.error('Device API Error:', err);
        return res.status(500).json({
            message: 'Failed to fetch device data',
            error: err.message
        });
    }
});

router.get('/fault/desc', async (req, res) => {
  try {
    const { id, phase } = req.query;
    console.log("idphase",id,phase)

    if (!id || !phase) {
      return res.status(400).json({
        success: false,
        message: "id and phase are required"
      });
    }

    const query = `
      SELECT *
      FROM GTIFaultMaster
      WHERE Faultid = @id AND phase = @phase
    `;

    const params = { id: String(id), phase:String(phase) };
    console.log("param",params)

    const result = await executeQuery(query, params);
    console.log("result,",result)

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Error fetching FaultMaster:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
