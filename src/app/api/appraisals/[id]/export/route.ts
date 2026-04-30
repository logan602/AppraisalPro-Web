import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

function verifyToken(req: Request) {
  // Accept token from Authorization header OR query param (for window.open links)
  const { searchParams } = new URL(req.url);
  const qToken = searchParams.get('token');
  const authHeader = req.headers.get('authorization');
  const rawToken = qToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
  if (!rawToken) return null;
  try { return jwt.verify(rawToken, JWT_SECRET) as any; } catch { return null; }
}

function safeJson(str: any, fallback: any = []): any {
  if (str === null || str === undefined) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

function shoelace(pts: {x: number, y: number}[]): number {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function formatValue(key: string, val: any): string {
  if (key === 'unitBreakdown' && Array.isArray(val)) {
    if (val.length === 0) return 'None';
    return `<table style="width:100%;border-collapse:collapse;margin-top:5px;font-size:0.9em;border:1px solid #eee;">
      <tr style="background-color:#f9f9f9;"><th style="border:1px solid #eee;padding:5px;">BR</th><th style="border:1px solid #eee;padding:5px;">BA</th><th style="border:1px solid #eee;padding:5px;">Units</th></tr>
      ${val.map((u: any) => `<tr><td style="border:1px solid #eee;padding:5px;text-align:center;">${u.br||'0'}</td><td style="border:1px solid #eee;padding:5px;text-align:center;">${u.ba||'0'}</td><td style="border:1px solid #eee;padding:5px;text-align:center;">${u.count||'0'}</td></tr>`).join('')}
    </table>`;
  }
  if (Array.isArray(val)) return val.join(', ') || 'None';
  if (typeof val === 'object' && val !== null) return JSON.stringify(val);
  if (val === true || val === 'true') return 'Yes';
  if (val === false || val === 'false') return 'No';
  return String(val ?? '');
}

function generateNotesHTML(appraisal: any): string {
  const imp = appraisal.improvement?.data || {};
  const site = appraisal.siteDescription;

  const metered   = safeJson(imp.separatelyMetered, []);
  const utilities = safeJson(imp.utilities, []);
  const heating   = safeJson(imp.heating, []);
  const fireSafety = safeJson(imp.fireSafety, []);
  const floorCovering = safeJson(imp.floorCovering, []);
  const customAttr = safeJson(imp.customAttributes, {});
  const buildings: any[] = Array.isArray(customAttr.buildings) ? customAttr.buildings : [];

  let buildingsHtml = '';
  if (buildings.length > 0) {
    buildingsHtml = buildings.map((b: any, idx: number) => {
      const bFire  = Array.isArray(b.fireSafety)    ? b.fireSafety    : [];
      const bFloor = Array.isArray(b.floorCovering)  ? b.floorCovering : [];
      const bHeat  = Array.isArray(b.heating)        ? b.heating       : [];
      const bAttrs = b.customAttrs || {};

      let bSpecificHtml = '';
      if (Object.keys(bAttrs).length > 0) {
        const labelMap: Record<string,string> = {
          multiUserRestrooms: 'Multi-user Restrooms',
          singleUserRestrooms: 'Single-user Restrooms',
          kitchenetteBreakRooms: 'Kitchenette/Break Rooms',
          basementRecRoom: 'Basement Rec Room',
          basementBedrooms: 'Basement Bedrooms',
          basementBathrooms: 'Basement Bathrooms',
          basementOther: 'Basement Other',
        };
        bSpecificHtml = `<div style="margin-top:15px;margin-bottom:8px;font-weight:bold;color:#555;">Type Specific Details (${b.propertyType || ''})</div>`;
        bSpecificHtml += Object.entries(bAttrs).map(([k, v]) => {
          const label = labelMap[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          return `<div class="row"><div class="label">${label}</div><div class="value">${formatValue(k, v)}</div></div>`;
        }).join('');
      }

      return `<div class="section" style="background:#fbfdff;padding:15px;border:1px solid #d0dff5;border-radius:8px;margin-top:20px;">
        <h3 style="color:#4A89DC;margin-top:0;margin-bottom:15px;">Building ${idx + 1} &ndash; ${b.propertyType || 'Unknown Type'}</h3>
        <div class="row"><div class="label">Construction</div><div class="value">${b.construction||''}${b.construction==='Other'?` (${b.constructionOther||'Not specified'})`:''}}</div></div>
        <div class="row"><div class="label">Exterior</div><div class="value">${b.exterior||''}${b.exterior==='Other'?` (${b.exteriorOther||'Not specified'})`:''}}</div></div>
        <div class="row"><div class="label">Roof Type</div><div class="value">${b.roof||''}${b.roof==='Other'?` (${b.roofOther||'Not specified'})`:''}}</div></div>
        <div class="row"><div class="label">Roof Coverage</div><div class="value">${b.roofCover||''}${b.roofCover==='Other'?` (${b.roofCoverOther||'Not specified'})`:''}}</div></div>
        <div class="row"><div class="label">Floor Covering</div><div class="value">${bFloor.join(', ')||'None'}${b.floorCoveringOther?` (${b.floorCoveringOther})`:''}</div></div>
        <div class="row"><div class="label">Heating/Cooling</div><div class="value">${bHeat.join(', ')||'None'}${bHeat.includes('Other')?` (${b.heatingOther||'Not specified'})`:''}</div></div>
        <div class="row"><div class="label">Fire Safety</div><div class="value">${bFire.join(', ')||'None'}</div></div>
        <div class="row"><div class="label">Foundation Type</div><div class="value">${b.foundationType||''}</div></div>
        ${(b.foundationType==='Full Basement'||b.foundationType==='Partial Basement') ? `
          <div class="row"><div class="label">Basement Finished</div><div class="value">${b.foundationFinished||'No'}</div></div>
          <div class="row"><div class="label">Walk Out</div><div class="value">${b.foundationWalkout||'No'}</div></div>
        ` : ''}
        <div class="row"><div class="label">Foundation Construction</div><div class="value">${b.foundationConstruction||''}</div></div>
        <div class="row"><div class="label">Additional Notes</div><div class="value">${b.additionalNotes||''}</div></div>
        ${bSpecificHtml}
      </div>`;
    }).join('');
  } else {
    // Legacy flat format
    buildingsHtml = `
      <div class="row"><div class="label">Construction</div><div class="value">${imp.buildingConstruction||''}${imp.buildingConstruction==='Other'?` (${imp.buildingConstructionOther||'Not specified'})`:''}</div></div>
      <div class="row"><div class="label">Exterior</div><div class="value">${imp.buildingExterior||''}${imp.buildingExterior==='Other'?` (${imp.buildingExteriorOther||'Not specified'})`:''}</div></div>
      <div class="row"><div class="label">Roof Type</div><div class="value">${imp.roofType||''}${imp.roofType==='Other'?` (${imp.roofTypeOther||'Not specified'})`:''}</div></div>
      <div class="row"><div class="label">Roof Coverage</div><div class="value">${imp.roofCover||''}${imp.roofCover==='Other'?` (${imp.roofCoverOther||'Not specified'})`:''}</div></div>
      <div class="row"><div class="label">Floor Covering</div><div class="value">${floorCovering.join(', ')||'None'}${imp.floorCoveringOther?` (${imp.floorCoveringOther})`:''}</div></div>
      <div class="row"><div class="label">Heating/Cooling</div><div class="value">${heating.join(', ')||'None'}${heating.includes('Other')?` (${imp.heatingOther||'Not specified'})`:''}</div></div>
      <div class="row"><div class="label">Fire Safety</div><div class="value">${fireSafety.join(', ')||'None'}</div></div>
      <div class="row"><div class="label">Foundation Type</div><div class="value">${imp.foundationType||''}</div></div>
      ${(imp.foundationType==='Full Basement'||imp.foundationType==='Partial Basement') ? `
        <div class="row"><div class="label">Basement Finished</div><div class="value">${imp.foundationFinished||'No'}</div></div>
        <div class="row"><div class="label">Walk Out</div><div class="value">${imp.foundationWalkout||'No'}</div></div>
      ` : ''}
      <div class="row"><div class="label">Foundation Construction</div><div class="value">${imp.foundationConstruction||''}</div></div>
      <div class="row"><div class="label">Additional Notes</div><div class="value">${imp.additionalNotes||''}</div></div>
    `;
  }

  const inspDate = appraisal.inspectionDate ? new Date(appraisal.inspectionDate).toLocaleDateString() : '';

  return `<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body { font-family: Helvetica, sans-serif; padding: 40px; color: #333; }
    h1 { color: #1a1f3c; border-bottom: 2px solid #f39c12; padding-bottom: 10px; }
    h2 { color: #2c3e50; border-bottom: 1px solid #eee; margin-top: 30px; padding-bottom: 5px; }
    .row { display: flex; margin-bottom: 10px; border-bottom: 1px solid #fafafa; padding-bottom: 5px; }
    .label { font-weight: bold; width: 200px; color: #7f8c8d; }
    .value { flex: 1; }
    .section { margin-bottom: 20px; }
    th { text-align: center; color: #7f8c8d; font-weight: bold; }
  </style></head><body>
    <h1>Inspection Notes</h1>
    <div class="section">
      <h2>Subject Property</h2>
      <div class="row"><div class="label">Address</div><div class="value">${appraisal.propertyAddress||''}</div></div>
      <div class="row"><div class="label">City/State</div><div class="value">${appraisal.city||''}, ${appraisal.state||''}</div></div>
      <div class="row"><div class="label">Inspection Date</div><div class="value">${inspDate}</div></div>
      <div class="row"><div class="label">Property Type</div><div class="value">${imp.propertyType||''}</div></div>
      <div class="row"><div class="label">Tenancy</div><div class="value">${imp.tenancy||''}</div></div>
      ${imp.numUnits ? `<div class="row"><div class="label">Num Units</div><div class="value">${imp.numUnits}</div></div>` : ''}
      <div class="row"><div class="label">Separately Metered Utilities</div><div class="value">${metered.join(', ')||'None'}</div></div>
    </div>
    <div class="section">
      <h2>Improvements Description</h2>
      <div class="row"><div class="label">Utilities</div><div class="value">${utilities.join(', ')||'None'}</div></div>
      ${buildingsHtml}
    </div>
    <div class="section">
      <h2>Site Description</h2>
      <div class="row"><div class="label">Topography</div><div class="value">${site?.topography||''}</div></div>
      <div class="row"><div class="label">Grade</div><div class="value">${site?.grade||''}</div></div>
      <div class="row"><div class="label">Corner Lot</div><div class="value">${site?.cornerLot ? 'Yes' : 'No'}</div></div>
      <div class="row" style="margin-top:15px;"><div class="label">On-site Parking</div><div class="value">${imp.onSiteParking==='true'?'Yes':'No'}</div></div>
      ${imp.onSiteParking==='true' ? `
        <div class="row"><div class="label">Surface Spaces</div><div class="value">${imp.parkingSurfaceSpaces||'0'}</div></div>
        <div class="row"><div class="label">Garage Spaces</div><div class="value">${imp.parkingGarageSpaces||'0'}</div></div>
        <div class="row"><div class="label">Surface Type</div><div class="value">${imp.parkingSurfaceType||'None'}</div></div>
      ` : ''}
    </div>
  </body></html>`;
}

function generateSketchHTML(sketchData: string): string {
  let shapes: any[] = [];
  try {
    const parsed = JSON.parse(sketchData);
    shapes = parsed.shapes || [];
  } catch { return '<html><body>Invalid sketch data</body></html>'; }

  if (shapes.length === 0) return '<html><body>No shapes in sketch.</body></html>';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shapes.forEach((s: any) => {
    if (!s.points) return;
    s.points.forEach((p: any) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
  });
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

  const padding = 50;
  const width  = (maxX - minX) || 100;
  const height = (maxY - minY) || 100;
  const viewBox = `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;

  const scaleFactor      = Math.max(width, height) / 500;
  const dimensionFontSize = Math.max(8, 12 * scaleFactor);
  const labelFontSize     = Math.max(10, 16 * scaleFactor);
  const strokeWidth       = Math.max(1, 2 * scaleFactor);

  let totalArea = 0;
  const areaRows = shapes.map((s: any, idx: number) => {
    const area    = shoelace(s.points || []);
    const sqft    = (area / 400).toFixed(0);
    const finalSqFt = parseFloat(sqft) * (s.multiplier || 1.0);
    totalArea += finalSqFt;
    return `<tr><td>${s.label || `Area ${idx + 1}`}</td><td>${s.multiplier || 1.0}x</td><td>${finalSqFt.toLocaleString()} sq ft</td></tr>`;
  }).join('');

  const svgContent = shapes.map((s: any) => {
    if (!s.points || s.points.length === 0) return '';
    const pStr = s.points.map((p: any) => `${p.x},${p.y}`).join(' ');
    const fill = s.color || '#2980b9';
    const cx = s.points.reduce((sum: number, p: any) => sum + p.x, 0) / s.points.length;
    const cy = s.points.reduce((sum: number, p: any) => sum + p.y, 0) / s.points.length;

    const walls = s.points.map((p: any, i: number) => {
      const a = p, b = s.points[(i + 1) % s.points.length];
      if (!s.closed && i === s.points.length - 1) return '';
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dist = Math.sqrt(Math.pow(b.x-a.x,2)+Math.pow(b.y-a.y,2)) / 20;
      return `<text x="${mx}" y="${my}" font-size="${dimensionFontSize}" fill="#333" text-anchor="middle" dominant-baseline="middle">${dist.toFixed(1)}'</text>`;
    }).join('');

    return `
      <polygon points="${pStr}" fill="${fill}" fill-opacity="0.15" stroke="${fill}" stroke-width="${strokeWidth}" />
      ${walls}
      <text x="${cx}" y="${cy}" font-size="${labelFontSize}" font-weight="bold" fill="${fill}" text-anchor="middle">${s.label || ''}</text>
    `;
  }).join('');

  return `<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body { font-family: Helvetica, sans-serif; padding: 40px; text-align: center; }
    h1 { color: #1a1f3c; margin-bottom: 30px; }
    .canvas-container { border: 1px solid #eee; padding: 20px; background: #fff; display: inline-block; width: 100%; box-sizing: border-box; }
    table { width: 100%; margin-top: 40px; border-collapse: collapse; text-align: left; }
    th, td { padding: 12px; border-bottom: 1px solid #eee; }
    th { background-color: #f8f9fa; color: #1a1f3c; }
    .total-row { font-weight: bold; font-size: 1.2em; border-top: 2px solid #1a1f3c; }
  </style></head><body>
    <h1>Property Sketch</h1>
    <div class="canvas-container">
      <svg viewBox="${viewBox}" width="100%" height="500" preserveAspectRatio="xMidYMid meet">
        ${svgContent}
      </svg>
    </div>
    <table>
      <thead><tr><th>Area Name</th><th>Multiplier</th><th>Calculated Area</th></tr></thead>
      <tbody>
        ${areaRows}
        <tr class="total-row"><td colspan="2">Total Area</td><td>${totalArea.toLocaleString()} sq ft</td></tr>
      </tbody>
    </table>
  </body></html>`;
}

