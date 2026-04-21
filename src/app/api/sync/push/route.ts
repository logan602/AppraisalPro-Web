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

export async function POST(req: Request) {
  try {
    const payload = verifyToken(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { properties, improvements, photos, sketches, siteDescriptions } = await req.json();

    // 1. Sync Properties (Appraisals)
    const syncedProperties = [];
    if (properties && Array.isArray(properties)) {
      for (const prop of properties as any[]) {
        const appraisal = await prisma.appraisal.upsert({
          where: { remoteId: prop.id },
          update: {
            propertyAddress: prop.streetAddress,
            status: 'draft', // or from prop if available
            updatedAt: new Date(),
          },
          create: {
            organizationId: payload.organizationId,
            createdByUserId: payload.userId,
            propertyAddress: prop.streetAddress,
            remoteId: prop.id,
          }
        });
        syncedProperties.push({ localId: prop.id, remoteId: appraisal.id });
      }
    }

    // 2. Sync Improvements
    const syncedImprovements = [];
    if (improvements && Array.isArray(improvements)) {
      for (const imp of improvements as any[]) {
        // Find appraisal by local propertyId mapping
        const appraisal = await prisma.appraisal.findUnique({
          where: { remoteId: imp.propertyId }
        });

        if (appraisal) {
          const syncedImp = await prisma.improvement.upsert({
            where: { appraisalId: appraisal.id },
            update: { data: imp, updatedAt: new Date() },
            create: { appraisalId: appraisal.id, data: imp }
          });
          syncedImprovements.push({ localId: imp.id, remoteId: syncedImp.id });
        }
      }
    }

    // 3. Sync Photos (Metadata only, files are already in S3)
    const syncedPhotos = [];
    if (photos && Array.isArray(photos)) {
      for (const p of photos as any[]) {
        const appraisal = await prisma.appraisal.findUnique({
          where: { remoteId: p.propertyId }
        });

        if (appraisal) {
          const syncedPhoto = await prisma.photo.upsert({
            where: { id: p.remoteId || 'new' }, // Photo usually has its own remote ID if already synced
            update: {
              caption: p.caption,
              latitude: p.latitude,
              longitude: p.longitude,
              updatedAt: new Date(),
            },
            create: {
              appraisalId: appraisal.id,
              fileName: p.fileName,
              s3Key: p.s3Key,
              url: p.publicUrl,
              caption: p.caption,
              latitude: p.latitude,
              longitude: p.longitude,
              timestamp: p.timestamp ? new Date(p.timestamp) : null,
            }
          });
          syncedPhotos.push({ localId: p.id, remoteId: syncedPhoto.id });
        }
      }
    }

    // 4. Sync Sketches
    const syncedSketches = [];
    if (sketches && Array.isArray(sketches)) {
      for (const s of sketches as any[]) {
        const appraisal = await prisma.appraisal.findUnique({
          where: { remoteId: s.propertyId }
        });
        if (appraisal) {
          const syncedSketch = await prisma.sketch.upsert({
            where: { appraisalId: appraisal.id },
            update: { data: s.data, updatedAt: new Date() },
            create: { appraisalId: appraisal.id, data: s.data }
          });
          syncedSketches.push({ localId: s.id, remoteId: syncedSketch.id });
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      syncedProperties,
      syncedImprovements,
      syncedPhotos,
      syncedSketches
    });
  } catch (error) {
    console.error('Push sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
