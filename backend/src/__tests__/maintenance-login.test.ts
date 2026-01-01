import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import authRoutes from '../routes/auth.js';
import { invalidateMaintenanceCache } from '../middleware/maintenance.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Maintenance Mode - Admin Login', () => {
  const adminPassword = 'AdminPassword123!';
  const userPassword = 'UserPassword123!';
  const adminEmail = `maintenance-admin-${randomUUID()}@cloudbox.test`;
  const userEmail = `maintenance-user-${randomUUID()}@cloudbox.test`;

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: await bcrypt.hash(adminPassword, 12),
        name: 'Maintenance Admin',
        role: 'ADMIN',
        storageQuota: BigInt(5368709120),
      },
    });

    await prisma.user.create({
      data: {
        email: userEmail,
        password: await bcrypt.hash(userPassword, 12),
        name: 'Maintenance User',
        role: 'USER',
        storageQuota: BigInt(5368709120),
      },
    });
  });

  beforeEach(async () => {
    await prisma.settings.upsert({
      where: { key: 'maintenance_mode' },
      update: { value: 'true' },
      create: { key: 'maintenance_mode', value: 'true' },
    });
    invalidateMaintenanceCache();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, userEmail] } },
    });
    await prisma.settings.deleteMany({
      where: { key: 'maintenance_mode' },
    });
    invalidateMaintenanceCache();
  });

  it('blocks non-admin login during maintenance', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: userEmail,
      password: userPassword,
    });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      code: 'MAINTENANCE_MODE',
      maintenance: true,
    });
  });

  it('allows admin login during maintenance', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: adminEmail,
      password: adminPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user?.role).toBe('ADMIN');
  });
});

