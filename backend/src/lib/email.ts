import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import prisma from './prisma.js';
import { decryptSecret, isEncrypted } from './encryption.js';
import { logger } from './logger.js';

export interface EmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
  envelope: { from: string; to: string };
  durationMs: number;
}

export class EmailError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'EmailError';
    this.code = code;
  }
}

let transporter: nodemailer.Transporter | null = null;
let smtpConfigured = false;

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

  // Security: Decrypt SMTP password if it's encrypted
  let smtpPassword = settings.smtp_pass || config.smtp.pass;
  if (smtpPassword && isEncrypted(smtpPassword)) {
    smtpPassword = decryptSecret(smtpPassword);
  }

  const smtpUser = settings.smtp_user || config.smtp.user;
  const smtpHost = settings.smtp_host || config.smtp.host;

  // Check if SMTP is configured
  smtpConfigured = !!(smtpHost && smtpUser && smtpPassword);

  if (!smtpConfigured) {
    logger.warn('SMTP not configured - emails will be logged but not sent');
  }

  // Only configure auth if credentials are provided
  const authConfig = smtpUser && smtpPassword ? {
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  } : {};

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(settings.smtp_port || String(config.smtp.port)),
    secure: (settings.smtp_secure || String(config.smtp.secure)) === 'true',
    ...authConfig,
  });

  return transporter;
};

export const resetTransporter = () => {
  transporter = null;
  smtpConfigured = false;
};

export const sendEmail = async (to: string, subject: string, html: string): Promise<EmailSendResult> => {
  await getTransporter(); // Initialize to check if configured

  // Fetch From settings
  const fromSettings = await prisma.settings.findMany({
    where: { key: { in: ['smtp_from', 'smtp_from_name', 'smtp_from_email'] } },
  });
  const fromMap: Record<string, string> = {};
  fromSettings.forEach(s => { fromMap[s.key] = s.value; });

  // Build From: prefer smtp_from_name + smtp_from_email, fallback to smtp_from or config
  let from = fromMap['smtp_from'] || config.smtp.from;
  if (fromMap['smtp_from_name'] && fromMap['smtp_from_email']) {
    from = `"${fromMap['smtp_from_name'].replace(/"/g, '\\"')}" <${fromMap['smtp_from_email']}>`;
  }

  // Throw error if SMTP is not configured
  if (!smtpConfigured) {
    const error = new EmailError(
      'SMTP is not configured. Please configure SMTP settings in the admin panel.',
      'SMTP_NOT_CONFIGURED'
    );
    logger.warn('Email send failed - SMTP not configured', { to, subject, from });
    throw error;
  }

  const start = Date.now();
  try {
    const info = await transporter!.sendMail({
      from,
      to,
      subject,
      html,
    });

    const result: EmailSendResult = {
      messageId: info.messageId || '',
      accepted: (info.accepted || []) as string[],
      rejected: (info.rejected || []) as string[],
      response: info.response || '',
      envelope: { from, to },
      durationMs: Date.now() - start,
    };

    logger.info('Email sent successfully', {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response,
      envelope: result.envelope,
      durationMs: result.durationMs,
    });

    return result;
  } catch (error: any) {
    const durationMs = Date.now() - start;
    logger.error('Email send failed', {
      error: error.message,
      stack: error.stack,
      envelope: { from, to },
      subject,
      durationMs,
    });
    throw new EmailError(
      error.message || 'Failed to send email',
      'SMTP_SEND_FAILED'
    );
  }
};

// Helper function to replace all variables in a template
const replaceTemplateVariables = (
  text: string,
  systemValues: Record<string, string>,
  customVariables: Array<{ name: string; defaultValue: string }>
): string => {
  let result = text;

  // Replace custom variables first (they might override system defaults)
  for (const variable of customVariables) {
    const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
    result = result.replace(regex, systemValues[variable.name] || variable.defaultValue);
  }

  // Replace system variables
  for (const [key, value] of Object.entries(systemValues)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }

  return result;
};

export const sendWelcomeEmail = async (to: string, name: string, verifyUrl: string): Promise<void> => {
  const template = await prisma.emailTemplate.findUnique({
    where: { name: 'welcome' },
    include: { variables: true },
  });

  let subject = 'Welcome to CloudBox!';
  let body = `
    <h1>Welcome to CloudBox, ${name}!</h1>
    <p>Thank you for registering. Please verify your email by clicking the link below:</p>
    <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a>
    <p>If you didn't create this account, you can safely ignore this email.</p>
  `;

  if (template) {
    const systemValues: Record<string, string> = {
      name,
      email: to,
      verifyUrl,
      appName: 'CloudBox',
      appUrl: config.frontendUrl,
      date: new Date().toLocaleDateString('es-ES'),
    };

    subject = replaceTemplateVariables(template.subject, systemValues, template.variables);
    body = replaceTemplateVariables(template.body, systemValues, template.variables);
  }

  await sendEmail(to, subject, body);
};

export const sendResetPasswordEmail = async (to: string, name: string, resetUrl: string): Promise<void> => {
  const template = await prisma.emailTemplate.findUnique({
    where: { name: 'reset_password' },
    include: { variables: true },
  });

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
    const systemValues: Record<string, string> = {
      name,
      email: to,
      resetUrl,
      appName: 'CloudBox',
      appUrl: config.frontendUrl,
      date: new Date().toLocaleDateString('es-ES'),
    };

    subject = replaceTemplateVariables(template.subject, systemValues, template.variables);
    body = replaceTemplateVariables(template.body, systemValues, template.variables);
  }

  await sendEmail(to, subject, body);
};

export const testSmtpConnection = async (): Promise<{ connected: boolean; message: string }> => {
  try {
    const transport = await getTransporter();

    if (!smtpConfigured) {
      throw new EmailError(
        'SMTP is not configured. Please enter SMTP host, user, and password.',
        'SMTP_NOT_CONFIGURED'
      );
    }

    await transport.verify();
    return { connected: true, message: 'SMTP connection verified successfully' };
  } catch (error: any) {
    if (error instanceof EmailError) {
      throw error;
    }
    throw new EmailError(
      error.message || 'Failed to verify SMTP connection',
      'SMTP_VERIFY_FAILED'
    );
  }
};
