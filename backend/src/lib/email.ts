import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import prisma from './prisma.js';

let transporter: nodemailer.Transporter | null = null;

export const getTransporter = async (): Promise<nodemailer.Transporter> => {
  if (transporter) return transporter;

  // Try to get SMTP config from database first
  const smtpSettings = await prisma.settings.findMany({
    where: {
      key: {
        in: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'],
      },
    },
  });

  const settings: Record<string, string> = {};
  smtpSettings.forEach((s: { key: string; value: string }) => {
    settings[s.key] = s.value;
  });

  transporter = nodemailer.createTransport({
    host: settings.smtp_host || config.smtp.host,
    port: parseInt(settings.smtp_port || String(config.smtp.port)),
    secure: (settings.smtp_secure || String(config.smtp.secure)) === 'true',
    auth: {
      user: settings.smtp_user || config.smtp.user,
      pass: settings.smtp_pass || config.smtp.pass,
    },
  });

  return transporter;
};

export const resetTransporter = () => {
  transporter = null;
};

export const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  const transport = await getTransporter();
  
  const smtpFrom = await prisma.settings.findUnique({ where: { key: 'smtp_from' } });
  const from = smtpFrom?.value || config.smtp.from;

  await transport.sendMail({
    from,
    to,
    subject,
    html,
  });
};

export const sendWelcomeEmail = async (to: string, name: string, verifyUrl: string): Promise<void> => {
  const template = await prisma.emailTemplate.findUnique({ where: { name: 'welcome' } });
  
  let subject = 'Welcome to CloudBox!';
  let body = `
    <h1>Welcome to CloudBox, ${name}!</h1>
    <p>Thank you for registering. Please verify your email by clicking the link below:</p>
    <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a>
    <p>If you didn't create this account, you can safely ignore this email.</p>
  `;

  if (template) {
    subject = template.subject.replace('{{name}}', name);
    body = template.body.replace('{{name}}', name).replace('{{verifyUrl}}', verifyUrl);
  }

  await sendEmail(to, subject, body);
};

export const sendResetPasswordEmail = async (to: string, name: string, resetUrl: string): Promise<void> => {
  const template = await prisma.emailTemplate.findUnique({ where: { name: 'reset_password' } });
  
  let subject = 'Reset Your CloudBox Password';
  let body = `
    <h1>Password Reset Request</h1>
    <p>Hi ${name},</p>
    <p>We received a request to reset your password. Click the link below to set a new password:</p>
    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;

  if (template) {
    subject = template.subject.replace('{{name}}', name);
    body = template.body.replace('{{name}}', name).replace('{{resetUrl}}', resetUrl);
  }

  await sendEmail(to, subject, body);
};

export const testSmtpConnection = async (): Promise<boolean> => {
  try {
    const transport = await getTransporter();
    await transport.verify();
    return true;
  } catch {
    return false;
  }
};
