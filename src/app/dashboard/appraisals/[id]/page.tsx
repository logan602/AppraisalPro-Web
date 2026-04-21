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
    if (token) {
      fetchAppraisal();
    }
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

  if (isLoading) return <div className={styles.container}>Loading appraisal details...</div>;
  if (!appraisal) return <div className={styles.container}>Appraisal not found.</div>;

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
        <button className="btn btn-primary">Export Report</button>
      </div>

      <nav className={styles.tabBar}>
        <div 
          className={`${styles.tab} ${activeTab === 'summary' ? styles.tabActive : ''}`} 
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </div>
        <div 
          className={`${styles.tab} ${activeTab === 'improvements' ? styles.tabActive : ''}`} 
          onClick={() => setActiveTab('improvements')}
        >
          Improvements
        </div>
        <div 
          className={`${styles.tab} ${activeTab === 'photos' ? styles.tabActive : ''}`} 
          onClick={() => setActiveTab('photos')}
        >
          Photos ({appraisal.photos?.length || 0})
        </div>
        <div 
          className={`${styles.tab} ${activeTab === 'sketch' ? styles.tabActive : ''}`} 
          onClick={() => setActiveTab('sketch')}
        >
          Sketch
        </div>
      </nav>

      <section className={styles.content}>
        {activeTab === 'summary' && (
          <div className={styles.infoGrid}>
            <div className={styles.infoCard + " glass-panel"}>
              <h3 className={styles.cardTitle}>Property Details</h3>
              <div className={styles.dataRow}>
                <span className={styles.label}>Address</span>
                <span className={styles.value}>{appraisal.propertyAddress}</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Status</span>
                <span className={styles.value} style={{textTransform: 'capitalize'}}>{appraisal.status}</span>
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
            </div>
          </div>
        )}

        {activeTab === 'improvements' && (
          <div className={styles.infoGrid}>
            <div className={styles.infoCard + " glass-panel"} style={{ gridColumn: '1 / -1' }}>
              <h3 className={styles.cardTitle}>Building Characteristics</h3>
              <div className={styles.infoGrid}>
                 {/* Map JSON data from appraisal.improvement.data here */}
                 {appraisal.improvement?.data ? (
                   Object.entries(appraisal.improvement.data).map(([key, val]) => (
                     <div key={key} className={styles.dataRow}>
                        <span className={styles.label} style={{textTransform: 'capitalize'}}>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className={styles.value}>{String(val)}</span>
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
             {appraisal.sketch?.data ? (
               <div className={styles.sketchContent}>
                  {/* Future: Render Canvas with appraisal.sketch.data */}
                  <p className={styles.value}>Sketch data synced. Rendering engine coming soon.</p>
               </div>
             ) : (
               <div className={styles.canvasPlaceholder}>No sketch data available.</div>
             )}
          </div>
        )}
      </section>
    </div>
  );
}
