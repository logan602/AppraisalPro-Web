"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Sketcher.module.css';

const SCALE = 20; // px per foot
const GRID = SCALE;
const DIRECTIONS: any = {
  N:  { dx: 0, dy: -1 },
  S:  { dx: 0, dy: 1 },
  E:  { dx: 1, dy: 0 },
  W:  { dx: -1, dy: 0 },
  NE: { dx: Math.SQRT1_2, dy: -Math.SQRT1_2 },
  NW: { dx: -Math.SQRT1_2, dy: -Math.SQRT1_2 },
  SE: { dx: Math.SQRT1_2, dy: Math.SQRT1_2 },
  SW: { dx: -Math.SQRT1_2, dy: Math.SQRT1_2 },
};

function shoelace(pts: { x: number, y: number }[]) {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

interface Shape {
  id: string;
  name: string;
  multiplier: number;
  label: string;
  color: string;
  closed: boolean;
  points: { x: number, y: number }[];
  walls: { dir: string, feet: number }[];
}

interface Props {
  onSave: (data: any) => void;
  initialData?: any;
}

export default function Sketcher({ onSave, initialData }: Props) {
  const [shapes, setShapes] = useState<Shape[]>(initialData?.shapes || []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dimInput, setDimInput] = useState('');
  const [waitingForStart, setWaitingForStart] = useState(shapes.length === 0);
  const [editingAreaIdx, setEditingAreaIdx] = useState<number | null>(null);
  
  const [pendingWall, setPendingWall] = useState<{ angle: number, feet: number } | null>(null);
  
  // Camera
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const active = shapes[activeIdx];

  // Map directions to angles (degrees)
  const DIR_ANGLES: any = { N: -90, S: 90, E: 0, W: 180, NE: -45, NW: -135, SE: 45, SW: 135 };

  const handleDirection = useCallback((dir: string) => {
    if (!active || active.closed) return;
    const feet = parseFloat(dimInput);
    if (isNaN(feet) || feet <= 0) return;
    if (active.points.length === 0) return;

    setPendingWall({ angle: DIR_ANGLES[dir], feet });
    setDimInput('');
  }, [active, activeIdx, dimInput]);

  const finalizeWall = useCallback(() => {
    if (!active || !pendingWall) return;

    const last = active.points[active.points.length - 1];
    const rad = (pendingWall.angle * Math.PI) / 180;
    const newPt = {
      x: last.x + Math.cos(rad) * pendingWall.feet * SCALE,
      y: last.y + Math.sin(rad) * pendingWall.feet * SCALE
    };

    const first = active.points[0];
    const closing = active.points.length >= 2 && 
      Math.abs(newPt.x - first.x) < 15 && Math.abs(newPt.y - first.y) < 15;

    const nextShapes = shapes.map((s, i) => {
      if (i !== activeIdx) return s;
      return {
        ...s,
        points: closing ? s.points : [...s.points, newPt],
        walls: [...s.walls, { dir: 'custom', feet: pendingWall.feet }],
        closed: closing
      };
    });

    setShapes(nextShapes);
    setPendingWall(null);
  }, [active, activeIdx, pendingWall, shapes]);

  // Area Calc
  const totalSqFt = shapes.reduce((sum, s) => {
    if (!s.closed || s.points.length < 3) return sum;
    const pxArea = shoelace(s.points);
    return sum + (pxArea / (SCALE * SCALE));
  }, 0);

  const addShape = () => {
    const colors = ['#2980b9', '#e74c3c', '#27ae60', '#8e44ad', '#e67e22', '#16a085'];
    const newShape: Shape = {
      id: `S${Date.now()}`,
      name: `Living Area ${shapes.length + 1}`,
      multiplier: 1.0,
      label: `Area ${shapes.length + 1}`,
      color: colors[shapes.length % colors.length],
      closed: false,
      points: [],
      walls: []
    };
    setShapes(prev => [...prev, newShape]);
    setActiveIdx(shapes.length);
    setWaitingForStart(true);
  };

  const closeArea = () => {
    if (!active || active.closed || active.points.length < 3) return;
    const nextShapes = shapes.map((s, i) => i === activeIdx ? { ...s, closed: true } : s);
    setShapes(nextShapes);
    setEditingAreaIdx(activeIdx);
    setPendingWall(null);
  };

  const getCentroid = (pts: { x: number, y: number }[]) => {
    if (pts.length === 0) return { x: 0, y: 0 };
    let x = 0, y = 0;
    pts.forEach(p => { x += p.x; y += p.y; });
    return { x: x / pts.length, y: y / pts.length };
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!waitingForStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;

    // Map to SVG coordinates
    const sx = camera.x + (lx - rect.width / 2) / camera.z;
    const sy = camera.y + (ly - rect.height / 2) / camera.z;

    // Snap to grid
    const nx = Math.round(sx / GRID) * GRID;
    const ny = Math.round(sy / GRID) * GRID;

    const nextShapes = shapes.map((s, i) => i === activeIdx ? { ...s, points: [{ x: nx, y: ny }] } : s);
    setShapes(nextShapes);
    setWaitingForStart(false);
  };

  const getAngleBetween = useCallback(() => {
    if (!active || active.points.length < 1 || !pendingWall) return null;
    const last = active.points[active.points.length - 1];
    const prev = active.points.length >= 2 ? active.points[active.points.length - 2] : null;
    
    if (!prev) return '90.0'; // Default for vertical start
    
    // Angle of the previous wall
    const prevAngle = Math.atan2(last.y - prev.y, last.x - prev.x) * (180 / Math.PI);
    
    // Difference (Exterior angle converted to interior/relative)
    let diff = Math.abs(pendingWall.angle - prevAngle);
    if (diff > 180) diff = 360 - diff;
    return (180 - diff).toFixed(1);
  }, [active, pendingWall]);

  // Auto-Zoom Logic
  const fitView = useCallback(() => {
    const allPts = shapes.flatMap(s => s.points);
    if (allPts.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });

    const w = Math.max(100, maxX - minX);
    const h = Math.max(100, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    
    // Calculate zoom to fit 800x600 viewport with padding
    const padding = 100;
    const nz = Math.min(700 / (w + padding), 500 / (h + padding));
    
    setCamera({ x: cx, y: cy, z: Math.min(2.0, Math.max(0.1, nz)) });
  }, [shapes]);

  useEffect(() => {
    if (!waitingForStart) fitView();
  }, [shapes.length, waitingForStart, fitView]);

  const handleExport = () => {
    const svg = document.querySelector(`.${styles.svgCanvas}`);
    if (!svg) return;

    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const b64Start = 'data:image/svg+xml;base64,';
    const image64 = b64Start + svg64;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const tableHeight = (shapes.filter(s => s.closed).length * 60) + 120;
      canvas.width = 1600;
      canvas.height = 1200 + tableHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // 1. Background
        ctx.fillStyle = '#0b0f1a';
        ctx.fillRect(0, 0, 1600, 1200 + tableHeight);
        
        // 2. Draw Sketch
        ctx.drawImage(img, 0, 0, 1600, 1200);
        
        // 3. Draw Summary Table
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, 1200, 1600, tableHeight);
        
        ctx.fillStyle = 'var(--primary)';
        ctx.font = 'bold 32px Inter, sans-serif';
        ctx.fillText('CALCULATIONS SUMMARY', 60, 1280);
        
        ctx.font = '18px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('AREA NAME', 60, 1340);
        ctx.fillText('SQ FT', 600, 1340);
        ctx.fillText('MULT', 800, 1340);
        ctx.fillText('ADJUSTED TOTAL', 1000, 1340);
        
        let y = 1400;
        shapes.filter(s => s.closed).forEach(s => {
          const rawArea = shoelace(s.points) / (SCALE * SCALE);
          const adjArea = rawArea * s.multiplier;
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.fillText(s.name.toUpperCase(), 60, y);
          
          ctx.font = '22px Inter, sans-serif';
          ctx.fillText(rawArea.toFixed(0), 600, y);
          ctx.fillText(`${s.multiplier.toFixed(2)}x`, 800, y);
          
          ctx.fillStyle = s.color;
          ctx.fillText(`${adjArea.toFixed(0)} SQ FT`, 1000, y);
          
          y += 60;
        });

        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `sketch-report-${Date.now()}.png`;
        link.href = url;
        link.click();
      }
    };
    img.src = image64;
  };

  // Keyboard Support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Numbers
      if (e.key >= '0' && e.key <= '9') {
        setDimInput(v => (v.length < 6 ? v + e.key : v));
      } else if (e.key === '.') {
        setDimInput(v => v.includes('.') ? v : v + '.');
      } else if (e.key === 'Backspace') {
        setDimInput(v => v.slice(0, -1));
      }
      
      // Directions via arrows or rotation
      if (pendingWall) {
        if (e.key === 'ArrowUp') setPendingWall(p => p ? { ...p, angle: p.angle - 15 } : null);
        if (e.key === 'ArrowDown') setPendingWall(p => p ? { ...p, angle: p.angle + 15 } : null);
        if (e.key === 'Enter') finalizeWall();
        if (e.key === 'Escape') setPendingWall(null);
        return;
      }

      if (e.key === 'ArrowUp') handleDirection('N');
      if (e.key === 'ArrowDown') handleDirection('S');
      if (e.key === 'ArrowLeft') handleDirection('W');
      if (e.key === 'ArrowRight') handleDirection('E');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDirection, pendingWall, finalizeWall]);

  return (
    <div className={styles.sketcher}>
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={addShape}>➕ Add Area</button>
        <button className={styles.toolBtn} onClick={closeArea}>🔒 Close Area</button>
        <button className={styles.toolBtn} onClick={handleExport}>📥 Download Image</button>
        <button className={styles.toolBtn} onClick={() => onSave({ shapes })}>💾 Save Sketch</button>
        <button className={styles.toolBtn} onClick={() => setShapes([])}>🗑️ Clear</button>
      </div>

      <div className={styles.stats}>
        <h4>Live Area</h4>
        <div className={styles.value}>{totalSqFt.toFixed(0)} <span style={{ fontSize: '14px', fontWeight: 'normal' }}>sq ft</span></div>
      </div>

      <div 
        ref={canvasRef}
        className={styles.canvasContainer} 
        onClick={handleCanvasClick}
      >
        <svg 
          className={styles.svgCanvas} 
          viewBox={`${camera.x - (400 / camera.z)} ${camera.y - (300 / camera.z)} ${800 / camera.z} ${600 / camera.z}`}
          overflow="visible"
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#grid)" />

          {/* Shapes */}
          {shapes.map((s, idx) => {
            if (s.points.length === 0) return null;
            const pts = s.points.map(p => `${p.x},${p.y}`).join(' ');
            const isActive = idx === activeIdx;
            
            const centroid = getCentroid(s.points);
            const areaSqFt = (shoelace(s.points) / (SCALE * SCALE)) * (s.multiplier || 1.0);
            
            return (
              <g key={s.id}>
                {s.closed ? (
                  <polygon 
                    points={pts} 
                    fill={s.color} 
                    fillOpacity="0.1" 
                    stroke={s.color} 
                    strokeWidth={isActive ? "3" : "1.5"} 
                  />
                ) : (
                  <polyline 
                    points={pts} 
                    fill="none" 
                    stroke={s.color} 
                    strokeWidth="3" 
                  />
                )}

                {/* Wall Dimensions */}
                {s.points.map((p1, i) => {
                  const p2 = s.points[i + 1] || (s.closed ? s.points[0] : null);
                  if (!p2) return null;
                  const mx = (p1.x + p2.x) / 2;
                  const my = (p1.y + p2.y) / 2;
                  const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) / SCALE;
                  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
                  
                  return (
                    <g key={`${s.id}-dim-${i}`} transform={`translate(${mx}, ${my}) rotate(${Math.abs(ang) > 90 ? ang + 180 : ang})`}>
                      <text 
                        y="-4" 
                        textAnchor="middle" 
                        fill="rgba(255,255,255,0.6)" 
                        fontSize={10 / camera.z} 
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {dist.toFixed(1)}'
                      </text>
                    </g>
                  );
                })}

                {/* Area Label */}
                {s.closed && (
                  <g transform={`translate(${centroid.x}, ${centroid.y})`}>
                    <text 
                      textAnchor="middle" 
                      fill="white" 
                      fontSize={14 / camera.z} 
                      fontWeight="bold"
                      style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }}
                      pointerEvents="none"
                    >
                      {s.name || s.label}
                    </text>
                    <text 
                      y={18 / camera.z} 
                      textAnchor="middle" 
                      fill="rgba(255,255,255,0.7)" 
                      fontSize={12 / camera.z}
                      pointerEvents="none"
                    >
                      {areaSqFt.toFixed(0)} sq ft
                    </text>
                  </g>
                )}

                {/* Pending Wall Preview */}
                {isActive && pendingWall && s.points.length > 0 && (
                  <g>
                    {(() => {
                      const last = s.points[s.points.length - 1];
                      const rad = (pendingWall.angle * Math.PI) / 180;
                      const tx = last.x + Math.cos(rad) * pendingWall.feet * SCALE;
                      const ty = last.y + Math.sin(rad) * pendingWall.feet * SCALE;
                      const angleText = getAngleBetween();
                      
                      return (
                        <>
                          <line 
                            x1={last.x} y1={last.y} x2={tx} y2={ty} 
                            stroke={s.color} strokeWidth="3" strokeDasharray="5,5" 
                          />
                          <circle cx={tx} cy={ty} r="4" fill={s.color} opacity="0.5" />
                          
                          {/* Angle Label */}
                          <g transform={`translate(${last.x}, ${last.y})`}>
                            <rect x="10" y="-30" width="60" height="20" rx="4" fill="rgba(0,0,0,0.8)" />
                            <text x="15" y="-16" fill="var(--primary)" fontSize="12" fontWeight="bold">
                              {angleText}°
                            </text>
                            <text x="50" y="-16" fill="white" fontSize="10">
                              {pendingWall.feet}'
                            </text>
                          </g>
                        </>
                      );
                    })()}
                  </g>
                )}

                {/* Nodes */}
                {s.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4" fill={s.color} />
                ))}
              </g>
            );
          })}
        </svg>

        {waitingForStart && (
          <div className={styles.hint}>Click anywhere on the canvas to place your starting point</div>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.dpad}>
          <button onClick={() => handleDirection('NW')} className={styles.dirBtn}>NW</button>
          <button onClick={() => handleDirection('N')} className={styles.dirBtn}>N</button>
          <button onClick={() => handleDirection('NE')} className={styles.dirBtn}>NE</button>
          <button onClick={() => handleDirection('W')} className={styles.dirBtn}>W</button>
          <div className={styles.dirBtn + " " + styles.centerBtn}>🎯</div>
          <button onClick={() => handleDirection('E')} className={styles.dirBtn}>E</button>
          <button onClick={() => handleDirection('SW')} className={styles.dirBtn}>SW</button>
          <button onClick={() => handleDirection('S')} className={styles.dirBtn}>S</button>
          <button onClick={() => handleDirection('SE')} className={styles.dirBtn}>SE</button>
        </div>

        <div className={styles.keypad}>
          <div className={styles.dimInput}>{dimInput || '0'} ft</div>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, '⌫'].map(k => (
            <button 
              key={k} 
              className={styles.keyBtn}
              onClick={() => {
                if (k === '⌫') setDimInput(v => v.slice(0, -1));
                else if (k === '.') setDimInput(v => v.includes('.') ? v : v + '.');
                else setDimInput(v => (v.length < 6 ? v + k : v));
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {editingAreaIdx !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal + " glass-panel"}>
            <h3>Area Settings</h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-dim)' }}>Area Name</label>
              <input 
                className={styles.modalInput} 
                value={shapes[editingAreaIdx]?.name || ''} 
                onChange={(e) => {
                  const next = [...shapes];
                  next[editingAreaIdx].name = e.target.value;
                  setShapes(next);
                }}
                placeholder="e.g. Living Area, Garage"
              />
            </div>
            
            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-dim)' }}>Multiplier</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button className={styles.stepBtn} onClick={() => {
                  const next = [...shapes];
                  next[editingAreaIdx].multiplier = Math.max(0, next[editingAreaIdx].multiplier - 0.25);
                  setShapes(next);
                }}>-</button>
                <div style={{ fontSize: '20px', fontWeight: 'bold', minWidth: '60px', textAlign: 'center' }}>
                  {shapes[editingAreaIdx]?.multiplier.toFixed(2)}x
                </div>
                <button className={styles.stepBtn} onClick={() => {
                  const next = [...shapes];
                  next[editingAreaIdx].multiplier += 0.25;
                  setShapes(next);
                }}>+</button>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setEditingAreaIdx(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
