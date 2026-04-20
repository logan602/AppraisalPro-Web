import { NextResponse } from 'next/server';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "@/lib/s3";
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';
const BUCKET_NAME = process.env.SPACES_BUCKET || 'appraisalpro-bckt';

// Verify JWT and return payload
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
    if (!payload || !payload.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileName, contentType, appraisalId } = await req.json();

    if (!fileName || !appraisalId) {
      return NextResponse.json({ error: 'fileName and appraisalId are required' }, { status: 400 });
    }

    // path: organizations/{orgId}/appraisals/{appraisalId}/photos/{fileName}
    const key = `organizations/${payload.organizationId}/appraisals/${appraisalId}/photos/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'image/jpeg',
      ACL: 'public-read', // Allow public viewing of photos
    });

    // URL valid for 15 minutes
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    // The final public URL (DigitalOcean Spaces format)
    const publicUrl = `https://${BUCKET_NAME}.nyc3.digitaloceanspaces.com/${key}`;

    return NextResponse.json({
      uploadUrl: signedUrl,
      publicUrl: publicUrl,
      key: key
    });
  } catch (error) {
    console.error('Signed URL error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
