import express from 'express'
import { executeQuery } from '../config/executeQuery.js'
import crypto from "crypto";
import sendOTPEmail from '../utils/Mail.js'

const router=express.Router()
router.get('/usersList', async (req, res) => {
    try {
        const { search = '' } = req.query;
        
        let query = 'SELECT TOP 50 * FROM EastmenCustomer';
        let params = {};
        console.log('search', search);

        if (search) {
            query = 'SELECT TOP 50 * FROM EastmenCustomer WHERE Email LIKE @searchTerm';
            params.searchTerm = `%${search}%`;
        }

        const users = await executeQuery(query, params);
        res.json(users);
    } catch (err) {
        res.status(500).send({ message: 'Failed to fetch users', error: err.message });
    }
});


router.post('/createUser', async (req, res) => {
    console.log("hit")
    try {
        let { CustomerName, CustomerEmail, CustomerMobile,
            isactive, Password, Address } = req.body;
        console.log("mail:",CustomerEmail)
        if (!CustomerName || !CustomerEmail || !CustomerMobile || isactive === undefined || !Password || !Address) {
            throw new Error('Missing parameters: Customer Name, Email, Mobile, Active status, Password or Address is required.');
        }
        let checkEmailQuery = `SELECT 1 FROM EastmenCustomer WHERE Email = @CustomerEmail;`;
        const existingEmailResult = await executeQuery(checkEmailQuery, { CustomerEmail });
        if (existingEmailResult && existingEmailResult.length > 0) {
            throw new Error('DUPLICATE_EMAIL');
        }
        let checkMobileQuery = `SELECT 1 FROM EastmenCustomer WHERE Mobile = @CustomerMobile;`;
        const existingMobileResult = await executeQuery(checkMobileQuery, { CustomerMobile });
        if (existingMobileResult && existingMobileResult.length > 0) {
            throw new Error('DUPLICATE_MOBILE');
        }
        let sendOTP = Math.floor(100000 + Math.random() * 900000).toString();
        await sendOTPEmail(CustomerEmail, sendOTP);
        Password = crypto.createHash('md5')
            .update(Password, 'utf8')
            .digest('hex');
        const createUserQuery = `
            INSERT INTO EastmenCustomer (CustomerName, Email, Mobile, Password, RegisterType, IsVerify, VerificationCode, Address)
            VALUES (@CustomerName, @CustomerEmail, @CustomerMobile, @Password, 'EMAIL', NULL, @sendOTP, @Address);
            SELECT SCOPE_IDENTITY() AS ID;
        `;
        const queryParams = {
            CustomerName,
            CustomerEmail,
            CustomerMobile,
            isactive,
            Password,
            sendOTP,
            Address
        };
        const insertResult = await executeQuery(createUserQuery, queryParams);
        const createdId = insertResult && insertResult[0] && (insertResult[0].ID || insertResult[0].id) ? (insertResult[0].ID || insertResult[0].id) : null;
        res.status(200).json({
            success: true,
            created: true,
            message: 'User created successfully',
            userId: createdId
        });
    } catch (e) {
        let errorMessage = 'Failed to create user due to a server error.';
        console.log("e",e);
        let status = 500;
        if (e.message.includes('Missing')) {
            errorMessage = e.message;
            status = 400; // Bad Request
        } else if (e.message === 'DUPLICATE_EMAIL' || e.message === 'DUPLICATE_MOBILE') {
            errorMessage = e.message === 'DUPLICATE_EMAIL' ? 'Email already registered.' : 'Mobile already registered.';
            status = 409;
        }
        res.status(status).json({
            success: false,
            message: errorMessage
        });
    }
});
router.post('/verifyOTP', async (req, res) => {
    try {
        console.log('sdsd');
        const { email, otp } = req.body;
        if (!email || !otp) {
            console.log('sd')
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required.'
            });
        }
        const getUserQuery = `
            SELECT ID, VerificationCode, IsVerify
            FROM EastmenCustomer 
            WHERE Email = @email;
        `;
        const userResult = await executeQuery(getUserQuery, { email });
        if (!userResult || userResult.length === 0) {
            // console.log('dfdfdf')
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }
        const user = userResult[0];
        console.log('user',user);
        if (user.IsVerify) {
            return res.status(400).json({
                success: false,
                message: 'User is already verified.'
            });
        }
        if (String(user.VerificationCode) !== String(otp)) {
            return res.status(400).json({
                success: false,
                message: `Invalid OTP`,
                verified: false
            });
        }
        const verifyUserQuery = `
            UPDATE EastmenCustomer 
            SET IsVerify = 1
            WHERE Email = @email;
        `;
        await executeQuery(verifyUserQuery, { email });
        res.status(200).json({
            success: true,
            message: 'OTP verified successfully. Your account is now active.',
            verified: true
        });
    } catch (error) {
        console.log('err',error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify OTP due to server error.'
        });
    }
});
router.post('/resendOTP', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required.'
            });
        }
        const getUserQuery = `
            SELECT ID, IsVerify
            FROM EastmenCustomer 
            WHERE Email = @email;
        `;
        const userResult = await executeQuery(getUserQuery, { email });
        if (!userResult || userResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }
        const user = userResult[0];
        if (user.IsVerify) {
            return res.status(400).json({
                success: false,
                message: 'User is already verified.'
            });
        }
        function generateOTP(length = 6) {
            const min = Math.pow(10, length - 1);
            const maxExclusive = Math.pow(10, length);
            return crypto.randomInt(min, maxExclusive).toString();
        }
        const newOTP = generateOTP();
        const otpCreatedAt = new Date();
        const emailResult = await sendOTPEmail(email, newOTP);
        if (!emailResult.success) {
            throw new Error('FAILED_TO_SEND_OTP');
        }
        const updateOTPQuery = `
            UPDATE EastmenCustomer 
            SET VerificationCode = @OTP
            WHERE Email = @email;
        `;
        await executeQuery(updateOTPQuery, {
            OTP: newOTP,
            email: email
        });
        res.status(200).json({
            success: true,
            message: 'New OTP sent successfully.',
            email: email
        });
    } catch (error) {
        console.error('Resend OTP error:', error);

        let errorMessage = 'Failed to resend OTP due to server error.';
        let status = 500;

        if (error.message === 'FAILED_TO_SEND_OTP') {
            errorMessage = 'Failed to send OTP. Please try again.';
        }

        res.status(status).json({
            success: false,
            message: errorMessage
        });
    }
});


router.post('/isverified', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,     
            message: 'Email is required.'
            });
        }
        const getUserQuery = `
            SELECT IsVerify
            FROM EastmenCustomer
            WHERE Email = @email;
        `;
        const userResult = await executeQuery(getUserQuery, { email });
        if (!userResult || userResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }
        const user = userResult[0];
        res.status(200).json({
            success: true,
            verified: user.IsVerify == 1
        });
    } catch (error) {
        console.log('Error in isverified:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check verification status.'
        });
    }
});

export default router;
