"use client";

import React, { useEffect, useState, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from './Detail.module.css';
import Link from 'next/link';

interface Photo {
  id: string;
  url: string;
  caption: string;
  timestamp: string;
}

interface Appraisal {
  id: string;
  propertyAddress: string;
  status: string;
  updatedAt: string;
  improvement: any;
  siteDescription: any;
  sketch: any;
  photos: Photo[];
}

export default function AppraisalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const [appraisal, setAppraisal] = useState<Appraisal | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'improvements' | 'photos' | 'sketch'>('summary');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) fetchAppraisal();
  }, [token, id]);

  const fetchAppraisal = async () => {
    try {
      const res = await fetch(`/api/appraisals/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAppraisal(data.appraisal);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = (type: 'notes' | 'sketch' | 'photos' | 'photos-zip') => {
    window.open(`/api/appraisals/${id}/export?type=${type}&token=${token}`, '_blank');
  };

  if (isLoading) return <div className={styles.container}>Loading appraisal details...</div>;
  if (!appraisal) return <div className={styles.container}>Appraisal not found.</div>;

  // Parse sketch for live preview
  let sketchShapes: any[] = [];
  if (appraisal.sketch?.data) {
    try { sketchShapes = JSON.parse(appraisal.sketch.data).shapes || []; } catch {}
  }

  // Compute sketch viewBox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  sketchShapes.forEach((s: any) => (s.points||[]).forEach((p: any) => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }));
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 200; maxY = 200; }
  const pad = 40;
  const sketchViewBox = `${minX-pad} ${minY-pad} ${(maxX-minX)+pad*2} ${(maxY-minY)+pad*2}`;
  const scaleFactor = Math.max((maxX-minX)||100, (maxY-minY)||100) / 500;
  const dimFontSize  = Math.max(8, 12 * scaleFactor);
  const lblFontSize  = Math.max(10, 16 * scaleFactor);
  const strokeW      = Math.max(1, 2 * scaleFactor);

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumb}>
        <Link href="/dashboard">Appraisals</Link>
        <span>/</span>
        <span>{appraisal.propertyAddress || appraisal.id}</span>
      </div>

      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className="gradient-text">{appraisal.propertyAddress || "Unnamed Inspection"}</h1>
          <p className={styles.subtitle}>ID: {appraisal.id} • Updated {new Date(appraisal.updatedAt).toLocaleString()}</p>
        </div>
        <div className={styles.exportGroup}>
          <button className="btn btn-secondary" onClick={() => handleExport('notes')}>📄 Export Notes</button>
          <button className="btn btn-primary"   onClick={() => handleExport('sketch')}>📐 Export Sketch</button>
          <button className="btn btn-primary"   onClick={() => handleExport('photos')} style={{ background: '#27ae60' }}>📄 Photos (PDF)</button>
          <button className="btn btn-primary"   onClick={() => handleExport('photos-zip')} style={{ background: '#e67e22' }}>🗂️ Photos (ZIP)</button>
        </div>
      </div>

      <nav className={styles.tabBar}>
        {(['summary','improvements','photos','sketch'] as const).map(tab => (
          <div
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'photos' ? `Photos (${appraisal.photos?.length || 0})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </div>
        ))}
      </nav>

      <section className={styles.content}>
        {activeTab === 'summary' && (
          <div className={styles.infoGrid}>
            <div className={styles.infoCard + " glass-panel"}>
              <h3 className={styles.cardTitle}>Property Details</h3>
              <div className={styles.dataRow}>
                <span className={styles.label}>Address</span>
                <span className={styles.value}>
                  {appraisal.propertyAddress}<br/>
                  {(appraisal as any).city && `${(appraisal as any).city}, `}{(appraisal as any).state} {(appraisal as any).zipCode}
                </span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Inspection Date</span>
                <span className={styles.value}>
                  {(appraisal as any).inspectionDate
                    ? new Date((appraisal as any).inspectionDate).toLocaleDateString()
                    : 'Not set'}
                </span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Property Type</span>
                <span className={styles.value}>{(appraisal as any).propertyType || 'N/A'}</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Tenancy</span>
                <span className={styles.value}>{(appraisal as any).tenancy || 'N/A'}</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Status</span>
                <span className={styles.value} style={{textTransform:'capitalize'}}>{appraisal.status}</span>
              </div>
            </div>

            <div className={styles.infoCard + " glass-panel"}>
              <h3 className={styles.cardTitle}>Site Description</h3>
              <div className={styles.dataRow}>
                <span className={styles.label}>Topography</span>
                <span className={styles.value}>{appraisal.siteDescription?.topography || 'N/A'}</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Grade</span>
                <span className={styles.value}>{appraisal.siteDescription?.grade || 'N/A'}</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Corner Lot</span>
                <span className={styles.value}>{appraisal.siteDescription?.cornerLot ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'improvements' && (
          <div className={styles.infoGrid}>
            <div className={styles.infoCard + " glass-panel"} style={{ gridColumn: '1 / -1' }}>
              <h3 className={styles.cardTitle}>Building Characteristics</h3>
              <div className={styles.infoGrid}>
                {appraisal.improvement?.data ? (
                  Object.entries(appraisal.improvement.data)
                    .filter(([key]) => !['id','propertyId','syncStatus','remoteId','updatedAt','deletedAt'].includes(key))
                    .map(([key, val]) => (
                      <div key={key} className={styles.dataRow}>
                        <span className={styles.label} style={{textTransform:'capitalize'}}>{key.replace(/([A-Z])/g,' $1').trim()}</span>
                        <span className={styles.value}>{val === null || val === undefined ? 'N/A' : String(val)}</span>
                      </div>
                    ))
                ) : (
                  <p className={styles.value}>No improvement data synced yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'photos' && (
          <div className={styles.photoGallery}>
            {appraisal.photos?.length > 0 ? (
              appraisal.photos.map((photo) => (
                <div key={photo.id} className={styles.photoWrapper + " glass-panel"}>
                  <img src={photo.url} alt={photo.caption} className={styles.photo} />
                  {photo.caption && <div className={styles.captionOverlay}>{photo.caption}</div>}
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>No photos uploaded.</div>
            )}
          </div>
        )}

        {activeTab === 'sketch' && (
          <div className={styles.sketchContainer + " glass-panel"}>
            {sketchShapes.length > 0 ? (
              <>
                <svg viewBox={sketchViewBox} width="100%" style={{maxHeight:500, background:'#fff', borderRadius:8}}>
                  {sketchShapes.map((s: any, i: number) => {
                    if (!s.points?.length) return null;
                    const pStr = s.points.map((p:any)=>`${p.x},${p.y}`).join(' ');
                    const fill = s.color || '#2980b9';
                    const cx = s.points.reduce((a:number,p:any)=>a+p.x,0)/s.points.length;
                    const cy = s.points.reduce((a:number,p:any)=>a+p.y,0)/s.points.length;
                    const sqft = ((Math.abs(s.points.reduce((a:number,p:any,j:number)=>{
                      const q=s.points[(j+1)%s.points.length];return a+p.x*q.y-q.x*p.y;
                    },0))/2)/400*(s.multiplier||1)).toFixed(0);
                    return (
                      <g key={i}>
                        <polygon points={pStr} fill={fill} fillOpacity={0.15} stroke={fill} strokeWidth={strokeW}/>
                        {s.points.map((p:any,j:number)=>{
                          if(!s.closed && j===s.points.length-1) return null;
                          const b=s.points[(j+1)%s.points.length];
                          const mx=(p.x+b.x)/2, my=(p.y+b.y)/2;
                          const dist=(Math.sqrt(Math.pow(b.x-p.x,2)+Math.pow(b.y-p.y,2))/20).toFixed(1);
                          return <text key={j} x={mx} y={my} fontSize={dimFontSize} fill="#333" textAnchor="middle" dominantBaseline="middle">{dist}&apos;</text>;
                        })}
                        <text x={cx} y={cy-lblFontSize} fontSize={lblFontSize} fontWeight="bold" fill={fill} textAnchor="middle">{s.label||`Area ${i+1}`}</text>
                        <text x={cx} y={cy+lblFontSize*0.5} fontSize={dimFontSize} fill={fill} textAnchor="middle">{Number(sqft).toLocaleString()} sq ft</text>
                      </g>
                    );
                  })}
                </svg>
                <div style={{marginTop:16}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
                    <thead><tr style={{background:'rgba(255,255,255,0.05)'}}>
                      <th style={{padding:'10px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Area</th>
                      <th style={{padding:'10px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Multiplier</th>
                      <th style={{padding:'10px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Sq Ft</th>
                    </tr></thead>
                    <tbody>
                      {sketchShapes.map((s:any,i:number)=>{
                        const area=Math.abs(s.points.reduce((a:number,p:any,j:number)=>{const q=s.points[(j+1)%s.points.length];return a+p.x*q.y-q.x*p.y;},0))/2;
                        const sqft=(area/400*(s.multiplier||1)).toFixed(0);
                        return <tr key={i}>
                          <td style={{padding:'10px',borderBottom:'1px solid var(--border)'}}>{s.label||`Area ${i+1}`}</td>
                          <td style={{padding:'10px',borderBottom:'1px solid var(--border)'}}>{s.multiplier||1.0}x</td>
                          <td style={{padding:'10px',borderBottom:'1px solid var(--border)'}}>{Number(sqft).toLocaleString()} sq ft</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className={styles.canvasPlaceholder}>No sketch data available.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
