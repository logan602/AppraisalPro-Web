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

export async function POST(req: Request) {
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

    const { properties, improvements } = await req.json();

    const syncedProperties = [];

    // Simple upsert logic
    if (properties && Array.isArray(properties)) {
      for (const prop of properties) {
        // Map local SQLite properties back to Appraisal models in Prisma
        const appraisal = await prisma.appraisal.upsert({
          where: { remoteId: prop.id }, // Assuming we map mobile Property.id = Appraisal.remoteId
          update: {
            propertyAddress: prop.streetAddress, // simplified mapping
            status: 'draft',
            updatedAt: new Date(),
          },
          create: {
            organizationId: user.organizationId,
            createdByUserId: user.id,
            propertyAddress: prop.streetAddress,
            remoteId: prop.id,
          }
        });
        syncedProperties.push({ localId: prop.id, remoteId: appraisal.id });
      }
    }

    const syncedImprovements: { localId: string; remoteId: string }[] = [];
    // Currently we don't have Improvement model in Prisma, so we drop it.
    // In production we would add it, but for Phase 3 MVC we map the sync protocol.

    return NextResponse.json({ 
      success: true, 
      syncedProperties,
      syncedImprovements 
    });
  } catch (error) {
    console.error('Push sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
