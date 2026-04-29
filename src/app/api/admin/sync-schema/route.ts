import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
  try {
    const output = execSync('npx prisma db push --accept-data-loss', {
      env: {
        ...process.env,
        DATABASE_URL: process.env.REAL_DATABASE_URL || process.env.DATABASE_URL
      },
      encoding: 'utf-8',
      timeout: 60000,
    });
    return NextResponse.json({ success: true, output });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
