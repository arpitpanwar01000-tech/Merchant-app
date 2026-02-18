import nodemailer from 'nodemailer';




export default async function sendOTPEmail(recipientEmail, otp) {
    try {
        // Create transporter with your SMTP configuration
        const transporter = nodemailer.createTransport({
            host: "smtp-mail.outlook.com",
            port: 587,
            secure: false, // true for 465, false for other ports (587)
            auth: {
                user: 'info@eastmanone.com',
                pass: 'Eastmen@123'
            },
            tls: {
                rejectUnauthorized: false,
                // ciphers: 'SSLv3'
            }
        });

        // Generate OTP
        
        // Email content
        const mailOptions = {
            from: {
                name: 'EastmanOne',
                address: 'info@eastmanone.com'
            },
            to: recipientEmail,
            subject: 'Your OTP Verification Code',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
                        .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .header { text-align: center; padding: 10px 0; }
                        .otp-code { font-size: 32px; font-weight: bold; text-align: center; color: #2c5aa0; margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; letter-spacing: 5px; }
                        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2>EastmanOne OTP Verification</h2>
                        </div>
                        <p>Hello,</p>
                        <p>Your One-Time Password (OTP) for verification is:</p>
                        <div class="otp-code">${otp}</div>
                        <p>This OTP is valid for 10 minutes. Please do not share this code with anyone.</p>
                        <p>If you didn't request this OTP, please ignore this email.</p>
                        <div class="footer">
                            <p>Best regards,<br>EastmanOne Team</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('OTP email sent: %s', info.messageId);
        
        return {
            success: true,
            messageId: info.messageId,
            otp: otp, // In production, you might want to hash this before storing
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // OTP expires in 10 minutes
        };
        
    } catch (error) {
        console.error('Error sending OTP email:', error);
        return {
            success: false,
            error: error.message
        };
    }
}



