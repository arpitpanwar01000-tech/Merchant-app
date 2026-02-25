import express from 'express';
import { executeQuery } from '../config/executeQuery.js';

const router = express.Router();

router.post('/IMEI', async (req, res) => {
  try {
    const { plantId } = req.body;

    if (!plantId) {
      return res.status(400).json({ message: "plantId is required" });
    }

    console.log('Plant ID:', plantId);

    const query = `
      SELECT eir.IMEI
      FROM EastmenProduct AS ep
      INNER JOIN EastmenIotRegister AS eir 
        ON ep.ID = eir.CustomerProductID
      WHERE ep.ID = @plantId;
    `;

    const plantInfo = await executeQuery(query, { plantId });

    res.json({
      success: true,
      data: plantInfo
    });

  } catch (err) {
    console.error("IMEI Route Error:", err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch IMEI',
      error: err.message
    });
  }
});

router.get('/faults/:plantIds', async (req, res) => {
  const { plantIds } = req.params;
  console.log('Received plantIds for faults:', plantIds);

  try {
    if (!plantIds) {
      return res.status(400).json({
        message: "Plant IDs are required"
      });
    }

    // Convert "337,754,15217" → [337, 754, 15217]
    const plantIdArray = plantIds
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id));

    if (plantIdArray.length === 0) {
      return res.status(400).json({
        message: "Invalid Plant IDs"
      });
    }

    // Create placeholders: @Plant0, @Plant1, @Plant2
    const placeholders = plantIdArray
      .map((_, index) => `@Plant${index}`)
      .join(',');

    const query = `
  SELECT * FROM (
    SELECT 
      EI.Fault, 
      ER.Description,
      MAX(EI.server_datetime) AS FaultDate,
      EIR.CustomerProductID AS PlantID,
      COUNT(*) AS FaultCount,
      ROW_NUMBER() OVER (
        PARTITION BY EIR.CustomerProductID 
        ORDER BY COUNT(*) DESC
      ) AS Rank
    FROM EastmenAllGTIInverterData AS EI
    INNER JOIN GTIFaultMaster AS ER 
      ON EI.FAULT = ER.Faultid AND EI.phase = ER.phase
    INNER JOIN EastmenIotRegister AS EIR 
      ON EIR.IMEI = EI.MAC
    INNER JOIN eastmenProduct AS EP 
      ON EP.ID = EIR.CustomerProductID
    WHERE EIR.CustomerProductID IN (${placeholders})
      AND EI.Fault <> '0'
    GROUP BY EI.Fault, ER.Description, EIR.CustomerProductID
  ) AS RankedFaults
  WHERE Rank <= 10
  ORDER BY PlantID, Rank
`;

    // Create parameters object
    const params = {};
    plantIdArray.forEach((id, index) => {
      params[`Plant${index}`] = id;
    });

    console.log('Executing query with params:', params);

    const faults = await executeQuery(query, params);

    console.log(`Fetched ${faults.length} faults for plantIds ${plantIds}`);

    res.json(faults);

  } catch (err) {
    console.error(`Failed to fetch faults for plantIds ${plantIds}:`, err);
    res.status(500).json({
      message: 'Failed to fetch faults for the plants.',
      error: err.message
    });
  }
});


router.get('/exampleInv', async (req, res) => {
    try {
        const {
            range,       // 'today' | 'week'
            mac,         // MAC or IMEI
            parameters   // optional: comma-separated columns
        } = req.query;

        if (!mac) {
            return res.status(400).json({
                success: false,
                message: 'MAC/IMEI address is required.'
            });
        }

        /* --------------------------------------------------
           IST TIME HELPERS (SAFE FOR SERVER & SQL)
        -------------------------------------------------- */



        // Format for SQL Server: YYYY-MM-DD HH:mm:ss


        /* --------------------------------------------------
           DATE RANGE CALCULATION
        -------------------------------------------------- */

        const endDate = new Date();
        endDate.setTime(endDate.getTime() + (5 * 60 + 30) * 60 * 1000);

        console.log("enddate", endDate)
        let startDate;

        const IST_OFFSET = 19800000;

        function getISTStartOfDay(date = new Date()) {
            const ist = new Date(date.getTime() + IST_OFFSET);
            ist.setHours(0, 0, 0, 0);
            return new Date(ist.getTime() - IST_OFFSET);
        }

        if (range === 'today') {
            startDate = getISTStartOfDay();
        } else if (range === 'week') {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid range. Use 'today' or 'week'"
            });
        }



        /* --------------------------------------------------
           QUERY BUILDER (PARAMETERIZED)
        -------------------------------------------------- */

        const buildQuery = (tableName, identifierField, selectedParams) => {
            let selectClause = '*';

            if (selectedParams) {
                const cols = selectedParams
                    .split(',')
                    .map(c => c.trim())
                    .join(', ');
                selectClause = `id, ${identifierField}, server_datetime, ${cols}`;
            }

            return `
        SELECT ${selectClause}
        FROM ${tableName}
        WHERE ${identifierField} = @mac
          AND server_datetime BETWEEN @startDate AND @endDate
        ORDER BY server_datetime ASC
      `;
        };

        const sqlParams = {
            mac,
            startDate: startDate,
            endDate: endDate
        };

        /* --------------------------------------------------
           EXECUTE BOTH QUERIES PARALLEL
        -------------------------------------------------- */

        const [gtiResult, nonGtiResult] = await Promise.all([
            executeQuery(
                buildQuery('EastmenAllGTIInverterData', 'MAC', parameters),
                sqlParams
            ).then(data => ({ type: 'gti', data }))
                .catch(err => ({ type: 'gti', data: [], error: err.message })),

            executeQuery(
                buildQuery('EastmenInverterData', 'IMEI', parameters),
                sqlParams
            ).then(data => ({ type: 'non-gti', data }))
                .catch(err => ({ type: 'non-gti', data: [], error: err.message }))
        ]);

        /* --------------------------------------------------
           DETERMINE FINAL DATA SOURCE
        -------------------------------------------------- */

        let finalResult = [];
        let inverterType = null;

        if (gtiResult.data.length && nonGtiResult.data.length) {
            const gtiLatest = new Date(gtiResult.data.at(-1).server_datetime);
            const nonGtiLatest = new Date(nonGtiResult.data.at(-1).server_datetime);

            if (gtiLatest > nonGtiLatest) {
                finalResult = gtiResult.data;
                inverterType = 'gti';
            } else {
                finalResult = nonGtiResult.data;
                inverterType = 'non-gti';
            }
        } else if (gtiResult.data.length) {
            finalResult = gtiResult.data;
            inverterType = 'gti';
        } else if (nonGtiResult.data.length) {
            finalResult = nonGtiResult.data;
            inverterType = 'non-gti';
        } else {
            return res.status(404).json({
                success: false,
                message: 'No data found for given MAC/IMEI',
                mac,
                range,
                startDate: startDate,
                endDate: endDate
            });
        }

        /* --------------------------------------------------
           RESPONSE
        -------------------------------------------------- */

        res.status(200).json({
            success: true,
            inverterType,
            mac,
            range,
            count: finalResult.length,
            startDate: startDate,
            endDate: endDate,
            data: finalResult.map(r => ({
                ...r,
                inverterType
            })),
            searchInfo: {
                gtiRecords: gtiResult.data.length,
                nonGtiRecords: nonGtiResult.data.length,
                gtiError: gtiResult.error,
                nonGtiError: nonGtiResult.error
            }
        });

    } catch (error) {
        console.error("exampleInv error:", error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});




export default router;