function generatePhotosHTML(photos: any[]): string {
  if (!photos || photos.length === 0) return '<html><body>No photos available.</body></html>';

  const photoCards = photos.map((p) => `
    <div style="break-inside: avoid; margin-bottom: 30px; padding: 15px; border: 1px solid #eee; border-radius: 8px; background: #fff;">
      <img src="${p.url}" style="width: 100%; max-height: 400px; object-fit: contain; border-radius: 4px;" alt="${p.caption || 'Photo'}" />
      ${p.caption ? `<div style="margin-top: 10px; font-weight: bold; color: #333; text-align: center;">${p.caption}</div>` : ''}
      <div style="margin-top: 5px; font-size: 0.8em; color: #888; text-align: center;">
        ${p.timestamp ? new Date(p.timestamp).toLocaleString() : ''}
      </div>
    </div>
  `).join('');

  return `<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body { font-family: Helvetica, sans-serif; padding: 40px; background: #f9f9f9; }
    h1 { color: #1a1f3c; margin-bottom: 30px; text-align: center; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    @media print {
      body { background: white; padding: 0; }
      .gallery { display: block; }
    }
  </style></head><body>
    <h1>Inspection Photos</h1>
    <div class="gallery">
      ${photoCards}
    </div>
  </body></html>`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = verifyToken(req);
    if (!payload?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'notes'; // 'notes' | 'sketch'

    const appraisal = await prisma.appraisal.findFirst({
      where: { id, organizationId: payload.organizationId },
      include: { improvement: true, siteDescription: true, sketch: true, photos: true }
    });

    if (!appraisal) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let html = '';
    if (type === 'sketch') {
      if (!appraisal.sketch?.data) {
        return NextResponse.json({ error: 'No sketch data found' }, { status: 404 });
      }
      html = generateSketchHTML(appraisal.sketch.data);
    } else if (type === 'photos') {
      html = generatePhotosHTML(appraisal.photos || []);
    } else {
      html = generateNotesHTML(appraisal);
    }

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed', message: error.message }, { status: 500 });
  }
}
