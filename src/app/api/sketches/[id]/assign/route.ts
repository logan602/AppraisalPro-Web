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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = verifyToken(req);
    if (!payload || !payload.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { appraisalId } = await req.json();

    if (!appraisalId) {
      return NextResponse.json({ error: 'Appraisal ID is required' }, { status: 400 });
    }

    // 1. Ensure the appraisal belongs to the organization
    const appraisal = await prisma.appraisal.findFirst({
      where: { id: appraisalId, organizationId: payload.organizationId }
    });

    if (!appraisal) {
      return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 });
    }

    // 2. Assign the sketch
    // Note: Since appraisalId marked as @unique on Sketch, we must Ensure 
    // any existing sketch for this appraisal is handled (deleted or unlinked)
    await prisma.sketch.deleteMany({
      where: { appraisalId: appraisalId }
    });

    const updatedSketch = await prisma.sketch.update({
      where: { id: id, organizationId: payload.organizationId },
      data: {
        appraisalId: appraisalId,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ success: true, sketch: updatedSketch });
  } catch (error) {
    console.error('Assignment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
