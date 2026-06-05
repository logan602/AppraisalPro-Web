"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styles from './Sketcher.module.css';

const SCALE = 20; // px per foot
const GRID = SCALE;
const COLORS = ['#2980b9', '#e74c3c', '#27ae60', '#8e44ad', '#e67e22', '#16a085'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shoelace(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function getCentroid(pts: { x: number; y: number }[]): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0, y = 0;
  pts.forEach(p => { x += p.x; y += p.y; });
  return { x: x / pts.length, y: y / pts.length };
}

/**
 * Resize wall[wallIdx] to newFeet, translating all downstream points to keep
 * every other wall's direction and length intact.
 */
function adjustWallLength(shape: Shape, wallIdx: number, newFeet: number): Shape {
  const pts = shape.points.map(p => ({ ...p }));
  const n = pts.length;
  if (n < 2) return shape;

  const p1 = pts[wallIdx];
  const p2Idx = (wallIdx + 1) % n;
  const p2 = pts[p2Idx];

  const oldDx = p2.x - p1.x;
  const oldDy = p2.y - p1.y;
  const oldLen = Math.sqrt(oldDx * oldDx + oldDy * oldDy);
  if (oldLen < 0.001) return shape;

  const newLen = newFeet * SCALE;
  const deltaX = (oldDx / oldLen) * newLen - oldDx;
  const deltaY = (oldDy / oldLen) * newLen - oldDy;

  // Shift every point from p2Idx around to (but not including) wallIdx
  let i = p2Idx;
  while (i !== wallIdx) {
    pts[i].x += deltaX;
    pts[i].y += deltaY;
    i = (i + 1) % n;
  }

  return { ...shape, points: pts };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Point { x: number; y: number; }

interface Shape {
  id: string;
  name: string;
  multiplier: number;
  label: string;
  color: string;
  closed: boolean;
  points: Point[];
  walls: { dir: string; feet: number }[];
  labelOffset?: Point; // offset from centroid for independent label placement
}

type AppMode = 'sketch' | 'modify';

interface DragState {
  type: 'shape' | 'label';
  shapeIdx: number;
  startSvgX: number;
  startSvgY: number;
  origPoints: Point[];
  origLabelOffset: Point;
  /** Snapshot of entire shapes array taken at drag-start, used to push undo on release */
  shapesSnapshot: Shape[];
}

interface WallEditState {
  shapeIdx: number;
  wallIdx: number;
  svgMidX: number;
  svgMidY: number;
  inputValue: string;
}

interface Props {
  onSave: (data: any) => void;
  initialData?: any;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sketcher({ onSave, initialData }: Props) {
  const [shapes, setShapes] = useState<Shape[]>(initialData?.shapes || []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dimInput, setDimInput] = useState('');
  const [waitingForStart, setWaitingForStart] = useState(shapes.length === 0);
  const [editingAreaIdx, setEditingAreaIdx] = useState<number | null>(null);
  const [pendingWall, setPendingWall] = useState<{ angle: number; feet: number } | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });

  // ── New state ──
  const [mode, setMode] = useState<AppMode>('sketch');
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [wallEdit, setWallEdit] = useState<WallEditState | null>(null);
  const [selectedShapeIdx, setSelectedShapeIdx] = useState<number | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  /** Ref mirror of dragState for use inside event callbacks without stale closure */
  const dragStateRef = useRef<DragState | null>(null);
  /** Ref version of isDragging to avoid stale closure in mousemove */
  const isDraggingRef = useRef(false);
  /** Client coords where mousedown occurred */
  const dragStartClientRef = useRef<Point | null>(null);

  // Keep ref in sync with state
  useEffect(() => { dragStateRef.current = dragState; }, [dragState]);

  const active = shapes[activeIdx];
  const DIR_ANGLES: Record<string, number> = {
    N: -90, S: 90, E: 0, W: 180, NE: -45, NW: -135, SE: 45, SW: 135,
  };

  // ─── Coordinate converters ──────────────────────────────────────────────────

  const clientToSVG = useCallback((clientX: number, clientY: number): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: camera.x + (clientX - rect.left - rect.width / 2) / camera.z,
      y: camera.y + (clientY - rect.top - rect.height / 2) / camera.z,
    };
  }, [camera]);

  const svgToScreen = useCallback((svgX: number, svgY: number): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 + (svgX - camera.x) * camera.z,
      y: rect.top + rect.height / 2 + (svgY - camera.y) * camera.z,
    };
  }, [camera]);

  // ─── Undo ───────────────────────────────────────────────────────────────────

  const pushUndo = useCallback((snapshot: Shape[]) => {
    setUndoStack(prev => [...prev.slice(-49), snapshot]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const restored = next.pop()!;
      setShapes(restored);
      setPendingWall(null);
      return next;
    });
  }, []);

  // ─── Sketch helpers ─────────────────────────────────────────────────────────

  const handleDirection = useCallback((dir: string) => {
    if (!active || active.closed || mode !== 'sketch') return;
    const feet = parseFloat(dimInput);
    if (isNaN(feet) || feet <= 0) return;
    if (active.points.length === 0) return;
    setPendingWall({ angle: DIR_ANGLES[dir], feet });
    setDimInput('');
  }, [active, dimInput, mode]);

  const finalizeWall = useCallback(() => {
    if (!active || !pendingWall) return;
    const last = active.points[active.points.length - 1];
    const rad = (pendingWall.angle * Math.PI) / 180;
    const newPt: Point = {
      x: last.x + Math.cos(rad) * pendingWall.feet * SCALE,
      y: last.y + Math.sin(rad) * pendingWall.feet * SCALE,
    };
    const first = active.points[0];
    const closing =
      active.points.length >= 2 &&
      Math.abs(newPt.x - first.x) < 15 &&
      Math.abs(newPt.y - first.y) < 15;

    pushUndo(shapes);
    const nextShapes = shapes.map((s, i) => {
      if (i !== activeIdx) return s;
      return {
        ...s,
        points: closing ? s.points : [...s.points, newPt],
        walls: [...s.walls, { dir: 'custom', feet: pendingWall.feet }],
        closed: closing,
      };
    });
    setShapes(nextShapes);
    setPendingWall(null);
    if (closing) setEditingAreaIdx(activeIdx);
  }, [active, activeIdx, pendingWall, shapes, pushUndo]);

  /**
   * Snap the next vertex directly to an existing point (ghost snap).
   * If the point coincides with the first vertex of the active shape, it closes.
   */
  const snapToPoint = useCallback((pt: Point) => {
    if (!active || active.closed || active.points.length === 0) return;
    const last = active.points[active.points.length - 1];
    const first = active.points[0];
    const closing =
      active.points.length >= 2 &&
      Math.abs(pt.x - first.x) < 5 &&
      Math.abs(pt.y - first.y) < 5;
    const distFeet =
      Math.sqrt((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2) / SCALE;

    pushUndo(shapes);
    const nextShapes = shapes.map((s, i) => {
      if (i !== activeIdx) return s;
      return {
        ...s,
        points: closing ? s.points : [...s.points, pt],
        walls: [...s.walls, { dir: 'snap', feet: distFeet }],
        closed: closing,
      };
    });
    setShapes(nextShapes);
    setPendingWall(null);
    if (closing) setEditingAreaIdx(activeIdx);
  }, [active, activeIdx, shapes, pushUndo]);

  const getAngleBetween = useCallback((): string | null => {
    if (!active || active.points.length < 1 || !pendingWall) return null;
    const prev =
      active.points.length >= 2 ? active.points[active.points.length - 2] : null;
    const last = active.points[active.points.length - 1];
    if (!prev) return '90.0';
    const prevAngle =
      Math.atan2(last.y - prev.y, last.x - prev.x) * (180 / Math.PI);
    let diff = Math.abs(pendingWall.angle - prevAngle);
    if (diff > 180) diff = 360 - diff;
    return (180 - diff).toFixed(1);
  }, [active, pendingWall]);

  // ─── Area totals ────────────────────────────────────────────────────────────

  const totalSqFt = shapes.reduce((sum, s) => {
    if (!s.closed || s.points.length < 3) return sum;
    return sum + (shoelace(s.points) / (SCALE * SCALE)) * (s.multiplier || 1);
  }, 0);

  // ─── Shape management ───────────────────────────────────────────────────────

  const addShape = () => {
    const newShape: Shape = {
      id: `S${Date.now()}`,
      name: `Living Area ${shapes.length + 1}`,
      multiplier: 1.0,
      label: `Area ${shapes.length + 1}`,
      color: COLORS[shapes.length % COLORS.length],
      closed: false,
      points: [],
      walls: [],
    };
    pushUndo(shapes);
    setShapes(prev => [...prev, newShape]);
    setActiveIdx(shapes.length);
    setWaitingForStart(true);
    setMode('sketch');
    setPendingWall(null);
  };

  const closeArea = () => {
    if (!active || active.closed || active.points.length < 3) return;
    pushUndo(shapes);
    setShapes(prev =>
      prev.map((s, i) => (i === activeIdx ? { ...s, closed: true } : s))
    );
    setEditingAreaIdx(activeIdx);
    setPendingWall(null);
  };

  // ─── Canvas click (sketch mode: place starting point) ───────────────────────

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (mode !== 'sketch') return;
    if (!waitingForStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = camera.x + (e.clientX - rect.left - rect.width / 2) / camera.z;
    const sy = camera.y + (e.clientY - rect.top - rect.height / 2) / camera.z;
    const nx = Math.round(sx / GRID) * GRID;
    const ny = Math.round(sy / GRID) * GRID;
    pushUndo(shapes);
    setShapes(prev =>
      prev.map((s, i) => (i === activeIdx ? { ...s, points: [{ x: nx, y: ny }] } : s))
    );
    setWaitingForStart(false);
  };

  // ─── Fit view ───────────────────────────────────────────────────────────────

  const fitView = useCallback(() => {
    const allPts = shapes.flatMap(s => s.points);
    if (allPts.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(p => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    const w = Math.max(100, maxX - minX);
    const h = Math.max(100, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const padding = 100;
    const nz = Math.min(700 / (w + padding), 500 / (h + padding));
    setCamera({ x: cx, y: cy, z: Math.min(2.0, Math.max(0.1, nz)) });
  }, [shapes]);

  useEffect(() => {
    if (!waitingForStart) fitView();
  }, [shapes.length, waitingForStart, fitView]);

  // ─── Modify mode: drag handlers ─────────────────────────────────────────────

  const handleShapeMouseDown = useCallback(
    (e: React.MouseEvent, shapeIdx: number) => {
      if (mode !== 'modify') return;
      e.stopPropagation();
      const svgPt = clientToSVG(e.clientX, e.clientY);
      dragStartClientRef.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = false;
      const ds: DragState = {
        type: 'shape',
        shapeIdx,
        startSvgX: svgPt.x,
        startSvgY: svgPt.y,
        origPoints: shapes[shapeIdx].points.map(p => ({ ...p })),
        origLabelOffset: shapes[shapeIdx].labelOffset ?? { x: 0, y: 0 },
        shapesSnapshot: shapes.map(s => ({
          ...s,
          points: s.points.map(p => ({ ...p })),
        })),
      };
      dragStateRef.current = ds;
      setDragState(ds);
      setSelectedShapeIdx(shapeIdx);
      setWallEdit(null);
    },
    [mode, clientToSVG, shapes]
  );

  const handleShapeDoubleClick = useCallback(
    (e: React.MouseEvent, shapeIdx: number) => {
      if (mode !== 'modify') return;
      e.stopPropagation();
      // Cancel any accidental drag state from the two mousedowns
      dragStateRef.current = null;
      setDragState(null);
      isDraggingRef.current = false;
      setIsDragging(false);
      setEditingAreaIdx(shapeIdx);
    },
    [mode]
  );

  const handleLabelMouseDown = useCallback(
    (e: React.MouseEvent, shapeIdx: number) => {
      if (mode !== 'modify') return;
      e.stopPropagation();
      const svgPt = clientToSVG(e.clientX, e.clientY);
      dragStartClientRef.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = false;
      const ds: DragState = {
        type: 'label',
        shapeIdx,
        startSvgX: svgPt.x,
        startSvgY: svgPt.y,
        origPoints: shapes[shapeIdx].points.map(p => ({ ...p })),
        origLabelOffset: shapes[shapeIdx].labelOffset ?? { x: 0, y: 0 },
        shapesSnapshot: shapes.map(s => ({
          ...s,
          points: s.points.map(p => ({ ...p })),
        })),
      };
      dragStateRef.current = ds;
      setDragState(ds);
      setWallEdit(null);
    },
    [mode, clientToSVG, shapes]
  );

  const handleWallClick = useCallback(
    (
      e: React.MouseEvent,
      shapeIdx: number,
      wallIdx: number,
      svgMidX: number,
      svgMidY: number,
      distFeet: number
    ) => {
      if (mode !== 'modify') return;
      e.stopPropagation();
      if (isDraggingRef.current) return; // ignore clicks that are actually drag releases
      setWallEdit({
        shapeIdx,
        wallIdx,
        svgMidX,
        svgMidY,
        inputValue: distFeet.toFixed(1),
      });
      setSelectedShapeIdx(shapeIdx);
    },
    [mode]
  );

  // Container-level mouse move — handles both shape and label drags
  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds || mode !== 'modify' || !dragStartClientRef.current) return;

      const dx = e.clientX - dragStartClientRef.current.x;
      const dy = e.clientY - dragStartClientRef.current.y;

      if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) > 4) {
        isDraggingRef.current = true;
        setIsDragging(true);
      }
      if (!isDraggingRef.current) return;

      const svgPt = clientToSVG(e.clientX, e.clientY);
      const svgDx = svgPt.x - ds.startSvgX;
      const svgDy = svgPt.y - ds.startSvgY;

      if (ds.type === 'shape') {
        setShapes(prev =>
          prev.map((s, i) => {
            if (i !== ds.shapeIdx) return s;
            return {
              ...s,
              points: ds.origPoints.map(p => ({ x: p.x + svgDx, y: p.y + svgDy })),
            };
          })
        );
      } else {
        setShapes(prev =>
          prev.map((s, i) => {
            if (i !== ds.shapeIdx) return s;
            return {
              ...s,
              labelOffset: {
                x: ds.origLabelOffset.x + svgDx,
                y: ds.origLabelOffset.y + svgDy,
              },
            };
          })
        );
      }
    },
    [mode, clientToSVG]
  );

  // Container-level mouse up — finalises drag and pushes undo
  const handleContainerMouseUp = useCallback(() => {
    const ds = dragStateRef.current;
    if (ds && isDraggingRef.current) {
      // Push the pre-drag snapshot so the user can undo the move
      setUndoStack(prev => [...prev.slice(-49), ds.shapesSnapshot]);
    }
    isDraggingRef.current = false;
    setIsDragging(false);
    setDragState(null);
    dragStateRef.current = null;
    dragStartClientRef.current = null;
  }, []);

  // ─── Wall edit confirm ──────────────────────────────────────────────────────

  const confirmWallEdit = useCallback(() => {
    if (!wallEdit) return;
    const newFeet = parseFloat(wallEdit.inputValue);
    if (isNaN(newFeet) || newFeet <= 0) {
      setWallEdit(null);
      return;
    }
    pushUndo(shapes);
    setShapes(prev =>
      prev.map((s, i) =>
        i !== wallEdit.shapeIdx ? s : adjustWallLength(s, wallEdit.wallIdx, newFeet)
      )
    );
    setWallEdit(null);
  }, [wallEdit, shapes, pushUndo]);

  // ─── Ghost snap points (all vertices visible during sketching) ──────────────

  const ghostPoints = useMemo(() => {
    if (
      mode !== 'sketch' ||
      !active ||
      active.closed ||
      waitingForStart ||
      active.points.length === 0
    )
      return [];
    return shapes.flatMap((s, si) =>
      s.points.map((p, pi) => ({ x: p.x, y: p.y, si, pi }))
    );
  }, [mode, shapes, active, waitingForStart]);

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const svg = document.querySelector(`.${styles.svgCanvas}`);
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = 'data:image/svg+xml;base64,' + svg64;
    const img = new Image();
    img.onload = () => {
      const closedShapes = shapes.filter(s => s.closed);
      const tableHeight = closedShapes.length * 60 + 160;
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1200 + tableHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1f3c';
      ctx.font = 'bold 48px Helvetica, Arial, sans-serif';
      ctx.fillText('PROPERTY SKETCH', 60, 100);
      ctx.drawImage(img, 0, 150, 1600, 1000);
      const tableY = 1150;
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, tableY, 1600, 80);
      ctx.fillStyle = '#1a1f3c';
      ctx.font = 'bold 24px Helvetica, Arial, sans-serif';
      ctx.fillText('AREA NAME', 60, tableY + 50);
      ctx.fillText('MULTIPLIER', 600, tableY + 50);
      ctx.fillText('CALCULATED AREA', 1000, tableY + 50);
      let y = tableY + 130;
      let totalArea = 0;
      closedShapes.forEach(s => {
        const rawArea = shoelace(s.points) / (SCALE * SCALE);
        const adjArea = rawArea * s.multiplier;
        totalArea += adjArea;
        ctx.fillStyle = '#333';
        ctx.font = 'bold 24px Helvetica, Arial, sans-serif';
        ctx.fillText((s.name || s.label).toUpperCase(), 60, y);
        ctx.font = '22px Helvetica, Arial, sans-serif';
        ctx.fillText(`${s.multiplier.toFixed(2)}x`, 600, y);
        ctx.fillStyle = s.color;
        ctx.fillText(
          `${adjArea.toLocaleString(undefined, { maximumFractionDigits: 0 })} SQ FT`,
          1000,
          y
        );
        y += 60;
      });
      ctx.strokeStyle = '#1a1f3c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(60, y - 40);
      ctx.lineTo(1540, y - 40);
      ctx.stroke();
      ctx.fillStyle = '#1a1f3c';
      ctx.font = 'bold 28px Helvetica, Arial, sans-serif';
      ctx.fillText('TOTAL AREA', 60, y + 20);
      ctx.fillText(
        `${totalArea.toLocaleString(undefined, { maximumFractionDigits: 0 })} SQ FT`,
        1000,
        y + 20
      );
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `sketch-report-${Date.now()}.png`;
      link.href = url;
      link.click();
    };
    img.src = image64;
  };

  // ─── Keyboard support ───────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Z → undo (works in both modes)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      if (mode !== 'sketch') return;

      // Numeric input
      if (e.key >= '0' && e.key <= '9')
        setDimInput(v => (v.length < 6 ? v + e.key : v));
      else if (e.key === '.') setDimInput(v => (v.includes('.') ? v : v + '.'));
      else if (e.key === 'Backspace') setDimInput(v => v.slice(0, -1));

      if (pendingWall) {
        if (e.key === 'ArrowUp')
          setPendingWall(p => (p ? { ...p, angle: p.angle - 15 } : null));
        if (e.key === 'ArrowDown')
          setPendingWall(p => (p ? { ...p, angle: p.angle + 15 } : null));
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
  }, [handleDirection, pendingWall, finalizeWall, undo, mode]);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const wallPopupScreen = wallEdit
    ? svgToScreen(wallEdit.svgMidX, wallEdit.svgMidY)
    : null;

  // ─── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.sketcher}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={addShape}>➕ Add Area</button>

        {mode === 'sketch' && (
          <button className={styles.toolBtn} onClick={closeArea}>🔒 Close Area</button>
        )}

        <button
          className={`${styles.toolBtn} ${mode === 'modify' ? styles.toolBtnActive : ''}`}
          onClick={() => {
            const next: AppMode = mode === 'sketch' ? 'modify' : 'sketch';
            setMode(next);
            if (next === 'modify') setPendingWall(null);
            setWallEdit(null);
            setDragState(null);
            dragStateRef.current = null;
            isDraggingRef.current = false;
            setIsDragging(false);
          }}
        >
          {mode === 'modify' ? '✏️ Modify Mode' : '↖ Sketch Mode'}
        </button>

        <button
          className={styles.toolBtn}
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>

        <button className={styles.toolBtn} onClick={handleExport}>📥 Download Image</button>
        <button className={styles.toolBtn} onClick={() => onSave({ shapes })}>💾 Save Sketch</button>
        <button
          className={styles.toolBtn}
          onClick={() => {
            pushUndo(shapes);
            setShapes([]);
            setWaitingForStart(true);
            setPendingWall(null);
            setSelectedShapeIdx(null);
            setWallEdit(null);
          }}
        >
          🗑️ Clear
        </button>
      </div>

      {/* ── Stats ── */}
      <div className={styles.stats}>
        <h4>Live Area</h4>
        <div className={styles.value}>
          {totalSqFt.toFixed(0)}{' '}
          <span style={{ fontSize: '14px', fontWeight: 'normal' }}>sq ft</span>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={canvasRef}
        className={styles.canvasContainer}
        style={{
          cursor:
            mode === 'modify'
              ? isDragging
                ? 'grabbing'
                : 'default'
              : 'crosshair',
        }}
        onClick={handleCanvasClick}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onMouseLeave={handleContainerMouseUp}
      >
        <svg
          className={styles.svgCanvas}
          viewBox={`${camera.x - 400 / camera.z} ${camera.y - 300 / camera.z} ${800 / camera.z} ${600 / camera.z}`}
          overflow="visible"
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <path
                d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" />

          {/* Shapes */}
          {shapes.map((s, idx) => {
            if (s.points.length === 0) return null;
            const pts = s.points.map(p => `${p.x},${p.y}`).join(' ');
            const isActive = idx === activeIdx;
            const isSelected = mode === 'modify' && selectedShapeIdx === idx;
            const centroid = getCentroid(s.points);
            const labelOff = s.labelOffset ?? { x: 0, y: 0 };
            const labelX = centroid.x + labelOff.x;
            const labelY = centroid.y + labelOff.y;
            const areaSqFt =
              (shoelace(s.points) / (SCALE * SCALE)) * (s.multiplier || 1.0);

            return (
              <g key={s.id}>
                {/* ── Main shape polygon / polyline ── */}
                {s.closed ? (
                  <polygon
                    points={pts}
                    fill={s.color}
                    fillOpacity={isSelected ? '0.22' : '0.1'}
                    stroke={s.color}
                    strokeWidth={(isActive || isSelected ? 3 : 1.5) / camera.z}
                    style={{
                      cursor: mode === 'modify' ? 'grab' : 'default',
                      pointerEvents: mode === 'modify' ? 'all' : 'none',
                    }}
                    onMouseDown={e => handleShapeMouseDown(e, idx)}
                    onDoubleClick={e => handleShapeDoubleClick(e, idx)}
                  />
                ) : (
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={3 / camera.z}
                  />
                )}

                {/* ── Selection outline ── */}
                {isSelected && s.closed && (
                  <polygon
                    points={pts}
                    fill="none"
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth={2 / camera.z}
                    strokeDasharray={`${6 / camera.z},${4 / camera.z}`}
                    pointerEvents="none"
                  />
                )}

                {/* ── Wall dim labels + modify click targets ── */}
                {s.points.map((p1, i) => {
                  const p2 = s.points[i + 1] ?? (s.closed ? s.points[0] : null);
                  if (!p2) return null;
                  const mx = (p1.x + p2.x) / 2;
                  const my = (p1.y + p2.y) / 2;
                  const dist =
                    Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2) / SCALE;
                  const ang =
                    Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
                  const rotAng = Math.abs(ang) > 90 ? ang + 180 : ang;
                  const wW = 44 / camera.z;
                  const wH = 20 / camera.z;
                  const isEditedWall =
                    wallEdit?.shapeIdx === idx && wallEdit?.wallIdx === i;

                  return (
                    <g key={`dim-${s.id}-${i}`}>
                      {/* Invisible thick line — easy click target in modify mode */}
                      {mode === 'modify' && (
                        <line
                          x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                          stroke="transparent"
                          strokeWidth={16 / camera.z}
                          style={{ cursor: 'pointer' }}
                          onClick={e => handleWallClick(e, idx, i, mx, my, dist)}
                        />
                      )}

                      {/* Dim badge */}
                      <g
                        transform={`translate(${mx}, ${my}) rotate(${rotAng})`}
                        style={{
                          cursor: mode === 'modify' ? 'pointer' : 'default',
                        }}
                        onClick={
                          mode === 'modify'
                            ? e => handleWallClick(e, idx, i, mx, my, dist)
                            : undefined
                        }
                      >
                        <rect
                          x={-wW / 2}
                          y={-wH / 2}
                          width={wW}
                          height={wH}
                          rx={4 / camera.z}
                          fill={isEditedWall ? s.color : 'rgba(255,255,255,0.92)'}
                          stroke={isEditedWall ? 'white' : 'none'}
                          strokeWidth={1 / camera.z}
                        />
                        <text
                          y={4 / camera.z}
                          textAnchor="middle"
                          fill={isEditedWall ? 'white' : '#333'}
                          fontSize={11 / camera.z}
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          {dist.toFixed(1)}&apos;
                        </text>
                      </g>
                    </g>
                  );
                })}

                {/* ── Area label (draggable in modify mode) ── */}
                {s.closed && (
                  <g
                    transform={`translate(${labelX}, ${labelY})`}
                    style={{
                      cursor: mode === 'modify' ? 'move' : 'default',
                    }}
                    onMouseDown={
                      mode === 'modify'
                        ? e => handleLabelMouseDown(e, idx)
                        : undefined
                    }
                  >
                    <rect
                      x={-60 / camera.z}
                      y={-22 / camera.z}
                      width={120 / camera.z}
                      height={44 / camera.z}
                      rx={8 / camera.z}
                      fill="rgba(255,255,255,0.95)"
                      stroke={s.color}
                      strokeWidth={2 / camera.z}
                    />
                    <text
                      y={-2 / camera.z}
                      textAnchor="middle"
                      fill="#1a1f3c"
                      fontSize={14 / camera.z}
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {s.name || s.label}
                    </text>
                    <text
                      y={16 / camera.z}
                      textAnchor="middle"
                      fill={s.color}
                      fontSize={12 / camera.z}
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {areaSqFt.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}{' '}
                      sq ft
                    </text>

                    {/* Move handle indicator in modify mode */}
                    {mode === 'modify' && (
                      <text
                        y={-10 / camera.z}
                        x={54 / camera.z}
                        textAnchor="middle"
                        fill={s.color}
                        fontSize={9 / camera.z}
                        pointerEvents="none"
                        opacity="0.7"
                      >
                        ✥
                      </text>
                    )}
                  </g>
                )}

                {/* ── Pending wall preview ── */}
                {isActive &&
                  pendingWall &&
                  s.points.length > 0 &&
                  mode === 'sketch' &&
                  (() => {
                    const last = s.points[s.points.length - 1];
                    const rad = (pendingWall.angle * Math.PI) / 180;
                    const tx =
                      last.x + Math.cos(rad) * pendingWall.feet * SCALE;
                    const ty =
                      last.y + Math.sin(rad) * pendingWall.feet * SCALE;
                    const angleText = getAngleBetween();
                    return (
                      <g>
                        <line
                          x1={last.x} y1={last.y} x2={tx} y2={ty}
                          stroke={s.color}
                          strokeWidth={3 / camera.z}
                          strokeDasharray={`${6 / camera.z},${4 / camera.z}`}
                        />
                        {/* Clickable endpoint to finalize */}
                        <circle
                          cx={tx} cy={ty}
                          r={6 / camera.z}
                          fill={s.color}
                          opacity="0.65"
                          style={{ cursor: 'pointer' }}
                          onClick={e => {
                            e.stopPropagation();
                            finalizeWall();
                          }}
                        />
                        <g transform={`translate(${last.x}, ${last.y})`}>
                          <rect
                            x={10 / camera.z} y={-30 / camera.z}
                            width={62 / camera.z} height={20 / camera.z}
                            rx={4 / camera.z}
                            fill="rgba(0,0,0,0.82)"
                          />
                          <text
                            x={15 / camera.z} y={-16 / camera.z}
                            fill="var(--primary)"
                            fontSize={12 / camera.z}
                            fontWeight="bold"
                          >
                            {angleText}°
                          </text>
                          <text
                            x={52 / camera.z} y={-16 / camera.z}
                            fill="white"
                            fontSize={10 / camera.z}
                          >
                            {pendingWall.feet}&apos;
                          </text>
                        </g>
                      </g>
                    );
                  })()}

                {/* ── Vertex nodes ── */}
                {s.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x} cy={p.y}
                    r={4 / camera.z}
                    fill={s.color}
                    pointerEvents="none"
                  />
                ))}
              </g>
            );
          })}

          {/* ── Ghost snap points (sketch mode) ── */}
          {ghostPoints.map((gp, i) => (
            <g key={`ghost-${i}`}>
              {/* Outer pulsing ring */}
              <circle
                cx={gp.x} cy={gp.y}
                r={10 / camera.z}
                fill="rgba(255,60,60,0.07)"
                stroke="#ff4444"
                strokeWidth={1 / camera.z}
                strokeDasharray={`${4 / camera.z},${3 / camera.z}`}
                pointerEvents="none"
              />
              {/* Inner clickable dot */}
              <circle
                cx={gp.x} cy={gp.y}
                r={6 / camera.z}
                fill="rgba(255,80,80,0.18)"
                stroke="#ff4444"
                strokeWidth={1.5 / camera.z}
                style={{ cursor: 'crosshair' }}
                onClick={e => {
                  e.stopPropagation();
                  snapToPoint({ x: gp.x, y: gp.y });
                }}
              />
            </g>
          ))}
        </svg>

        {/* ── Hints ── */}
        {waitingForStart && mode === 'sketch' && (
          <div className={styles.hint}>
            Click anywhere on the canvas to place your starting point
          </div>
        )}
        {mode === 'modify' && (
          <div className={styles.hint}>
            <b>Drag shape</b> to move &nbsp;·&nbsp; <b>Drag label</b> to reposition
            &nbsp;·&nbsp; <b>Double-click</b> to rename &nbsp;·&nbsp;{' '}
            <b>Click a wall</b> to edit its length
          </div>
        )}
      </div>

      {/* ── Wall length popup ── */}
      {wallEdit && wallPopupScreen && (
        <div
          className={styles.wallPopup}
          style={{ left: wallPopupScreen.x, top: wallPopupScreen.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className={styles.wallPopupTitle}>Edit Wall Length</div>
          <div className={styles.wallPopupRow}>
            <input
              className={styles.wallPopupInput}
              type="number"
              value={wallEdit.inputValue}
              min="0.1"
              step="0.5"
              autoFocus
              onChange={e =>
                setWallEdit(prev =>
                  prev ? { ...prev, inputValue: e.target.value } : null
                )
              }
              onKeyDown={e => {
                if (e.key === 'Enter') confirmWallEdit();
                if (e.key === 'Escape') setWallEdit(null);
              }}
            />
            <span className={styles.wallPopupUnit}>ft</span>
          </div>
          <div className={styles.wallPopupBtns}>
            <button className={styles.wallPopupConfirm} onClick={confirmWallEdit}>
              ✓ Apply
            </button>
            <button
              className={styles.wallPopupCancel}
              onClick={() => setWallEdit(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Sketch controls (hidden in modify mode) ── */}
      {mode === 'sketch' && (
        <div className={styles.controls}>
          <div className={styles.dpad}>
            <button onClick={() => handleDirection('NW')} className={styles.dirBtn}>NW</button>
            <button onClick={() => handleDirection('N')} className={styles.dirBtn}>N</button>
            <button onClick={() => handleDirection('NE')} className={styles.dirBtn}>NE</button>
            <button onClick={() => handleDirection('W')} className={styles.dirBtn}>W</button>
            <div className={`${styles.dirBtn} ${styles.centerBtn}`}>🎯</div>
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
                  else if (k === '.')
                    setDimInput(v => (v.includes('.') ? v : v + '.'));
                  else setDimInput(v => (v.length < 6 ? v + k : v));
                }}
              >
                {k}
              </button>
            ))}
          </div>

          {pendingWall && (
            <div className={styles.pendingActions}>
              <button className={styles.toolBtn} onClick={() => finalizeWall()}>
                ✓ Place Wall
              </button>
              <button className={styles.toolBtn} onClick={() => setPendingWall(null)}>
                ✕ Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Area Details Modal ── */}
      {editingAreaIdx !== null && shapes[editingAreaIdx] && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modal} glass-panel`}>
            <h2 style={{ marginBottom: '24px', color: 'var(--primary)' }}>
              Area Details
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--text-dim)',
                }}
              >
                AREA NAME
              </label>
              <input
                className={styles.modalInput}
                value={shapes[editingAreaIdx].name || ''}
                autoFocus
                onChange={e => {
                  const next = [...shapes];
                  next[editingAreaIdx] = {
                    ...next[editingAreaIdx],
                    name: e.target.value,
                  };
                  setShapes(next);
                }}
                placeholder="e.g. Living Area, Garage"
              />
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--text-dim)',
                }}
              >
                AREA MULTIPLIER
              </label>
              <div className={styles.multGrid}>
                {[0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(v => (
                  <button
                    key={v}
                    className={`${styles.multBtn} ${
                      shapes[editingAreaIdx].multiplier === v
                        ? styles.multBtnActive
                        : ''
                    }`}
                    onClick={() => {
                      const next = [...shapes];
                      next[editingAreaIdx] = {
                        ...next[editingAreaIdx],
                        multiplier: v,
                      };
                      setShapes(next);
                    }}
                  >
                    {v}x
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px' }}
              onClick={() => setEditingAreaIdx(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
