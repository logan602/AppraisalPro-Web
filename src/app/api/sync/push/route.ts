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

// Robust date parsing to prevent "Invalid Date" errors in Prisma
function safeParseDate(d: any) {
  if (!d || d === "" || d === "null" || d === "undefined") return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

export const maxDuration = 60; // Allow 1 minute for complex syncs
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // 0. Diagnostic Ping
    // If the mobile app sends an x-ping header, return the server status immediately
    if (req.headers.get('x-ping') === 'true') {
      return NextResponse.json({ status: 'live', timestamp: new Date().toISOString() });
    }

    const payload = verifyToken(req);
    if (!payload || !payload.userId || !payload.organizationId) {
      return NextResponse.json({ 
        error: 'Unauthorized', 
        code: '[PUSH_AUTH_FAIL]',
        message: 'Missing user or organization context' 
      }, { status: 401 });
    }

    // Attempt to parse body with a check for empty payload
    let body;
    try {
      body = await req.json();
    } catch (parseErr: any) {
      console.error('CRITICAL: Body parse failure:', parseErr);
      return NextResponse.json({ 
        error: 'MALFORMED_PAYLOAD', 
        code: '[PUSH_PARSE_FAIL]',
        message: parseErr.message 
      }, { status: 400 });
    }

    const { properties, improvements, photos, sketches, siteDescriptions } = body;

    // SCHEMA PRE-FLIGHT DIAGNOSTIC
    // Try a simple query to ensure the Appraisal schema is up-to-date with new columns
    try {
      await prisma.appraisal.findFirst({
        select: { inspectionDate: true, city: true, state: true, zipCode: true },
        where: { organizationId: payload.organizationId }
      });
    } catch (dbErr: any) {
      console.error('CRITICAL: Database schema mismatch detected:', dbErr);
      return NextResponse.json({
        error: 'Database schema mismatch',
        message: 'The production database is missing required columns (inspectionDate, city, state, or zipCode). Please run "npx prisma db push" on the server.',
        details: dbErr.message
      }, { status: 500 });
    }

    // 1. Sync Properties (Appraisals)
    const syncedProperties = [];
    if (properties && Array.isArray(properties)) {
      for (const prop of properties as any[]) {
        try {
          const appraisal = await prisma.appraisal.upsert({
            where: { remoteId: prop.id },
            update: {
              propertyAddress: prop.streetAddress,
              city: prop.city,
              state: prop.state,
              zipCode: prop.zipCode,
              inspectionDate: safeParseDate(prop.inspectionDate),
              status: 'draft',
              updatedAt: new Date(),
            },
            create: {
              organizationId: payload.organizationId,
              createdByUserId: payload.userId,
              propertyAddress: prop.streetAddress,
              city: prop.city,
              state: prop.state,
              zipCode: prop.zipCode,
              inspectionDate: safeParseDate(prop.inspectionDate),
              remoteId: prop.id,
            }
          });
          syncedProperties.push({ localId: prop.id, remoteId: appraisal.id });
        } catch (err) {
          console.error(`Failed to sync property ${prop.id}:`, err);
        }
      }
    }

    // 2. Sync Improvements
    const syncedImprovements = [];
    if (improvements && Array.isArray(improvements)) {
      for (const imp of improvements as any[]) {
        try {
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
        } catch (err) {
          console.error(`Failed to sync improvement for prop ${imp.propertyId}:`, err);
        }
      }
    }

    // 3. Sync Site Descriptions
    const syncedSiteDescriptions = [];
    if (siteDescriptions && Array.isArray(siteDescriptions)) {
      for (const sd of siteDescriptions as any[]) {
        try {
          const appraisal = await prisma.appraisal.findUnique({
            where: { remoteId: sd.propertyId }
          });

          if (appraisal) {
            const syncedSD = await prisma.siteDescription.upsert({
              where: { appraisalId: appraisal.id },
              update: {
                topography: sd.topography,
                grade: sd.grade,
                cornerLot: Boolean(sd.cornerLot),
              },
              create: {
                appraisalId: appraisal.id,
                topography: sd.topography,
                grade: sd.grade,
                cornerLot: Boolean(sd.cornerLot),
              }
            });
            syncedSiteDescriptions.push({ localId: sd.id, remoteId: syncedSD.id });
          }
        } catch (err) {
          console.error(`Failed to sync site description for prop ${sd.propertyId}:`, err);
        }
      }
    }

    // 4. Sync Photos
    const syncedPhotos = [];
    if (photos && Array.isArray(photos)) {
      for (const p of photos as any[]) {
        try {
          const appraisal = await prisma.appraisal.findUnique({
            where: { remoteId: p.propertyId }
          });

          if (appraisal) {
            let existingPhoto = null;
            if (p.remoteId) {
              existingPhoto = await prisma.photo.findUnique({ where: { id: p.remoteId } });
            } else {
              existingPhoto = await prisma.photo.findFirst({
                where: { 
                  appraisalId: appraisal.id,
                  fileName: p.fileName
                }
              });
            }

            const photoUpdate = {
              caption: p.caption,
              latitude: p.latitude,
              longitude: p.longitude,
              s3Key: p.s3Key,
              url: p.publicUrl,
              timestamp: safeParseDate(p.timestamp),
              updatedAt: new Date(),
            };

            const syncedPhoto = existingPhoto 
              ? await prisma.photo.update({
                  where: { id: existingPhoto.id },
                  data: photoUpdate
                })
              : await prisma.photo.create({
                  data: {
                    ...photoUpdate,
                    appraisalId: appraisal.id,
                    fileName: p.fileName,
                  }
                });

            syncedPhotos.push({ localId: p.id, remoteId: syncedPhoto.id });
          }
        } catch (err) {
          console.error(`Failed to sync photo ${p.fileName}:`, err);
        }
      }
    }

    // 5. Sync Sketches
    const syncedSketches = [];
    if (sketches && Array.isArray(sketches)) {
      for (const s of sketches as any[]) {
        try {
          const appraisal = await prisma.appraisal.findUnique({
            where: { remoteId: s.propertyId }
          });
          if (appraisal) {
            const syncedSketch = await prisma.sketch.upsert({
              where: { appraisalId: appraisal.id },
              update: { data: s.data },
              create: { 
                appraisalId: appraisal.id, 
                organizationId: payload.organizationId,
                data: s.data 
              }
            });
            syncedSketches.push({ localId: s.id, remoteId: syncedSketch.id });
          }
        } catch (err) {
          console.error(`Failed to sync sketch for prop ${s.propertyId}:`, err);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      syncedProperties,
      syncedImprovements,
      syncedSiteDescriptions,
      syncedPhotos,
      syncedSketches
    });
  } catch (error: any) {
    console.error('CRITICAL: Global Push sync error:', error);
    return NextResponse.json({ 
      error: 'SYNCHRONIZATION_CRASH', 
      code: '[PUSH_GLOBAL_SYNC_FAIL]',
      message: error.message,
    }, { status: 500 });
  }
}
