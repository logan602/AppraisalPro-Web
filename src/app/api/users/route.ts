import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

function verifyToken(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch (e) {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const payload = verifyToken(req);
    if (!payload || !payload.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where: { organizationId: payload.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    const organization = await prisma.organization.findUnique({
      where: { id: payload.organizationId },
      select: { maxSeats: true }
    });

    return NextResponse.json({ users, maxSeats: organization?.maxSeats || 1 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = verifyToken(req);
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can add users' }, { status: 403 });
    }

    const { email, password, name } = await req.json();

    // 1. Check seat limit
    const org = await prisma.organization.findUnique({
      where: { id: payload.organizationId },
      include: { _count: { select: { users: true } } }
    });

    if (org && org._count.users >= org.maxSeats) {
      return NextResponse.json({ 
        error: 'Seat limit reached', 
        message: 'Upgrade your plan to add more seats.' 
      }, { status: 400 });
    }

    // 2. Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    // 3. Create user
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'MEMBER',
        organizationId: payload.organizationId
      }
    });

    return NextResponse.json({ 
      success: true, 
      user: { id: newUser.id, email: newUser.email, name: newUser.name } 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const payload = verifyToken(req);
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Placeholder for seat expansion (adds 1 seat manually for now)
    const org = await prisma.organization.update({
      where: { id: payload.organizationId },
      data: { maxSeats: { increment: 1 } }
    });

    return NextResponse.json({ success: true, maxSeats: org.maxSeats });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
