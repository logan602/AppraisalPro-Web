import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "@/lib/s3";

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';
const BUCKET_NAME = process.env.SPACES_BUCKET || 'appraisalpro-bckt';

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

    // Generate pre-signed GET URLs for all photos in case the bucket is fully private
    if (appraisal.photos && appraisal.photos.length > 0) {
      for (const photo of appraisal.photos) {
        if (photo.s3Key) {
          try {
            const command = new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: photo.s3Key,
            });
            // Generate a URL valid for 60 minutes
            photo.url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          } catch (e) {
            console.error(`Failed to sign URL for photo ${photo.id}:`, e);
            // Fallback to original url if generation fails
          }
        }
      }
    }

    return NextResponse.json({ appraisal });
  } catch (error) {
    console.error('Fetch appraisal details error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
