import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

export async function POST(req: Request) {
  try {
    const { email, password, name, organizationName, planType } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create Organization + User in a single transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName || name || email,
          planType: planType === 'ENTERPRISE' ? 'ENTERPRISE' : 'INDIVIDUAL',
          billingCycle: planType === 'ENTERPRISE' ? 'ANNUAL' : 'MONTHLY',
          maxSeats: planType === 'ENTERPRISE' ? 3 : 1,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          role: 'ADMIN',
          organizationId: organization.id,
        },
      });

      return { organization, user };
    });

    // Create JWT
    const token = jwt.sign(
      { userId: result.user.id, email: result.user.email, organizationId: result.organization.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return NextResponse.json(
      {
        message: 'Account created successfully',
        token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          organizationId: result.organization.id,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
