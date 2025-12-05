import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

// Security: Generate a random password for admin in development
const generateSecurePassword = (): string => {
  return randomBytes(16).toString('base64').replace(/[+/=]/g, '').slice(0, 20);
};

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Security: In production, require explicit admin credentials via environment variables
  // Never use hardcoded credentials in production
  if (isProduction) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminEmail || !adminPassword) {
      console.log('Production mode: Skipping admin seed. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to create admin.');
      // Skip admin creation in production without explicit credentials
    } else {
      // Validate password strength in production
      if (adminPassword.length < 12) {
        throw new Error('ADMIN_PASSWORD must be at least 12 characters in production');
      }
      
      const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
      });

      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 12);

        await prisma.user.create({
          data: {
            email: adminEmail,
            password: hashedPassword,
            name: 'Administrator',
            role: 'ADMIN',
            emailVerified: true,
            storageQuota: BigInt(10737418240), // 10GB
          },
        });

        console.log('Admin user created from environment variables');
        console.log('Email:', adminEmail);
        // Security: Never log passwords, even in production setup
      } else {
        console.log('Admin user already exists');
      }
    }
  } else {
    // Development mode: Generate random password for security
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cloudbox.local';
    const adminPassword = process.env.ADMIN_PASSWORD || generateSecurePassword();

    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      await prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: 'Administrator',
          role: 'ADMIN',
          emailVerified: true,
          storageQuota: BigInt(10737418240), // 10GB
        },
      });

      console.log('Development admin created:');
      console.log('Email:', adminEmail);
      if (!process.env.ADMIN_PASSWORD) {
        console.log('Password:', adminPassword);
        console.log('\n⚠️  This is a randomly generated password. Save it now or set ADMIN_PASSWORD env var.');
      }
    } else {
      console.log('Admin user already exists');
    }
  }

  // Create default email templates
  const templates = [
    {
      name: 'welcome',
      subject: 'Welcome to CloudBox, {{name}}!',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Welcome to CloudBox!</h1>
          <p>Hi {{name}},</p>
          <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
          <a href="{{verifyUrl}}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Verify Email</a>
          <p>If you didn't create this account, you can safely ignore this email.</p>
          <p>Best regards,<br>The CloudBox Team</p>
        </div>
      `,
    },
    {
      name: 'reset_password',
      subject: 'Reset Your CloudBox Password',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Password Reset Request</h1>
          <p>Hi {{name}},</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <a href="{{resetUrl}}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
          <p>Best regards,<br>The CloudBox Team</p>
        </div>
      `,
    },
  ];

  for (const template of templates) {
    const existing = await prisma.emailTemplate.findUnique({
      where: { name: template.name },
    });

    if (!existing) {
      await prisma.emailTemplate.create({
        data: {
          ...template,
          isDefault: true,
        },
      });
      console.log(`Created email template: ${template.name}`);
    }
  }

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
