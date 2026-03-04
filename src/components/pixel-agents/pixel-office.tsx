'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import type { AgentSnapshot } from '@/lib/types';

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
  pos: Vec;             // current pixel position
  target: Vec;          // target tile
  dest: Vec;            // final destination tile
  path: Vec[];          // BFS path
  state: 'sit' | 'walk' | 'idle' | 'break' | 'think';
  dir: number;          // 0=down,1=left,2=up,3=right
  frame: number;
  stateTimer: number;   // ticks until state change
  deskTile: Vec;        // assigned desk
  // Pixel sync additions
  celebrationTimer: number;   // countdown for sparkle effect (0 = inactive)
  exclamationTimer: number;   // countdown for blocked "!" indicator
  lastKnownStatus: string;    // tracks status changes for reactions
  taskLabel: string;           // truncated currentTask text
}

function truncateTask(task: string, maxLen = 18): string {
  if (task.length <= maxLen) return task;
  return task.slice(0, maxLen - 2) + '..';
}

interface FurnitureItem {
  img: string;
  x: number; y: number;
  w: number; h: number;  // in source pixels
}

/* ───────── office layout ───────── */
// 0=floor, 1=wall, 2=desk, 3=chair, 4=furniture(walkable-over: no), 5=break-area
const LAYOUT: number[][] = [];
for (let r = 0; r < ROWS; r++) {
  const row: number[] = [];
  for (let c = 0; c < COLS; c++) {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) row.push(1); // walls
    else row.push(0);
  }
  LAYOUT.push(row);
}

// Work area desks (left section) — 2 rows of 4 desks
const DESK_TILES: Vec[] = [
  { x: 3, y: 3 }, { x: 6, y: 3 }, { x: 9, y: 3 }, { x: 12, y: 3 },
  { x: 3, y: 7 }, { x: 6, y: 7 }, { x: 9, y: 7 }, { x: 12, y: 7 },
  { x: 3, y: 11 }, { x: 6, y: 11 }, { x: 9, y: 11 }, { x: 12, y: 11 },
];
DESK_TILES.forEach(d => { if (LAYOUT[d.y]) LAYOUT[d.y][d.x] = 2; });

// Chair tiles (below each desk)
DESK_TILES.forEach(d => {
  if (LAYOUT[d.y + 1]) LAYOUT[d.y + 1][d.x] = 3;
});

// Break area (right section)
const BREAK_TILES: Vec[] = [];
for (let r = 2; r <= 5; r++) {
  for (let c = 16; c <= 18; c++) {
    if (LAYOUT[r] && LAYOUT[r][c] === 0) {
      LAYOUT[r][c] = 5;
      BREAK_TILES.push({ x: c, y: r });
    }
  }
}

// Server room area
[{ x: 16, y: 8 }, { x: 17, y: 8 }, { x: 18, y: 8 }].forEach(p => {
  if (LAYOUT[p.y]) LAYOUT[p.y][p.x] = 4;
});

// Supervisor cubicle (Raata's office)
const SUPERVISOR_DESK: Vec = { x: 17, y: 10 };
if (LAYOUT[10]) { LAYOUT[10][16] = 4; LAYOUT[10][17] = 2; LAYOUT[10][18] = 4; }
if (LAYOUT[11]) LAYOUT[11][17] = 3;

