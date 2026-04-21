"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Sketcher from '@/components/Sketcher/Sketcher';
import styles from './SketcherPage.module.css';

interface Sketch {
  id: string;
  name: string;
  data: string;
  updatedAt: string;
}

interface Appraisal {
  id: string;
  propertyAddress: string;
}

export default function SketcherPage() {
  const { token } = useAuth();
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [currentSketch, setCurrentSketch] = useState<Sketch | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignSketchId, setAssignSketchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchSketches();
      fetchAppraisals();
    }
  }, [token]);

  const fetchSketches = async () => {
    try {
      const res = await fetch('/api/sketches', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSketches(data.sketches || []);
    } catch {} finally {
      setIsLoading(false);
    }
  };

  const fetchAppraisals = async () => {
    try {
      const res = await fetch('/api/appraisals', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAppraisals(data.appraisals || []);
    } catch {}
  };

  const handleSave = async (sketchData: any) => {
    try {
      const res = await fetch('/api/sketches', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          name: currentSketch?.name || `Blueprint ${sketches.length + 1}`,
          data: sketchData
        })
      });
      if (res.ok) {
        setIsEditorOpen(false);
        setCurrentSketch(null);
        fetchSketches();
      }
    } catch (err) {
      alert('Failed to save sketch');
    }
  };

  const handleAssign = async (appraisalId: string) => {
    if (!assignSketchId) return;
    try {
      const res = await fetch(`/api/sketches/${assignSketchId}/assign`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ appraisalId })
      });
      if (res.ok) {
        setIsAssignModalOpen(false);
        setAssignSketchId(null);
        fetchSketches(); // Will remove from standalone if properly filtered
        alert('Sketch successfully assigned to inspection!');
      }
    } catch {
      alert('Assignment failed');
    }
  };

  if (isEditorOpen) {
    return (
      <div className={styles.editorOverlay}>
        <div className={styles.editorHeader}>
          <h2>{currentSketch?.name || 'New Sketch'}</h2>
          <button className="btn" onClick={() => setIsEditorOpen(false)}>Close Editor</button>
        </div>
        <Sketcher 
          onSave={handleSave} 
          initialData={currentSketch ? JSON.parse(currentSketch.data) : undefined} 
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className="gradient-text">Sketch Studio</h1>
          <p>Draft standalone floor plans and assign them to inspections later.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setCurrentSketch(null); setIsEditorOpen(true); }}>
          + New Sketch
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading sketches...</div>
      ) : sketches.length === 0 ? (
        <div className={styles.emptyState + " glass-panel"}>
          <div className={styles.emptyIcon}>📐</div>
          <h3>No sketches found</h3>
          <p>Create your first standalone sketch to get started.</p>
        </div>
      ) : (
        <div className={styles.blueprintGrid}>
          {sketches.map((s) => (
            <div key={s.id} className={styles.blueprintCard + " glass-panel"}>
              <div className={styles.preview}>
                {/* Simplified SVG preview */}
                <svg viewBox="-100 -100 200 200" width="100%" height="100%">
                   <path d="M-20 -20 L20 -20 L20 20 L-20 20 Z" fill="rgba(66, 153, 225, 0.2)" stroke="var(--primary)" strokeWidth="2" />
                </svg>
              </div>
              <div className={styles.cardInfo}>
                <h3>{s.name}</h3>
                <p>Updated {new Date(s.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className={styles.cardActions}>
                <button 
                  className="btn btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => { setCurrentSketch(s); setIsEditorOpen(true); }}
                >
                  Edit
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 0 }}
                  onClick={() => { setAssignSketchId(s.id); setIsAssignModalOpen(true); }}
                >
                  🔗
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAssignModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal + " glass-panel"}>
            <h3>Assign to Inspection</h3>
            <p>Select which appraisal should use this blueprint.</p>
            <div className={styles.appraisalList}>
              {appraisals.length === 0 ? (
                <p>No appraisals available to assign.</p>
              ) : (
                appraisals.map(app => (
                  <div key={app.id} className={styles.appraisalItem} onClick={() => handleAssign(app.id)}>
                    <div className={styles.appAddress}>{app.propertyAddress || 'No Address'}</div>
                    <div className={styles.appId}>ID: {app.id.slice(0, 8)}</div>
                  </div>
                ))
              )}
            </div>
            <button className="btn" style={{ marginTop: '20px', width: '100%' }} onClick={() => setIsAssignModalOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
