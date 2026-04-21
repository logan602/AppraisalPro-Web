import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

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

    // Fetch standalone sketches for the organization
    const sketches = await prisma.sketch.findMany({
      where: { 
        organizationId: payload.organizationId,
        appraisalId: null // Standalone only
      },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({ sketches });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = verifyToken(req);
    if (!payload || !payload.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, data } = await req.json();

    const sketch = await prisma.sketch.create({
      data: {
        name: name || 'Untitled Sketch',
        organizationId: payload.organizationId,
        data: typeof data === 'string' ? data : JSON.stringify(data),
      }
    });

    return NextResponse.json({ success: true, sketch });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
