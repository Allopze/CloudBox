import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create default admin user
  const adminEmail = 'admin@cloudbox.com';
  const adminPassword = 'admin123';

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

    console.log('Default admin created:');
    console.log('Email: admin@cloudbox.com');
    console.log('Password: admin123');
  } else {
    console.log('Admin user already exists');
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
