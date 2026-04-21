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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = verifyToken(req);
    if (!payload || !payload.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch the appraisal with all related sub-models
    const appraisal = await prisma.appraisal.findFirst({
      where: { 
        id: id,
        organizationId: payload.organizationId // Critical for multi-tenant isolation
      },
      include: {
        improvement: true,
        siteDescription: true,
        sketch: true,
        photos: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!appraisal) {
      return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 });
    }

    return NextResponse.json({ appraisal });
  } catch (error) {
    console.error('Fetch appraisal details error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