/* ───────── furniture defs ───────── */
const FURNITURE: FurnitureItem[] = [
  // Desks
  ...DESK_TILES.map(d => ({ img: '/pixel-agents/furniture/desks/DEFAULT_DESK.png', x: d.x, y: d.y, w: 32, h: 32 })),
  // Monitors on desks
  ...DESK_TILES.slice(0, 8).map(d => ({ img: '/pixel-agents/furniture/electronics/MONITOR_FRONT_ON.png', x: d.x, y: d.y, w: 16, h: 16 })),
  ...DESK_TILES.slice(8).map(d => ({ img: '/pixel-agents/furniture/electronics/LAPTOP_FRONT_ON.png', x: d.x, y: d.y, w: 16, h: 32 })),
  // Chairs
  ...DESK_TILES.map(d => ({ img: '/pixel-agents/furniture/chairs/CHAIR_ROTATING_FRONT.png', x: d.x, y: d.y + 1, w: 16, h: 16 })),
  // Break room
  { img: '/pixel-agents/furniture/misc/VENDING_MACHINE.png', x: 18, y: 2, w: 32, h: 32 },
  { img: '/pixel-agents/furniture/misc/COFFEE_MACHINE.png', x: 16, y: 2, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/misc/WATER_COOLER.png', x: 16, y: 4, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/desks/COFFEE_TABLE_LG.png', x: 17, y: 4, w: 32, h: 32 },
  // Server room
  { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 16, y: 8, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 17, y: 8, w: 16, h: 32 },
  { img: '/pixel-agents/furniture/electronics/PRINTER_DESKTOP.png', x: 18, y: 8, w: 16, h: 32 },
  // Supervisor Raata's cubicle
  { img: '/pixel-agents/furniture/desks/DEFAULT_DESK.png', x: 17, y: 10, w: 32, h: 32 },
  { img: '/pixel-agents/furniture/electronics/MONITOR_CRT_ON.png', x: 16, y: 10, w: 16, h: 16 },
  { img: '/pixel-agents/furniture/chairs/CHAIR_ROTATING_FRONT.png', x: 17, y: 11, w: 16, h: 16 },
  { img: '/pixel-agents/furniture/misc/COFFEE_MUG.png', x: 18, y: 10, w: 16, h: 16 },
  // Decor
  { img: '/pixel-agents/furniture/misc/BIN.png', x: 15, y: 12, w: 16, h: 16 },
  { img: '/pixel-agents/furniture/misc/BIN.png', x: 1, y: 12, w: 16, h: 16 },
];

/* ───────── character mapping ───────── */
const CHAR_MAP: Record<string, number> = {
  architect: 0, 'coder-1': 1, coder: 1, 'coder-2': 2,
  reviewer: 3, tester: 4, 'security-auditor': 5, security: 5,
  devops: 0, coordinator: 3, supervisor: 5,
  'ui-builder': 2, 'ui-polish': 4, 'ui-tester': 1,
};

const STATUS_COLOR: Record<string, string> = {
  working: '#3dba8a', planning: '#5ba3c9', reviewing: '#e8823e',
  idle: '#f5b942', blocked: '#e05252', initializing: '#7fa393',
  completed: '#3dba8a', offline: '#476256',
};

/* ───────── BFS pathfinding ───────── */
function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  const cell = LAYOUT[y][x];
  return cell === 0 || cell === 3 || cell === 5; // floor, chair, or break area
}

function bfs(from: Vec, to: Vec): Vec[] {
  if (from.x === to.x && from.y === to.y) return [];
  const visited = new Set<string>();
  const queue: { pos: Vec; path: Vec[] }[] = [{ pos: from, path: [] }];
  visited.add(`${from.x},${from.y}`);

  const dirs = [
    { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const d of dirs) {
      const nx = cur.pos.x + d.x;
      const ny = cur.pos.y + d.y;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (!isWalkable(nx, ny) && !(nx === to.x && ny === to.y)) continue;
      visited.add(key);
      const newPath = [...cur.path, { x: nx, y: ny }];
      if (nx === to.x && ny === to.y) return newPath;
      queue.push({ pos: { x: nx, y: ny }, path: newPath });
    }
  }
  return []; // no path
}

/* ───────── component ───────── */
interface PixelOfficeProps {
  agents: AgentSnapshot[];
  compact?: boolean;
  projectName?: string;
}

