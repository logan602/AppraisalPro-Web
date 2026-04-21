"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from './Appraisals.module.css';
import Link from 'next/link';

interface Appraisal {
  id: string;
  propertyAddress: string;
  city?: string;
  state?: string;
  zipCode?: string;
  inspectionDate?: string;
  status: string;
  remoteId: string;
  updatedAt: string;
  createdAt: string;
  createdByUser?: {
    name: string;
  };
  _count: {
    photos: number;
  };
}

export default function AppraisalsPage() {
  const { token } = useAuth();
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      fetchAppraisals();
    }
  }, [token]);

  const fetchAppraisals = async () => {
    try {
      const res = await fetch('/api/appraisals', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setAppraisals(data.appraisals);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div className={styles.emptyState}>Loading appraisals...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <h1 className="gradient-text">Recent Appraisals</h1>
        <button className="btn btn-secondary">Filter</button>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard + " glass-panel"}>
          <span className={styles.statLabel}>Total Inspections</span>
          <span className={styles.statValue}>{appraisals.length}</span>
        </div>
        <div className={styles.statCard + " glass-panel"}>
          <span className={styles.statLabel}>Syncing Devices</span>
          <span className={styles.statValue}>1</span>
        </div>
        <div className={styles.statCard + " glass-panel"}>
          <span className={styles.statLabel}>Completed Reports</span>
          <span className={styles.statValue}>0</span>
        </div>
      </div>

      {appraisals.length === 0 ? (
        <div className={styles.emptyState + " glass-panel"}>
          <div className={styles.emptyIcon}>📂</div>
          <h2>No appraisals found</h2>
          <p>Start an inspection on your mobile app to see it here.</p>
        </div>
      ) : (
        <div className={styles.appraisalsGrid}>
          {appraisals.map((app) => (
            <Link 
              key={app.id} 
              href={`/dashboard/appraisals/${app.id}`} 
              className={styles.card + " glass-panel"}
            >
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.address}>{app.propertyAddress || 'No Address Provided'}</div>
                  <div className={styles.cityState}>
                    {app.city && `${app.city}, `}{app.state} {app.zipCode}
                  </div>
                  <div className={styles.appraiserName}>Appraiser: {app.createdByUser?.name || 'Unknown'}</div>
                </div>
                <div style={{
                  backgroundColor: app.status === 'completed' ? '#10b981' : '#f59e0b',
                  boxShadow: app.status === 'completed' ? '0 0 10px rgba(16, 185, 129, 0.5)' : '0 0 10px rgba(245, 158, 11, 0.5)'
                }} className={styles.statusIcon}></div>
              </div>

              <div className={styles.metaInfo}>
                <div className={styles.metaItem}>
                  <span>📸</span> {(app as any)._count?.photos || 0} Photos
                </div>
                <div className={styles.metaItem}>
                  <span>📐</span> Sketch Synced
                </div>
              </div>

              <div className={styles.footer}>
                <span className={styles.date}>
                  {app.inspectionDate 
                    ? `Inspected ${new Date(app.inspectionDate).toLocaleDateString()}` 
                    : `Created ${new Date(app.createdAt).toLocaleDateString()}`}
                </span>
                <span className={styles.badge} style={{ color: 'var(--primary)' }}>View Details</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
