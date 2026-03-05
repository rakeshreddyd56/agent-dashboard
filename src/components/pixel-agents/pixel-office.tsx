'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import type { AgentSnapshot } from '@/lib/types';
import { FLOOR_CONFIGS, type FloorConfig } from '@/lib/pixel-floors';

/* ───────── constants ───────── */
const S = 16;            // sprite tile size
const Z = 3;             // zoom
const T = S * Z;         // rendered tile = 48px
const COLS = 20;         // office grid columns
const ROWS = 14;         // office grid rows
const W = COLS * T;
const H = ROWS * T;
const FPS = 12;          // animation fps

/* ───────── types ───────── */
interface Vec { x: number; y: number }
interface AgentSim {
  id: string;
  agent: AgentSnapshot;
  charIdx: number;
  pos: Vec;
  target: Vec;
  dest: Vec;
  path: Vec[];
  state: 'sit' | 'walk' | 'idle' | 'break' | 'think';
  dir: number;
  frame: number;
  stateTimer: number;
  deskTile: Vec;
  celebrationTimer: number;
  exclamationTimer: number;
  lastKnownStatus: string;
  taskLabel: string;
}

function truncateTask(task: string, maxLen = 18): string {
  if (task.length <= maxLen) return task;
  return task.slice(0, maxLen - 2) + '..';
}

interface FurnitureItem {
  img: string;
  x: number; y: number;
  w: number; h: number;
}

/* ───────── default "all floors" layout ───────── */
const LAYOUT: number[][] = [];
for (let r = 0; r < ROWS; r++) {
  const row: number[] = [];
  for (let c = 0; c < COLS; c++) {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) row.push(1);
    else row.push(0);
  }
  LAYOUT.push(row);
}

const DESK_TILES: Vec[] = [
  { x: 3, y: 3 }, { x: 6, y: 3 }, { x: 9, y: 3 }, { x: 12, y: 3 },
  { x: 3, y: 7 }, { x: 6, y: 7 }, { x: 9, y: 7 }, { x: 12, y: 7 },
  { x: 3, y: 11 }, { x: 6, y: 11 }, { x: 9, y: 11 }, { x: 12, y: 11 },
];
DESK_TILES.forEach(d => { if (LAYOUT[d.y]) LAYOUT[d.y][d.x] = 2; });
DESK_TILES.forEach(d => { if (LAYOUT[d.y + 1]) LAYOUT[d.y + 1][d.x] = 3; });

const BREAK_TILES: Vec[] = [];
for (let r = 2; r <= 5; r++) {
  for (let c = 16; c <= 18; c++) {
    if (LAYOUT[r] && LAYOUT[r][c] === 0) {
      LAYOUT[r][c] = 5;
      BREAK_TILES.push({ x: c, y: r });
    }
  }
}

[{ x: 16, y: 8 }, { x: 17, y: 8 }, { x: 18, y: 8 }].forEach(p => {
  if (LAYOUT[p.y]) LAYOUT[p.y][p.x] = 4;
});

const SUPERVISOR_DESK: Vec = { x: 17, y: 10 };
const SUPERVISOR_2_DESK: Vec = { x: 16, y: 10 };
if (LAYOUT[10]) { LAYOUT[10][16] = 4; LAYOUT[10][17] = 2; LAYOUT[10][18] = 4; }
if (LAYOUT[11]) LAYOUT[11][17] = 3;

/* ───────── default furniture ───────── */
const FURNITURE: FurnitureItem[] = [
  ...DESK_TILES.map(d => ({ img: '/pixel-agents/furniture/desks/DEFAULT_DESK.png', x: d.x, y: d.y, w: 32, h: 32 })),
  ...DESK_TILES.slice(0, 8).map(d => ({ img: '/pixel-agents/furniture/electronics/MONITOR_FRONT_ON.png', x: d.x, y: d.y, w: 16, h: 16 })),
  ...DESK_TILES.slice(8).map(d => ({ img: '/pixel-agents/furniture/electronics/LAPTOP_FRONT_ON.png', x: d.x, y: d.y, w: 16, h: 32 })),
  ...DESK_TILES.map(d => ({ img: '/pixel-agents/furniture/chairs/CHAIR_ROTATING_FRONT.png', x: d.x, y: d.y + 1, w: 16, h: 16 })),
  { img: '/pixel-agents/furniture/misc/VENDING_MACHINE.png', x: 18, y: 2, w: 32, h: 32 },
  { img: '/pixel-agents/furniture/misc/COFFEE_MACHINE.png', x: 16, y: 2, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/misc/WATER_COOLER.png', x: 16, y: 4, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/desks/COFFEE_TABLE_LG.png', x: 17, y: 4, w: 32, h: 32 },
  { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 16, y: 8, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 17, y: 8, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/electronics/PRINTER_DESKTOP.png', x: 18, y: 8, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/desks/DEFAULT_DESK.png', x: 17, y: 10, w: 32, h: 32 },
  { img: '/pixel-agents/furniture/electronics/MONITOR_CRT_ON.png', x: 16, y: 10, w: 16, h: 16 },
  { img: '/pixel-agents/furniture/chairs/CHAIR_ROTATING_FRONT.png', x: 17, y: 11, w: 16, h: 16 },
  { img: '/pixel-agents/furniture/misc/COFFEE_MUG.png', x: 18, y: 10, w: 16, h: 16 },
  { img: '/pixel-agents/furniture/misc/BIN.png', x: 15, y: 12, w: 16, h: 16 },
  { img: '/pixel-agents/furniture/misc/BIN.png', x: 1, y: 12, w: 16, h: 16 },
];

