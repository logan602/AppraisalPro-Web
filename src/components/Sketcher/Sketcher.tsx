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
  
  // Camera
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const active = shapes[activeIdx];

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

  const handleDirection = useCallback((dir: string) => {
    if (!active || active.closed) return;
    const feet = parseFloat(dimInput);
    if (isNaN(feet) || feet <= 0) return;
    if (active.points.length === 0) return;

    const { dx, dy } = DIRECTIONS[dir];
    const last = active.points[active.points.length - 1];
    const newPt = {
      x: last.x + dx * feet * SCALE,
      y: last.y + dy * feet * SCALE
    };

    const first = active.points[0];
    const closing = active.points.length >= 2 && 
      Math.abs(newPt.x - first.x) < 15 && Math.abs(newPt.y - first.y) < 15;

    const nextShapes = shapes.map((s, i) => {
      if (i !== activeIdx) return s;
      return {
        ...s,
        points: closing ? s.points : [...s.points, newPt],
        walls: [...s.walls, { dir, feet }],
        closed: closing
      };
    });

    setShapes(nextShapes);
    setDimInput('');
  }, [active, activeIdx, dimInput, shapes]);

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
      
      // Secondary cardinal directions via arrows
      if (e.key === 'ArrowUp') handleDirection('N');
      if (e.key === 'ArrowDown') handleDirection('S');
      if (e.key === 'ArrowLeft') handleDirection('W');
      if (e.key === 'ArrowRight') handleDirection('E');

      // Numpad 8-way CAD style
      if (e.key === '8') handleDirection('N');
      if (e.key === '2') handleDirection('S');
      if (e.key === '4') handleDirection('W');
      if (e.key === '6') handleDirection('E');
      if (e.key === '7') handleDirection('NW');
      if (e.key === '9') handleDirection('NE');
      if (e.key === '1') handleDirection('SW');
      if (e.key === '3') handleDirection('SE');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDirection]);

  return (
    <div className={styles.sketcher}>
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={addShape}>➕ Add Area</button>
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
          viewBox={`${camera.x - 400} ${camera.y - 300} 800 600`}
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
            return (
              <g key={s.id}>
                {s.closed ? (
                  <polygon 
                    points={pts} 
                    fill={s.color} 
                    fillOpacity="0.1" 
                    stroke={s.color} 
                    strokeWidth={idx === activeIdx ? "3" : "1.5"} 
                  />
                ) : (
                  <polyline 
                    points={pts} 
                    fill="none" 
                    stroke={s.color} 
                    strokeWidth="3" 
                  />
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
    </div>
  );
}