export function PixelOffice({ agents, compact, projectName }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simsRef = useRef<AgentSim[]>([]);
  const spritesRef = useRef<(HTMLImageElement | null)[]>([]);
  const furnitureImgsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const tickRef = useRef(0);
  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName; // Always keep ref in sync with prop
  const [loaded, setLoaded] = useState(false);

  // Show ALL agents including offline — they'll sit dimmed at their desk
  const visible = useMemo(() => agents, [agents]);

  const canvasW = compact ? Math.min(W, 780) : W;
  const canvasH = compact ? Math.min(H, 420) : H;
  const scale = compact ? Math.min(canvasW / W, canvasH / H) : 1;

  // Load all images
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

    // Furniture images
    const furMap = new Map<string, HTMLImageElement>();
    const uniquePaths = new Set(FURNITURE.map(f => f.img));
    for (const src of uniquePaths) {
      promises.push(new Promise(resolve => {
        const img = new Image();
        img.onload = () => { furMap.set(src, img); resolve(); };
        img.onerror = () => resolve();
        img.src = src;
      }));
    }

    // Floor/wall tiles
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
    const existing = simsRef.current;
    const newSims: AgentSim[] = visible.map((agent, idx) => {
      const prev = existing.find(s => s.id === agent.agentId);
      const desk = agent.role === 'supervisor' ? SUPERVISOR_DESK : DESK_TILES[idx % DESK_TILES.length];
      const chairTile = { x: desk.x, y: desk.y + 1 };

      if (prev) {
        // Update agent data, keep simulation state
        prev.agent = agent;
        prev.deskTile = desk;
        // If status changed, potentially change behavior
        if (agent.status === 'idle' && prev.state === 'sit') {
          prev.stateTimer = Math.floor(Math.random() * 60) + 30;
        }
        // Detect status transitions for visual reactions
        if (prev.lastKnownStatus !== agent.status) {
          if (agent.status === 'completed' ||
              (prev.lastKnownStatus === 'working' && agent.status === 'idle')) {
            prev.celebrationTimer = 48; // 4 seconds at 12fps
          }
          if (agent.status === 'blocked') {
            prev.exclamationTimer = 120; // 10 seconds
          }
          prev.lastKnownStatus = agent.status;
        }
        prev.taskLabel = agent.currentTask ? truncateTask(agent.currentTask) : '';
        return prev;
      }

      // New agent: start at their chair
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
        dir: 2, // facing up (toward desk)
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
  }, [visible]);

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

      ctx.imageSmoothingEnabled = false;
      // Clear the entire canvas to prevent ghosting
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(scale, scale);

      // ── Draw floor ──
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = LAYOUT[r][c];
          const px = c * T;
          const py = r * T;

          if (cell === 1) {
            // Wall — dark wood paneling
            ctx.fillStyle = r === 0 ? '#3a2a1a' : '#2e2010';
            ctx.fillRect(px, py, T, T);
            if (r === 0) {
              // Wall trim / baseboard
              ctx.fillStyle = '#4a3828';
              ctx.fillRect(px, py + T - 4, T, 4);
            }
            if (c === 0 || c === COLS - 1) {
              // Side wall highlight
              ctx.fillStyle = '#3d2c18';
              ctx.fillRect(px, py, T, T);
            }
          } else if (cell === 5) {
            // Break area — lighter warm brown (carpet feel)
            ctx.fillStyle = (r + c) % 2 === 0 ? '#3a2e20' : '#3e3122';
            ctx.fillRect(px, py, T, T);
            ctx.strokeStyle = '#453626';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, py, T, T);
          } else {
            // Regular floor — warm brown wood checkerboard
            ctx.fillStyle = (r + c) % 2 === 0 ? '#2e2114' : '#332618';
            ctx.fillRect(px, py, T, T);
            // Subtle wood grain lines
            ctx.strokeStyle = '#3a2c1c';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, py, T, T);
          }
        }
      }

      // ── Wall decorations ──
      ctx.fillStyle = '#c8a87a';
      ctx.font = `bold ${Z * 3}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText((projectNameRef.current || 'AGENT HQ').toUpperCase(), 8 * T, T * 0.65);
      // Room labels
      ctx.fillStyle = '#8a7050';
      ctx.font = `${Z * 2.5}px monospace`;
      ctx.fillText('Work Area', 7 * T, T * 0.35);
      ctx.fillText('Break Room', 17 * T, T * 0.35);
      ctx.fillText('Server', 17 * T, 7.35 * T);
      // Divider line between work area and break/server area
      ctx.strokeStyle = '#4a3828';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15 * T, T);
      ctx.lineTo(15 * T, (ROWS - 1) * T);
      ctx.stroke();

      // ── Draw furniture ──
      for (const fur of FURNITURE) {
        const img = furnitureImgsRef.current.get(fur.img);
        if (img) {
          const px = fur.x * T;
          const py = fur.y * T;
          const dw = (fur.w / S) * T;
          const dh = (fur.h / S) * T;
          // Furniture is drawn with bottom aligned to tile
          ctx.drawImage(img, px, py + T - dh, dw, dh);
        }
      }

      // ── Raata label (drawn after furniture so desk doesn't cover it) ──
      ctx.fillStyle = '#9333ea';
      ctx.font = `bold ${Z * 2.5}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('Raata', 17 * T, 9.15 * T);

      // ── Update & draw agents ──
      const sims = simsRef.current;
      // Sort by Y for depth ordering
      const sorted = [...sims].sort((a, b) => a.pos.y - b.pos.y);

      for (const sim of sorted) {
        updateAgent(sim, tick);
        drawAgentSim(ctx, sim, tick);
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [loaded, scale]);

  function updateAgent(sim: AgentSim, _tick: number) {
    // Offline agents stay frozen at desk
    if (sim.agent.status === 'offline') {
      sim.state = 'sit';
      sim.dir = 2;
      sim.frame = (sim.frame + 1) % 3600;
      return;
    }

    // Blocked agents stay at desk — don't wander
    if (sim.agent.status === 'blocked' && sim.state === 'sit') {
      sim.dir = 2; // face desk
      sim.frame = (sim.frame + 1) % 3600;
      if (sim.exclamationTimer > 0) sim.exclamationTimer--;
      if (sim.celebrationTimer > 0) sim.celebrationTimer--;
      return;
    }

    // Decrement effect timers
    if (sim.celebrationTimer > 0) sim.celebrationTimer--;
    if (sim.exclamationTimer > 0) sim.exclamationTimer--;

    sim.stateTimer--;
    sim.frame = (sim.frame + 1) % 3600; // reset every 3600 frames (~5 min at 12fps) to avoid overflow

    const speed = 2 * Z; // pixels per frame

    switch (sim.state) {
      case 'sit': {
        sim.dir = 2; // face up toward desk
        // Occasionally go on break or walk around if idle
        if (sim.stateTimer <= 0) {
          if (sim.agent.status === 'idle') {
            // Idle agents wander
            const action = Math.random();
            if (action < 0.4) {
              goToBreakRoom(sim);
            } else if (action < 0.7) {
              goWander(sim);
            } else {
              sim.state = 'think';
              sim.stateTimer = 40 + Math.floor(Math.random() * 60);
            }
          } else {
            // Working agents occasionally get coffee
            const action = Math.random();
            if (action < 0.15) {
              goToBreakRoom(sim);
            } else {
              sim.stateTimer = 150 + Math.floor(Math.random() * 200);
            }
          }
        }
        break;
      }

      case 'walk': {
        // Move toward next path tile
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
            // Reached destination
            if (sim.dest.x === sim.deskTile.x && sim.dest.y === sim.deskTile.y + 1) {
              sim.state = 'sit';
              sim.dir = 2;
              sim.stateTimer = sim.agent.status === 'idle'
                ? 60 + Math.floor(Math.random() * 120)
                : 200 + Math.floor(Math.random() * 300);
            } else if (LAYOUT[sim.dest.y]?.[sim.dest.x] === 5) {
              sim.state = 'break';
              sim.stateTimer = 80 + Math.floor(Math.random() * 120);
              sim.dir = 0; // face down
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
        if (sim.stateTimer <= 0) {
          goToDesk(sim);
        }
        break;
      }

      case 'idle': {
        if (sim.stateTimer <= 0) {
          const action = Math.random();
          if (action < 0.5) {
            goToDesk(sim);
          } else {
            goWander(sim);
          }
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

  /** Snap agent to nearest walkable tile for BFS start point */
  function nearestWalkable(px: number, py: number): Vec {
    const tx = Math.round(px / T);
    const ty = Math.round(py / T);
    if (isWalkable(tx, ty)) return { x: tx, y: ty };
    // Search nearby tiles in expanding ring
    for (let d = 1; d <= 3; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
          if (isWalkable(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return { x: tx, y: ty }; // fallback
  }

  function goToBreakRoom(sim: AgentSim) {
    const breakTarget = BREAK_TILES[Math.floor(Math.random() * BREAK_TILES.length)];
    const fromTile = nearestWalkable(sim.pos.x, sim.pos.y);
    const path = bfs(fromTile, breakTarget);
    if (path.length > 0) {
      sim.pos = { x: fromTile.x * T, y: fromTile.y * T }; // snap to grid before walk
      sim.state = 'walk';
      sim.path = path;
      sim.dest = breakTarget;
      sim.target = path.shift()!;
      updateDirection(sim, sim.target);
    }
  }

  function goToDesk(sim: AgentSim) {
    const chairTile = { x: sim.deskTile.x, y: sim.deskTile.y + 1 };
    const fromTile = nearestWalkable(sim.pos.x, sim.pos.y);
    const path = bfs(fromTile, chairTile);
    if (path.length > 0) {
      sim.pos = { x: fromTile.x * T, y: fromTile.y * T }; // snap to grid
      sim.state = 'walk';
      sim.path = path;
      sim.dest = chairTile;
      sim.target = path.shift()!;
      updateDirection(sim, sim.target);
    } else {
      // Teleport back if no path
      sim.pos = { x: chairTile.x * T, y: chairTile.y * T };
      sim.state = 'sit';
      sim.dir = 2;
      sim.stateTimer = 100;
    }
  }

  function goWander(sim: AgentSim) {
    // Pick a random walkable tile
    const candidates: Vec[] = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (isWalkable(c, r)) candidates.push({ x: c, y: r });
      }
    }
    if (candidates.length === 0) return;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const fromTile = nearestWalkable(sim.pos.x, sim.pos.y);
    const path = bfs(fromTile, target);
    if (path.length > 0 && path.length < 20) {
      sim.pos = { x: fromTile.x * T, y: fromTile.y * T }; // snap to grid
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
    if (Math.abs(dy) >= Math.abs(dx)) {
      sim.dir = dy > 0 ? 0 : 2;
    } else {
      sim.dir = dx > 0 ? 3 : 1;
    }
  }

  function drawAgentSim(ctx: CanvasRenderingContext2D, sim: AgentSim, tick: number) {
    const isOffline = sim.agent.status === 'offline';
    const sprite = spritesRef.current[sim.charIdx % 6];
    const dotColor = STATUS_COLOR[sim.agent.status] || '#476256';

    // Dim offline agents
    if (isOffline) ctx.globalAlpha = 0.4;

    // Sprite sheet: 7 columns (0-6), 6 rows (0-5)
    // Rows 0-3: walk directions (down, left, up, right) — columns 0-3 are walk frames
    // Row 4: sitting/working animations — cols 0-2 typing, cols 3-4 planning, cols 5-6 misc
    // Row 5: special/thinking animations — cols 0-2

    let sprRow = 0;
    let sprCol = 0;

    switch (sim.state) {
      case 'walk':
        sprRow = Math.min(sim.dir, 3); // clamp direction to rows 0-3
        sprCol = Math.floor(sim.frame / 4) % 4; // walk cycle: cols 0-3
        break;
      case 'sit':
        sprRow = 4;
        if (sim.agent.status === 'working') {
          sprCol = Math.floor(sim.frame / 8) % 3; // typing: cols 0-2
        } else if (sim.agent.status === 'planning') {
          sprCol = (Math.floor(sim.frame / 10) % 2) + 3; // planning: cols 3-4
        } else if (sim.agent.status === 'reviewing') {
          sprCol = Math.floor(sim.frame / 6) % 3; // review: cols 0-2 (reuse typing)
        } else {
          sprCol = 0; // idle at desk: col 0
        }
        break;
      case 'think':
        sprRow = 5;
        sprCol = Math.floor(sim.frame / 12) % 3; // cols 0-2
        break;
      case 'break':
        sprRow = 0; // facing down
        sprCol = 0; // standing still
        break;
      case 'idle':
        sprRow = sim.dir; // face current direction
        sprCol = Math.floor(sim.frame / 15) % 2; // gentle sway: cols 0-1
        break;
    }

    // Hard clamp to sprite sheet bounds (7 cols × 6 rows)
    sprCol = Math.max(0, Math.min(sprCol, 6));
    sprRow = Math.max(0, Math.min(sprRow, 5));

    const px = sim.pos.x;
    const py = sim.pos.y;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(px + T / 2, py + T - 2, T * 0.35, T * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw sprite
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

    // Think bubble for planning/thinking
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
      // Thought dots
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(bx + 2, by + 8, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx - 2, by + 14, 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Typing particles for working at desk
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

    // Coffee cup icon when on break
    if (sim.state === 'break') {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(px + T / 2 - 4, py - T * 0.3, 8, 10);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.5 + Math.sin(tick * 0.1) * 0.3;
      // Steam
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

    // Restore alpha for offline agents
    if (isOffline) { ctx.globalAlpha = 1; return; }

    // ── Pixel Sync Visual Effects ──

    // (A) Current task label above agent when working at desk
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

    // (B) Celebration sparkles (when celebrationTimer > 0)
    if (sim.celebrationTimer > 0) {
      const progress = sim.celebrationTimer / 48;
      // Green checkmark (first half)
      if (sim.celebrationTimer > 24) {
        ctx.fillStyle = '#4ade80';
        ctx.globalAlpha = Math.min(1, (sim.celebrationTimer - 24) / 12);
        ctx.font = `bold ${Z * 5}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('\u2713', px + T / 2, py - T * 0.6);
        ctx.globalAlpha = 1;
      }
      // Sparkle particles
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

    // (C) Blocked exclamation mark
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

    // (D) Heartbeat pulse ring
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