/* ───────── default colors ───────── */
const DEFAULT_COLORS = {
  floor1: '#2e2114', floor2: '#332618',
  break1: '#3a2e20', break2: '#3e3122',
  wallTop: '#3a2a1a', wallSide: '#3d2c18',
  wallTrim: '#4a3828', accent: '#c8a87a',
};

/* ───────── character mapping ───────── */
const CHAR_MAP: Record<string, number> = {
  architect: 0, 'coder-1': 1, coder: 1, 'coder-2': 2,
  reviewer: 3, tester: 4, 'security-auditor': 5, security: 5,
  devops: 0, coordinator: 3, supervisor: 5, 'supervisor-2': 5,
  'ui-builder': 2, 'ui-polish': 4, 'ui-tester': 1,
  // One Piece crew
  'rataa-research': 3, 'rataa-frontend': 2, 'rataa-backend': 0, 'rataa-ops': 1,
  frontend: 4, 'backend-1': 0, 'backend-2': 5,
  'tester-1': 3, 'tester-2': 4,
  'researcher-1': 1, 'researcher-2': 2, 'researcher-3': 0, 'researcher-4': 5,
};

const STATUS_COLOR: Record<string, string> = {
  working: '#3dba8a', planning: '#5ba3c9', reviewing: '#e8823e',
  idle: '#f5b942', blocked: '#e05252', initializing: '#7fa393',
  completed: '#3dba8a', offline: '#476256',
};

/* ───────── BFS pathfinding (parameterized) ───────── */
function isWalkableOn(layout: number[][], x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  const cell = layout[y][x];
  return cell === 0 || cell === 3 || cell === 5;
}

function bfsOn(layout: number[][], from: Vec, to: Vec): Vec[] {
  if (from.x === to.x && from.y === to.y) return [];
  const visited = new Set<string>();
  const queue: { pos: Vec; path: Vec[] }[] = [{ pos: from, path: [] }];
  visited.add(`${from.x},${from.y}`);
  const dirs = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const d of dirs) {
      const nx = cur.pos.x + d.x;
      const ny = cur.pos.y + d.y;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (!isWalkableOn(layout, nx, ny) && !(nx === to.x && ny === to.y)) continue;
      visited.add(key);
      const newPath = [...cur.path, { x: nx, y: ny }];
      if (nx === to.x && ny === to.y) return newPath;
      queue.push({ pos: { x: nx, y: ny }, path: newPath });
    }
  }
  return [];
}

