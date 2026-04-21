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
    if (!payload || !payload.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all appraisals for the organization, including author and counts
    const appraisals = await prisma.appraisal.findMany({
      where: { 
        organizationId: payload.organizationId,
        deletedAt: null 
      },
      include: {
        createdByUser: {
          select: { name: true }
        },
        _count: {
          select: { photos: true }
        },
      },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({ appraisals });
  } catch (error) {
    console.error('Fetch appraisals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
