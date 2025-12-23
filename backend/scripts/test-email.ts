import { getTransporter, testSmtpConnection, sendEmail } from '../src/lib/email';
import { config } from '../src/config';
import prisma from '../src/lib/prisma';

async function diagnoseEmail() {
    console.log('--- Starting Email Diagnosis ---');

    // 1. Check Configuration
    console.log('\n1. Checking Configuration...');
    console.log('Env SMTP Host:', config.smtp.host || '(not set)');
    console.log('Env SMTP User:', config.smtp.user || '(not set)');
    console.log('Env SMTP Port:', config.smtp.port);
    console.log('Env SMTP Secure:', config.smtp.secure);

    const dbSettings = await prisma.settings.findMany({
        where: {
            key: {
                in: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_from'],
            },
        },
    });

    if (dbSettings.length > 0) {
        console.log('Found Database Overrides:');
        dbSettings.forEach(s => console.log(` - ${s.key}: ${s.value}`));
    } else {
        console.log('No Database Overrides found.');
    }

    // 2. Test Connection
    console.log('\n2. Testing SMTP Connection...');
    try {
        const isConnected = await testSmtpConnection();
        if (isConnected) {
            console.log('✅ SMTP Connection Successful!');
        } else {
            console.error('❌ SMTP Connection Failed.');
        }
    } catch (error) {
        console.error('❌ Error testing connection:', error);
    }

    // 3. Attempt to Send Test Email (if user provided one, otherwise generic)
    // Since I don't have the user's specific email address readily available as an argument,
    // I will skip the actual send unless I hardcode a dummy or ask the user.
    // However, I can try to simply get the transporter which initializes the config.

    try {
        const transporter = await getTransporter();
        console.log('\n3. Transporter Verified:', !!transporter);
    } catch (error: any) {
        console.error('❌ Failed to initialize transporter:', error.message);
    }

    console.log('\n--- Diagnosis Complete ---');
    process.exit(0);
}

diagnoseEmail();
