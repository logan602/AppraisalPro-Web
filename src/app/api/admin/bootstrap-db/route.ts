import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
  try {
    console.log('Starting remote database bootstrap...');
    
    // Execute the prisma db push command directly on the server
    const output = execSync('npx prisma db push --accept-data-loss', {
      env: {
        ...process.env,
        // Ensure the internal engine uses the REAL_DATABASE_URL we set up
        DATABASE_URL: process.env.REAL_DATABASE_URL || process.env.DATABASE_URL
      },
      encoding: 'utf-8'
    });

    console.log('Bootstrap success:', output);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database schema synchronized successfully!',
      output: output.split('\n').filter(line => line.trim())
    });
  } catch (error: any) {
    console.error('Bootstrap failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stderr: error.stderr
    }, { status: 500 });
  }
}
