import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

// Middleware-like function to verify token
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
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Grab all appraisals for the organization (Tenant isolation)
    const appraisals = await prisma.appraisal.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null
      }
    });

    return NextResponse.json({ 
      success: true, 
      properties: appraisals 
    });
  } catch (error) {
    console.error('Pull sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