/* ───────── canvas-drawn snacks ───────── */
function drawCustomSnack(ctx: CanvasRenderingContext2D, type: string, x: number, y: number) {
  const px = x * T;
  const py = y * T;

  switch (type) {
    case 'fruit_bowl': {
      // Brown oval bowl
      ctx.fillStyle = '#8B6914';
      ctx.beginPath();
      ctx.ellipse(px + T / 2, py + T - 8, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Fruits
      ctx.fillStyle = '#e53e3e'; // red apple
      ctx.beginPath(); ctx.arc(px + T / 2 - 6, py + T - 14, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#48bb78'; // green apple
      ctx.beginPath(); ctx.arc(px + T / 2 + 6, py + T - 14, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ecc94b'; // yellow
      ctx.beginPath(); ctx.arc(px + T / 2, py + T - 18, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'biscuit_box': {
      // Tan rectangle box
      ctx.fillStyle = '#d4a76a';
      ctx.fillRect(px + 6, py + T - 16, 24, 12);
      ctx.strokeStyle = '#b8894d';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 6, py + T - 16, 24, 12);
      // Small biscuit circles
      ctx.fillStyle = '#c4955a';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(px + 14 + i * 6, py + T - 10, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'pizza_box': {
      // Flat box
      ctx.fillStyle = '#d4d4d4';
      ctx.fillRect(px + 4, py + T - 14, 28, 10);
      ctx.strokeStyle = '#a0a0a0';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 4, py + T - 14, 28, 10);
      // Pizza slice peeking
      ctx.fillStyle = '#f6ad55';
      ctx.beginPath();
      ctx.moveTo(px + 28, py + T - 14);
      ctx.lineTo(px + 36, py + T - 22);
      ctx.lineTo(px + 22, py + T - 14);
      ctx.closePath();
      ctx.fill();
      // Pepperoni
      ctx.fillStyle = '#e53e3e';
      ctx.beginPath(); ctx.arc(px + 28, py + T - 17, 2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ramen_cup': {
      // White cylinder
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(px + 10, py + T - 20, 16, 16);
      ctx.fillStyle = '#e2e2e2';
      ctx.beginPath();
      ctx.ellipse(px + 18, py + T - 20, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Red band
      ctx.fillStyle = '#e53e3e';
      ctx.fillRect(px + 10, py + T - 14, 16, 4);
      // Steam lines
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      for (let s = 0; s < 2; s++) {
        const sx = px + 14 + s * 8;
        ctx.beginPath();
        ctx.moveTo(sx, py + T - 22);
        ctx.quadraticCurveTo(sx + 2, py + T - 28, sx - 1, py + T - 32);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'protein_bar': {
      // Small wrapped rectangle
      ctx.fillStyle = '#8b5cf6';
      ctx.fillRect(px + 8, py + T - 10, 20, 6);
      ctx.strokeStyle = '#6d28d9';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 8, py + T - 10, 20, 6);
      // Wrapper crinkle lines
      ctx.strokeStyle = '#a78bfa';
      ctx.beginPath();
      ctx.moveTo(px + 12, py + T - 10);
      ctx.lineTo(px + 12, py + T - 4);
      ctx.moveTo(px + 24, py + T - 10);
      ctx.lineTo(px + 24, py + T - 4);
      ctx.stroke();
      break;
    }
  }
}

/* ───────── component ───────── */
type ViewFloor = 'all' | 1 | 2 | 3;

interface PixelOfficeProps {
  agents: AgentSnapshot[];
  compact?: boolean;
  projectName?: string;
  floorId?: ViewFloor;
}

export function PixelOffice({ agents, compact, projectName, floorId = 'all' }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simsRef = useRef<AgentSim[]>([]);
  const spritesRef = useRef<(HTMLImageElement | null)[]>([]);
  const furnitureImgsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const tickRef = useRef(0);
  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName;
  const floorIdRef = useRef(floorId);
  floorIdRef.current = floorId;
  const [loaded, setLoaded] = useState(false);

  // Derive active config based on floorId
  const activeConfig = useMemo(() => {
    if (floorId === 'all' || !FLOOR_CONFIGS[floorId as 1 | 2 | 3]) {
      return {
        layout: LAYOUT,
        deskTiles: DESK_TILES,
        breakTiles: BREAK_TILES,
        furniture: FURNITURE,
        customSnacks: [] as { type: string; x: number; y: number }[],
        colors: DEFAULT_COLORS,
        wallLabel: '',
        supervisorDesks: [SUPERVISOR_DESK, SUPERVISOR_2_DESK],
      };
    }
    return FLOOR_CONFIGS[floorId as 1 | 2 | 3];
  }, [floorId]);

  const activeConfigRef = useRef(activeConfig);
  activeConfigRef.current = activeConfig;

  // Stabilize: keep last non-empty agents array to prevent glitching during SSE sync gaps
  const lastAgentsRef = useRef<AgentSnapshot[]>(agents);
  const visible = useMemo(() => {
    if (agents.length === 0 && lastAgentsRef.current.length > 0) {
      // Don't wipe sims during brief empty-array gaps from SSE sync
      return lastAgentsRef.current;
    }
    lastAgentsRef.current = agents;
    return agents;
  }, [agents]);

  const canvasW = compact ? Math.min(W, 780) : W;
  const canvasH = compact ? Math.min(H, 420) : H;
  const scale = compact ? Math.min(canvasW / W, canvasH / H) : 1;

  // Load all images (including all floor furniture)
  useEffect(() => {
    let cancelled = false;
    const promises: Promise<void>[] = [];

    // Character sprites
    const sprites: (HTMLImageElement | null)[] = new Array(6).fill(null);
    for (let i = 0; i < 6; i++) {
      promises.push(new Promise(resolve => {
        const img = new Image();
        img.onload = () => { sprites[i] = img; resolve(); };
        img.onerror = () => resolve();
        img.src = `/pixel-agents/characters/char_${i}.png`;
      }));
    }

    // Collect ALL furniture image paths from default + all floors
    const allFurniturePaths = new Set<string>();
    FURNITURE.forEach(f => allFurniturePaths.add(f.img));
    for (const floor of [1, 2, 3] as const) {
      FLOOR_CONFIGS[floor].furniture.forEach(f => allFurniturePaths.add(f.img));
    }

    const furMap = new Map<string, HTMLImageElement>();
    for (const src of allFurniturePaths) {
      promises.push(new Promise(resolve => {
        const img = new Image();
        img.onload = () => { furMap.set(src, img); resolve(); };
        img.onerror = () => resolve();
        img.src = src;
      }));
    }

    const floorImg = new Image();
    promises.push(new Promise(r => { floorImg.onload = () => r(); floorImg.onerror = () => r(); floorImg.src = '/pixel-agents/floors.png'; }));
    const wallImg = new Image();
    promises.push(new Promise(r => { wallImg.onload = () => r(); wallImg.onerror = () => r(); wallImg.src = '/pixel-agents/walls.png'; }));

    Promise.all(promises).then(() => {
      if (cancelled) return;
      spritesRef.current = sprites;
      furnitureImgsRef.current = furMap;
      setLoaded(true);
    });

    return () => { cancelled = true; };
  }, []);

  // Initialize / update agent simulations
  useEffect(() => {
    // Skip if agents haven't meaningfully changed (same IDs + statuses)
    const existing = simsRef.current;
    const prevKey = existing.map(s => `${s.id}:${s.agent.status}:${s.agent.currentTask || ''}`).sort().join('|');
    const nextKey = visible.map(a => `${a.agentId}:${a.status}:${a.currentTask || ''}`).sort().join('|');
    const forceRebuild = existing.length === 0 || existing.length !== visible.length
      || existing.some(s => !visible.find(a => a.agentId === s.id));

    if (!forceRebuild && prevKey === nextKey) return;

    const cfg = activeConfig;
    const newSims: AgentSim[] = visible.map((agent, idx) => {
      const prev = existing.find(s => s.id === agent.agentId);
      let desk: Vec;
      if (floorId === 'all') {
        desk = agent.role === 'supervisor' ? SUPERVISOR_DESK
          : agent.role === 'supervisor-2' ? SUPERVISOR_2_DESK
          : DESK_TILES[idx % DESK_TILES.length];
      } else {
        desk = cfg.supervisorDesks[0] && (agent.role === 'supervisor' || agent.role === 'supervisor-2')
          ? cfg.supervisorDesks[idx % cfg.supervisorDesks.length]
          : cfg.deskTiles[idx % cfg.deskTiles.length];
      }
      const chairTile = { x: desk.x, y: desk.y + 1 };

      if (prev) {
        prev.agent = agent;
        prev.deskTile = desk;
        if (agent.status === 'idle' && prev.state === 'sit') {
          prev.stateTimer = Math.floor(Math.random() * 60) + 30;
        }
        if (prev.lastKnownStatus !== agent.status) {
          if (agent.status === 'completed' ||
              (prev.lastKnownStatus === 'working' && agent.status === 'idle')) {
            prev.celebrationTimer = 48;
          }
          if (agent.status === 'blocked') {
            prev.exclamationTimer = 120;
          }
          prev.lastKnownStatus = agent.status;
        }
        prev.taskLabel = agent.currentTask ? truncateTask(agent.currentTask) : '';
        // If floor changed, teleport agent to new desk
        if (prev.pos.x !== chairTile.x * T || prev.pos.y !== chairTile.y * T) {
          if (prev.state === 'sit') {
            prev.pos = { x: chairTile.x * T, y: chairTile.y * T };
          }
        }
        return prev;
      }

      const isOffline = agent.status === 'offline';
      return {
        id: agent.agentId,
        agent,
        charIdx: CHAR_MAP[agent.agentId] ?? CHAR_MAP[agent.role] ?? (idx % 6),
        pos: { x: chairTile.x * T, y: chairTile.y * T },
        target: { ...chairTile },
        dest: { ...chairTile },
        path: [],
        state: 'sit' as const,
        dir: 2,
        frame: 0,
        stateTimer: isOffline ? 999999 : (agent.status === 'idle' ? 60 + Math.floor(Math.random() * 120) : 200 + Math.floor(Math.random() * 300)),
        deskTile: desk,
        celebrationTimer: 0,
        exclamationTimer: 0,
        lastKnownStatus: agent.status,
        taskLabel: agent.currentTask ? truncateTask(agent.currentTask) : '',
      };
    });

    simsRef.current = newSims;
  }, [visible, activeConfig, floorId]);

  // Main game loop
  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = 0;
    const interval = 1000 / FPS;

    const loop = (time: number) => {
      animId = requestAnimationFrame(loop);
      const delta = time - lastTime;
      if (delta < interval) return;
      lastTime = time - (delta % interval);

      tickRef.current++;
      const tick = tickRef.current;
      const cfg = activeConfigRef.current;
      const curFloorId = floorIdRef.current;
      const colors = cfg.colors;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(scale, scale);

      // ── Draw floor tiles ──
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = cfg.layout[r][c];
          const px = c * T;
          const py = r * T;

          if (cell === 1) {
            ctx.fillStyle = r === 0 ? colors.wallTop : (c === 0 || c === COLS - 1 ? colors.wallSide : colors.wallTop);
            ctx.fillRect(px, py, T, T);
            if (r === 0) {
              ctx.fillStyle = colors.wallTrim;
              ctx.fillRect(px, py + T - 4, T, 4);
            }
            if (c === 0 || c === COLS - 1) {
              ctx.fillStyle = colors.wallSide;
              ctx.fillRect(px, py, T, T);
            }
          } else if (cell === 5) {
            ctx.fillStyle = (r + c) % 2 === 0 ? colors.break1 : colors.break2;
            ctx.fillRect(px, py, T, T);
            ctx.strokeStyle = colors.wallTrim;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, py, T, T);
          } else {
            ctx.fillStyle = (r + c) % 2 === 0 ? colors.floor1 : colors.floor2;
            ctx.fillRect(px, py, T, T);
            ctx.strokeStyle = colors.wallTrim;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, py, T, T);
          }
        }
      }

      // ── Wall decorations ──
      ctx.fillStyle = colors.accent;
      ctx.font = `bold ${Z * 3}px monospace`;
      ctx.textAlign = 'center';
      if (curFloorId !== 'all' && cfg.wallLabel) {
        ctx.fillText(cfg.wallLabel, 8 * T, T * 0.65);
      } else {
        ctx.fillText((projectNameRef.current || 'AGENT HQ').toUpperCase(), 8 * T, T * 0.65);
      }

      if (curFloorId === 'all') {
        // Default layout labels
        ctx.fillStyle = '#8a7050';
        ctx.font = `${Z * 2.5}px monospace`;
        ctx.fillText('Work Area', 7 * T, T * 0.35);
        ctx.fillText('Break Room', 17 * T, T * 0.35);
        ctx.fillText('Server', 17 * T, 7.35 * T);
        ctx.strokeStyle = colors.wallTrim;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(15 * T, T);
        ctx.lineTo(15 * T, (ROWS - 1) * T);
        ctx.stroke();
      }

      // ── Draw furniture ──
      for (const fur of cfg.furniture) {
        const img = furnitureImgsRef.current.get(fur.img);
        if (img) {
          const fpx = fur.x * T;
          const fpy = fur.y * T;
          const dw = (fur.w / S) * T;
          const dh = (fur.h / S) * T;
          ctx.drawImage(img, fpx, fpy + T - dh, dw, dh);
        }
      }

      // ── Custom snacks (canvas-drawn) ──
      for (const snack of cfg.customSnacks) {
        drawCustomSnack(ctx, snack.type, snack.x, snack.y);
      }

      // ── Rataa label (all-floors only) ──
      if (curFloorId === 'all') {
        ctx.fillStyle = '#9333ea';
        ctx.font = `bold ${Z * 2.5}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('Rataa', 17 * T, 9.15 * T);
      }

      // ── Floor accent for Ops Center ──
      if (curFloorId === 3) {
        // Red alert strip along bottom wall
        ctx.fillStyle = colors.accent;
        ctx.globalAlpha = 0.3 + Math.sin(tick * 0.05) * 0.15;
        ctx.fillRect(T, (ROWS - 1) * T, (COLS - 2) * T, 3);
        ctx.globalAlpha = 1;
      }

      // ── Update & draw agents ──
      const sims = simsRef.current;
      const sorted = [...sims].sort((a, b) => a.pos.y - b.pos.y);

      for (const sim of sorted) {
        updateAgent(sim, tick, cfg);
        drawAgentSim(ctx, sim, tick, cfg);
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [loaded, scale]);

  function updateAgent(sim: AgentSim, _tick: number, cfg: FloorConfig | typeof activeConfig) {
    if (sim.agent.status === 'offline') {
      sim.state = 'sit';
      sim.dir = 2;
      sim.frame = (sim.frame + 1) % 3600;
      return;
    }

    if (sim.agent.status === 'blocked' && sim.state === 'sit') {
      sim.dir = 2;
      sim.frame = (sim.frame + 1) % 3600;
      if (sim.exclamationTimer > 0) sim.exclamationTimer--;
      if (sim.celebrationTimer > 0) sim.celebrationTimer--;
      return;
    }

    if (sim.celebrationTimer > 0) sim.celebrationTimer--;
    if (sim.exclamationTimer > 0) sim.exclamationTimer--;

    sim.stateTimer--;
    sim.frame = (sim.frame + 1) % 3600;

    const speed = 2 * Z;
    const layout = cfg.layout;

    switch (sim.state) {
      case 'sit': {
        sim.dir = 2;
        if (sim.stateTimer <= 0) {
          if (sim.agent.status === 'idle') {
            const action = Math.random();
            if (action < 0.4) goToBreakRoom(sim, cfg);
            else if (action < 0.7) goWander(sim, cfg);
            else {
              sim.state = 'think';
              sim.stateTimer = 40 + Math.floor(Math.random() * 60);
            }
          } else {
            const action = Math.random();
            if (action < 0.15) goToBreakRoom(sim, cfg);
            else sim.stateTimer = 150 + Math.floor(Math.random() * 200);
          }
        }
        break;
      }

      case 'walk': {
        const targetPx = sim.target.x * T;
        const targetPy = sim.target.y * T;
        const dx = targetPx - sim.pos.x;
        const dy = targetPy - sim.pos.y;

        if (Math.abs(dx) <= speed && Math.abs(dy) <= speed) {
          sim.pos.x = targetPx;
          sim.pos.y = targetPy;

          if (sim.path.length > 0) {
            sim.target = sim.path.shift()!;
            updateDirection(sim, sim.target);
          } else {
            if (sim.dest.x === sim.deskTile.x && sim.dest.y === sim.deskTile.y + 1) {
              sim.state = 'sit';
              sim.dir = 2;
              sim.stateTimer = sim.agent.status === 'idle'
                ? 60 + Math.floor(Math.random() * 120)
                : 200 + Math.floor(Math.random() * 300);
            } else if (layout[sim.dest.y]?.[sim.dest.x] === 5) {
              sim.state = 'break';
              sim.stateTimer = 80 + Math.floor(Math.random() * 120);
              sim.dir = 0;
            } else {
              sim.state = 'idle';
              sim.stateTimer = 30 + Math.floor(Math.random() * 60);
            }
          }
        } else {
          if (Math.abs(dx) > speed) sim.pos.x += dx > 0 ? speed : -speed;
          else sim.pos.x = targetPx;
          if (Math.abs(dy) > speed) sim.pos.y += dy > 0 ? speed : -speed;
          else sim.pos.y = targetPy;
        }
        break;
      }

      case 'break': {
        if (sim.stateTimer <= 0) goToDesk(sim, cfg);
        break;
      }

      case 'idle': {
        if (sim.stateTimer <= 0) {
          if (Math.random() < 0.5) goToDesk(sim, cfg);
          else goWander(sim, cfg);
        }
        break;
      }

      case 'think': {
        if (sim.stateTimer <= 0) {
          sim.state = 'sit';
          sim.stateTimer = 100 + Math.floor(Math.random() * 200);
        }
        break;
      }
    }
  }

  function nearestWalkable(layout: number[][], px: number, py: number): Vec {
    const tx = Math.round(px / T);
    const ty = Math.round(py / T);
    if (isWalkableOn(layout, tx, ty)) return { x: tx, y: ty };
    for (let d = 1; d <= 3; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
          if (isWalkableOn(layout, tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return { x: tx, y: ty };
  }

  function goToBreakRoom(sim: AgentSim, cfg: FloorConfig | typeof activeConfig) {
    const bt = cfg.breakTiles;
    if (bt.length === 0) return;
    const breakTarget = bt[Math.floor(Math.random() * bt.length)];
    const fromTile = nearestWalkable(cfg.layout, sim.pos.x, sim.pos.y);
    const path = bfsOn(cfg.layout, fromTile, breakTarget);
    if (path.length > 0) {
      sim.pos = { x: fromTile.x * T, y: fromTile.y * T };
      sim.state = 'walk';
      sim.path = path;
      sim.dest = breakTarget;
      sim.target = path.shift()!;
      updateDirection(sim, sim.target);
    }
  }

  function goToDesk(sim: AgentSim, cfg: FloorConfig | typeof activeConfig) {
    const chairTile = { x: sim.deskTile.x, y: sim.deskTile.y + 1 };
    const fromTile = nearestWalkable(cfg.layout, sim.pos.x, sim.pos.y);
    const path = bfsOn(cfg.layout, fromTile, chairTile);
    if (path.length > 0) {
      sim.pos = { x: fromTile.x * T, y: fromTile.y * T };
      sim.state = 'walk';
      sim.path = path;
      sim.dest = chairTile;
      sim.target = path.shift()!;
      updateDirection(sim, sim.target);
    } else {
      sim.pos = { x: chairTile.x * T, y: chairTile.y * T };
      sim.state = 'sit';
      sim.dir = 2;
      sim.stateTimer = 100;
    }
  }

  function goWander(sim: AgentSim, cfg: FloorConfig | typeof activeConfig) {
    const candidates: Vec[] = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (isWalkableOn(cfg.layout, c, r)) candidates.push({ x: c, y: r });
      }
    }
    if (candidates.length === 0) return;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const fromTile = nearestWalkable(cfg.layout, sim.pos.x, sim.pos.y);
    const path = bfsOn(cfg.layout, fromTile, target);
    if (path.length > 0 && path.length < 20) {
      sim.pos = { x: fromTile.x * T, y: fromTile.y * T };
      sim.state = 'walk';
      sim.path = path;
      sim.dest = target;
      sim.target = path.shift()!;
      updateDirection(sim, sim.target);
    }
  }

  function updateDirection(sim: AgentSim, target: Vec) {
    const dx = target.x * T - sim.pos.x;
    const dy = target.y * T - sim.pos.y;
    if (Math.abs(dy) >= Math.abs(dx)) sim.dir = dy > 0 ? 0 : 2;
    else sim.dir = dx > 0 ? 3 : 1;
  }

  function drawAgentSim(ctx: CanvasRenderingContext2D, sim: AgentSim, tick: number, _cfg: FloorConfig | typeof activeConfig) {
    const isOffline = sim.agent.status === 'offline';
    const sprite = spritesRef.current[sim.charIdx % 6];
    const dotColor = STATUS_COLOR[sim.agent.status] || '#476256';

    if (isOffline) ctx.globalAlpha = 0.4;

    let sprRow = 0;
    let sprCol = 0;

    switch (sim.state) {
      case 'walk':
        sprRow = Math.min(sim.dir, 3);
        sprCol = Math.floor(sim.frame / 4) % 4;
        break;
      case 'sit':
        sprRow = 4;
        if (sim.agent.status === 'working') sprCol = Math.floor(sim.frame / 8) % 3;
        else if (sim.agent.status === 'planning') sprCol = (Math.floor(sim.frame / 10) % 2) + 3;
        else if (sim.agent.status === 'reviewing') sprCol = Math.floor(sim.frame / 6) % 3;
        else sprCol = 0;
        break;
      case 'think':
        sprRow = 5;
        sprCol = Math.floor(sim.frame / 12) % 3;
        break;
      case 'break':
        sprRow = 0;
        sprCol = 0;
        break;
      case 'idle':
        sprRow = sim.dir;
        sprCol = Math.floor(sim.frame / 15) % 2;
        break;
    }

    sprCol = Math.max(0, Math.min(sprCol, 6));
    sprRow = Math.max(0, Math.min(sprRow, 5));

    const px = sim.pos.x;
    const py = sim.pos.y;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(px + T / 2, py + T - 2, T * 0.35, T * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sprite
    if (sprite) {
      ctx.drawImage(sprite, sprCol * S, sprRow * S, S, S, px, py - T * 0.2, T, T);
    } else {
      ctx.fillStyle = dotColor;
      ctx.fillRect(px + 8, py - 4, T - 16, T - 8);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Z * 5}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(sim.id[0].toUpperCase(), px + T / 2, py + T / 2 - 4);
    }

    // Status dot
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(px + T - 4, py - T * 0.15, 4, 0, Math.PI * 2);
    ctx.fill();
    if (sim.agent.status === 'working' || sim.agent.status === 'planning') {
      ctx.strokeStyle = dotColor;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px + T - 4, py - T * 0.15, 4 + Math.sin(tick * 0.15) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Think bubble
    if (sim.state === 'think' || (sim.state === 'sit' && sim.agent.status === 'planning')) {
      const bx = px + T + 4;
      const by = py - T * 0.4;
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(bx + 12, by, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.globalAlpha = 1;
      ctx.font = `${Z * 3}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('?', bx + 12, by + 3);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(bx + 2, by + 8, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx - 2, by + 14, 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Typing particles
    if (sim.state === 'sit' && (sim.agent.status === 'working' || sim.agent.status === 'reviewing')) {
      for (let p = 0; p < 3; p++) {
        const phase = tick * 0.2 + p * 2.1;
        const particleY = py - T * 0.3 - Math.abs(Math.sin(phase)) * 8;
        const particleX = px + T * 0.3 + p * 6 + Math.sin(phase * 0.5) * 3;
        ctx.fillStyle = dotColor;
        ctx.globalAlpha = 0.4 + Math.sin(phase) * 0.3;
        ctx.fillRect(particleX, particleY, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // Coffee cup on break
    if (sim.state === 'break') {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(px + T / 2 - 4, py - T * 0.3, 8, 10);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.5 + Math.sin(tick * 0.1) * 0.3;
      for (let s = 0; s < 2; s++) {
        const sx = px + T / 2 - 2 + s * 4;
        const sy = py - T * 0.3 - 4 - Math.sin(tick * 0.08 + s) * 4;
        ctx.fillRect(sx, sy, 2, 3);
      }
      ctx.globalAlpha = 1;
    }

    // Name tag
    ctx.fillStyle = '#d4d4d8';
    ctx.font = `bold ${Math.round(Z * 2.8)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(sim.id, px + T / 2, py + T + 10);

    // Status text
    ctx.fillStyle = dotColor;
    ctx.font = `${Math.round(Z * 2.2)}px monospace`;
    const label = sim.state === 'break' ? 'Coffee break' :
                  sim.state === 'walk' ? 'Walking...' :
                  sim.state === 'think' ? 'Thinking...' :
                  sim.agent.status.charAt(0).toUpperCase() + sim.agent.status.slice(1);
    ctx.fillText(label, px + T / 2, py + T + 21);

    if (isOffline) { ctx.globalAlpha = 1; return; }

    // ── Pixel Sync Visual Effects ──

    // Task label
    if (sim.state === 'sit' && sim.taskLabel &&
        (sim.agent.status === 'working' || sim.agent.status === 'reviewing')) {
      const taskX = px + T / 2;
      const taskY = py - T * 0.5;
      ctx.font = `${Math.round(Z * 2)}px monospace`;
      const metrics = ctx.measureText(sim.taskLabel);
      const pillW = Math.min(metrics.width + 8, T * 2.5);
      const pillX = taskX - pillW / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(pillX, taskY - 6, pillW, 13, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e4e4e7';
      ctx.textAlign = 'center';
      ctx.fillText(sim.taskLabel, taskX, taskY + 3);
    }

    // Celebration sparkles
    if (sim.celebrationTimer > 0) {
      const progress = sim.celebrationTimer / 48;
      if (sim.celebrationTimer > 24) {
        ctx.fillStyle = '#4ade80';
        ctx.globalAlpha = Math.min(1, (sim.celebrationTimer - 24) / 12);
        ctx.font = `bold ${Z * 5}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('\u2713', px + T / 2, py - T * 0.6);
        ctx.globalAlpha = 1;
      }
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + sim.frame * 0.1;
        const radius = T * 0.6 * (1 - progress * 0.5);
        const sx = px + T / 2 + Math.cos(angle) * radius;
        const sy = py + T / 2 + Math.sin(angle) * radius - T * 0.3;
        ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : '#4ade80';
        ctx.globalAlpha = progress * 0.8;
        ctx.fillRect(sx - 1, sy - 1, 3, 3);
      }
      ctx.globalAlpha = 1;
    }

    // Blocked exclamation
    if (sim.agent.status === 'blocked' || sim.exclamationTimer > 0) {
      const blink = Math.floor(sim.frame / 8) % 2 === 0;
      if (blink || sim.agent.status === 'blocked') {
        ctx.fillStyle = '#e05252';
        ctx.globalAlpha = sim.exclamationTimer > 0 ? 0.9 : 0.7;
        ctx.font = `bold ${Z * 5}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('!', px + T + 8, py - T * 0.2);
        ctx.globalAlpha = 1;
      }
    }

    // Heartbeat pulse
    if (sim.agent.lastHeartbeat &&
        (sim.agent.status === 'working' || sim.agent.status === 'planning')) {
      const hbAge = Date.now() - new Date(sim.agent.lastHeartbeat).getTime();
      if (hbAge > 0 && hbAge < 60_000) {
        const pulsePhase = (hbAge % 3000) / 3000;
        const pulseRadius = Math.max(1, 4 + pulsePhase * 8);
        ctx.strokeStyle = dotColor;
        ctx.globalAlpha = Math.max(0, 0.6 - pulsePhase * 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px + T - 4, py - T * 0.15, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(W * scale)}
      height={Math.round(H * scale)}
      className="rounded-lg border border-border"
      style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto' }}
    />
  );
}
