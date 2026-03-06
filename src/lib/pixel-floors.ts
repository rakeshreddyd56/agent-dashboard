/* ───────── Per-floor pixel office configs ───────── */

interface Vec { x: number; y: number }
interface FurnitureItem { img: string; x: number; y: number; w: number; h: number }
interface CustomSnack { type: string; x: number; y: number }

export interface FloorConfig {
  layout: number[][];      // 14×20 grid: 0=floor,1=wall,2=desk,3=chair,4=furniture,5=break
  deskTiles: Vec[];
  breakTiles: Vec[];
  furniture: FurnitureItem[];
  customSnacks: CustomSnack[];
  colors: {
    floor1: string; floor2: string;
    break1: string; break2: string;
    wallTop: string; wallSide: string;
    wallTrim: string; accent: string;
  };
  wallLabel: string;
  supervisorDesks: Vec[];
  /** Maps agent role/id → desk index in deskTiles. Ensures deterministic seating. */
  deskAssignments: Record<string, number>;
}

const ROWS = 14;
const COLS = 20;

function makeGrid(): number[][] {
  const grid: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) row.push(1);
      else row.push(0);
    }
    grid.push(row);
  }
  return grid;
}

function markCells(grid: number[][], cells: Vec[], value: number) {
  for (const c of cells) {
    if (grid[c.y]?.[c.x] !== undefined) grid[c.y][c.x] = value;
  }
}

/* ═════════════════════════════════════════════════════
   FLOOR 1 — Research Lab
   5 agents: Robin(rataa-research), Chopper(researcher-1),
   Brook(researcher-2), Jinbe(researcher-3), Carrot(researcher-4)
   ═════════════════════════════════════════════════════ */
function buildFloor1(): FloorConfig {
  const grid = makeGrid();

  // Semicircle desks with proper spacing (no overlaps)
  const deskTiles: Vec[] = [
    { x: 5, y: 3 },   // 0: Robin (rataa-research) — center front
    { x: 3, y: 6 },   // 1: Chopper (researcher-1) — left mid
    { x: 7, y: 6 },   // 2: Brook (researcher-2) — right mid
    { x: 3, y: 9 },   // 3: Jinbe (researcher-3) — left back
    { x: 7, y: 9 },   // 4: Carrot (researcher-4) — right back
  ];
  markCells(grid, deskTiles, 2);
  const chairs = deskTiles.map(d => ({ x: d.x, y: d.y + 1 }));
  markCells(grid, chairs, 3);

  // Council table area (center, between desk rows)
  markCells(grid, [{ x: 10, y: 6 }, { x: 10, y: 7 }], 4);

  // Break area (right side)
  const breakTiles: Vec[] = [];
  for (let r = 2; r <= 5; r++) {
    for (let c = 15; c <= 18; c++) {
      if (grid[r][c] === 0) {
        grid[r][c] = 5;
        breakTiles.push({ x: c, y: r });
      }
    }
  }

  // Bookshelf wall area (left wall)
  markCells(grid, [
    { x: 1, y: 2 }, { x: 1, y: 4 }, { x: 1, y: 6 },
  ], 4);

  // Whiteboard area
  markCells(grid, [{ x: 12, y: 2 }], 4);

  const furniture: FurnitureItem[] = [
    // Desks — each at unique position, no overlap
    ...deskTiles.map(d => ({ img: '/pixel-agents/furniture/desks/DEFAULT_DESK.png', x: d.x, y: d.y, w: 32, h: 32 })),
    // Chairs — at y+1 from each desk
    ...chairs.map(c => ({ img: '/pixel-agents/furniture/chairs/CHAIR_ROTATING_FRONT.png', x: c.x, y: c.y, w: 16, h: 16 })),
    // Council table
    { img: '/pixel-agents/furniture/desks/TABLE_WOOD_LG.png', x: 10, y: 6, w: 32, h: 32 },
    // Stools around council table
    { img: '/pixel-agents/furniture/chairs/STOOL.png', x: 9, y: 6, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/chairs/STOOL.png', x: 11, y: 6, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/chairs/STOOL.png', x: 9, y: 7, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/chairs/STOOL.png', x: 11, y: 7, w: 16, h: 16 },
    // Bookshelves along left wall
    { img: '/pixel-agents/furniture/storage/FULL_BOOKSHELF_TALL.png', x: 1, y: 2, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/storage/FULL_BOOKSHELF_TALL.png', x: 1, y: 4, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/storage/BOOKSHELF_TALL.png', x: 1, y: 6, w: 16, h: 32 },
    // File cabinet
    { img: '/pixel-agents/furniture/storage/FULL_CABINET_TALL.png', x: 1, y: 8, w: 16, h: 32 },
    // Book accents on floor
    { img: '/pixel-agents/furniture/decor/BOOK_SINGLE_BLUE.png', x: 2, y: 3, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/decor/BOOK_SINGLE_RED.png', x: 2, y: 5, w: 16, h: 16 },
    // Whiteboard
    { img: '/pixel-agents/furniture/decor/DEFAULT_WHITEBOARD.png', x: 12, y: 2, w: 32, h: 32 },
    // Wall decorations
    { img: '/pixel-agents/furniture/wall/PAINTING_LANDSCAPE.png', x: 8, y: 1, w: 32, h: 16 },
    { img: '/pixel-agents/furniture/wall/CLOCK_WALL_COLOR.png', x: 14, y: 1, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/wall/PAINTING_SM.png', x: 3, y: 1, w: 16, h: 16 },
    // Floor rug near council
    { img: '/pixel-agents/furniture/decor/MAT_CIRCLES.png', x: 10, y: 8, w: 16, h: 16 },
    // Desk lamps
    { img: '/pixel-agents/furniture/decor/DEFAULT_LAMP.png', x: 6, y: 3, w: 16, h: 16 },
    // Plants
    { img: '/pixel-agents/furniture/decor/DEFAULT_PLANT.png', x: 1, y: 11, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/decor/PLANT_2.png', x: 18, y: 11, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/decor/WHITE_PLANT_1.png', x: 14, y: 5, w: 16, h: 32 },
    // Break room furniture
    { img: '/pixel-agents/furniture/misc/COFFEE_MACHINE.png', x: 15, y: 2, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/misc/WATER_COOLER.png', x: 18, y: 2, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/desks/COFFEE_TABLE_LG.png', x: 16, y: 4, w: 32, h: 32 },
    // Paper on Robin's desk
    { img: '/pixel-agents/furniture/decor/PAPER_FRONT.png', x: 6, y: 6, w: 16, h: 16 },
  ];

  const customSnacks: CustomSnack[] = [
    { type: 'fruit_bowl', x: 17, y: 3 },
    { type: 'biscuit_box', x: 16, y: 3 },
  ];

  return {
    layout: grid,
    deskTiles,
    breakTiles,
    furniture,
    customSnacks,
    colors: {
      floor1: '#2e2114', floor2: '#332618',
      break1: '#3d3020', break2: '#413324',
      wallTop: '#3a2a1a', wallSide: '#3d2c18',
      wallTrim: '#4a3828', accent: '#c8a87a',
    },
    wallLabel: 'RESEARCH LAB',
    supervisorDesks: [],
    deskAssignments: {
      'rataa-research': 0,  // Robin — center front desk
      'researcher-1': 1,    // Chopper — left mid
      'researcher-2': 2,    // Brook — right mid
      'researcher-3': 3,    // Jinbe — left back
      'researcher-4': 4,    // Carrot — right back
    },
  };
}

/* ═════════════════════════════════════════════════════
   FLOOR 2 — Dev Office
   8 desks for: One Piece crew OR legacy project roles
   ═════════════════════════════════════════════════════ */
function buildFloor2(): FloorConfig {
  const grid = makeGrid();

  // 2 rows of 4 with proper spacing
  const deskTiles: Vec[] = [
    { x: 3, y: 3 },   // 0: Nami (rataa-frontend)
    { x: 6, y: 3 },   // 1: Franky (rataa-backend)
    { x: 9, y: 3 },   // 2: Usopp (architect)
    { x: 12, y: 3 },  // 3: Sanji (frontend)
    { x: 3, y: 7 },   // 4: Zoro (backend-1)
    { x: 6, y: 7 },   // 5: Law (backend-2)
    { x: 9, y: 7 },   // 6: Smoker (tester-1)
    { x: 12, y: 7 },  // 7: Tashigi (tester-2)
  ];
  markCells(grid, deskTiles, 2);
  const chairs = deskTiles.map(d => ({ x: d.x, y: d.y + 1 }));
  markCells(grid, chairs, 3);

  // Break area (right side)
  const breakTiles: Vec[] = [];
  for (let r = 2; r <= 5; r++) {
    for (let c = 16; c <= 18; c++) {
      if (grid[r][c] === 0) {
        grid[r][c] = 5;
        breakTiles.push({ x: c, y: r });
      }
    }
  }

  // Whiteboard + chalkboard area (bottom right)
  markCells(grid, [{ x: 16, y: 9 }, { x: 17, y: 9 }], 4);
  // Code review counter
  markCells(grid, [{ x: 16, y: 11 }, { x: 17, y: 11 }], 4);

  const furniture: FurnitureItem[] = [
    // Desks
    ...deskTiles.map(d => ({ img: '/pixel-agents/furniture/desks/DEFAULT_DESK.png', x: d.x, y: d.y, w: 32, h: 32 })),
    // Chairs
    ...chairs.map(c => ({ img: '/pixel-agents/furniture/chairs/CHAIR_ROTATING_FRONT.png', x: c.x, y: c.y, w: 16, h: 16 })),
    // Whiteboard + chalkboard
    { img: '/pixel-agents/furniture/decor/DEFAULT_WHITEBOARD.png', x: 16, y: 9, w: 32, h: 32 },
    { img: '/pixel-agents/furniture/wall/CHALKBOARD_WALL_SM.png', x: 18, y: 9, w: 16, h: 16 },
    // Code review counter
    { img: '/pixel-agents/furniture/desks/COUNTER_WOOD_MD.png', x: 16, y: 11, w: 32, h: 32 },
    // Break room
    { img: '/pixel-agents/furniture/misc/VENDING_MACHINE.png', x: 18, y: 2, w: 32, h: 32 },
    { img: '/pixel-agents/furniture/storage/FRIDGE.png', x: 16, y: 2, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/desks/COFFEE_TABLE_LG.png', x: 17, y: 4, w: 32, h: 32 },
    // Wall decorations
    { img: '/pixel-agents/furniture/wall/CLOCK_WALL_COLOR.png', x: 15, y: 1, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/wall/CHART_SM_1.png', x: 8, y: 1, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/wall/PAINTING_SM_2.png', x: 3, y: 1, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/wall/TEXT_FRAME.png', x: 5, y: 1, w: 16, h: 16 },
    // Coffee mugs on desks
    { img: '/pixel-agents/furniture/misc/COFFEE_MUG.png', x: 4, y: 3, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/misc/COFFEE_MUG.png', x: 10, y: 7, w: 16, h: 16 },
    // Desk lamp
    { img: '/pixel-agents/furniture/decor/DEFAULT_LAMP.png', x: 13, y: 3, w: 16, h: 16 },
    // Floor mat
    { img: '/pixel-agents/furniture/decor/MAT_SQUARE.png', x: 8, y: 5, w: 16, h: 16 },
    // Plants
    { img: '/pixel-agents/furniture/decor/PLANT_1.png', x: 1, y: 2, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/decor/PLANT_3.png', x: 1, y: 11, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/decor/WHITE_PLANT_2.png', x: 15, y: 6, w: 16, h: 32 },
    // Bins
    { img: '/pixel-agents/furniture/misc/BIN.png', x: 14, y: 12, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/misc/BIN.png', x: 1, y: 12, w: 16, h: 16 },
    // Papers on desks
    { img: '/pixel-agents/furniture/decor/PAPER_FRONT.png', x: 7, y: 3, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/decor/PAPER_SIDE.png', x: 4, y: 7, w: 16, h: 16 },
  ];

  const customSnacks: CustomSnack[] = [
    { type: 'pizza_box', x: 17, y: 3 },
    { type: 'ramen_cup', x: 16, y: 4 },
  ];

  return {
    layout: grid,
    deskTiles,
    breakTiles,
    furniture,
    customSnacks,
    colors: {
      floor1: '#1e2228', floor2: '#222730',
      break1: '#2a2e36', break2: '#2e323a',
      wallTop: '#2a2e38', wallSide: '#252930',
      wallTrim: '#3a3e48', accent: '#8ab4f8',
    },
    wallLabel: 'DEV FLOOR',
    supervisorDesks: [],
    deskAssignments: {
      'rataa-frontend': 0, 'rataa-backend': 1, 'architect': 2, 'frontend': 3,
      'backend-1': 4, 'backend-2': 5, 'tester-1': 6, 'tester-2': 7,
    },
  };
}

/* ═════════════════════════════════════════════════════
   FLOOR 3 — Ops Center
   Agents: Luffy(rataa-ops), supervisor(s)
   ═════════════════════════════════════════════════════ */
function buildFloor3(): FloorConfig {
  const grid = makeGrid();

  // Command desk (center) + secondary ops desk
  const deskTiles: Vec[] = [
    { x: 6, y: 5 },   // 0: rataa-ops — command desk
    { x: 10, y: 5 },  // 1: supervisor — secondary desk
    { x: 10, y: 9 },  // 2: supervisor-2 — monitoring desk
  ];
  markCells(grid, deskTiles, 2);
  const chairs = deskTiles.map(d => ({ x: d.x, y: d.y + 1 }));
  markCells(grid, chairs, 3);

  // Server corridor (right side)
  markCells(grid, [
    { x: 16, y: 3 }, { x: 17, y: 3 }, { x: 16, y: 5 }, { x: 17, y: 5 },
    { x: 16, y: 7 }, { x: 17, y: 7 },
  ], 4);

  // Alert station
  markCells(grid, [{ x: 14, y: 9 }, { x: 14, y: 10 }], 4);

  // Staging crates
  markCells(grid, [{ x: 16, y: 10 }, { x: 17, y: 10 }], 4);

  // Break area (small, near bottom-left)
  const breakTiles: Vec[] = [];
  for (let r = 10; r <= 12; r++) {
    for (let c = 2; c <= 4; c++) {
      if (grid[r][c] === 0) {
        grid[r][c] = 5;
        breakTiles.push({ x: c, y: r });
      }
    }
  }

  const furniture: FurnitureItem[] = [
    // Desks
    ...deskTiles.map(d => ({ img: '/pixel-agents/furniture/desks/DEFAULT_DESK.png', x: d.x, y: d.y, w: 32, h: 32 })),
    // Chairs
    ...chairs.map(c => ({ img: '/pixel-agents/furniture/chairs/CHAIR_ROTATING_FRONT.png', x: c.x, y: c.y, w: 16, h: 16 })),
    // Triple monitors on command desk
    { img: '/pixel-agents/furniture/electronics/MONITOR_FRONT_ON.png', x: 5, y: 5, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/electronics/MONITOR_FRONT_ON.png', x: 7, y: 5, w: 16, h: 16 },
    // CRT on secondary desk
    { img: '/pixel-agents/furniture/electronics/MONITOR_CRT_ON.png', x: 11, y: 5, w: 16, h: 16 },
    // Server corridor (6 servers)
    { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 16, y: 3, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 17, y: 3, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 16, y: 5, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 17, y: 5, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 16, y: 7, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/electronics/SERVER.png', x: 17, y: 7, w: 16, h: 32 },
    // Charts on walls (deploy dashboards)
    { img: '/pixel-agents/furniture/wall/CHART_1.png', x: 3, y: 1, w: 32, h: 16 },
    { img: '/pixel-agents/furniture/wall/CHART_2.png', x: 6, y: 1, w: 32, h: 16 },
    { img: '/pixel-agents/furniture/wall/CHART_SM_1.png', x: 9, y: 1, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/wall/CHART_SM_2.png', x: 11, y: 1, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/wall/CLOCK_WALL_COLOR.png', x: 13, y: 1, w: 16, h: 16 },
    // Alert station
    { img: '/pixel-agents/furniture/electronics/TELEPHONE.png', x: 14, y: 9, w: 16, h: 16 },
    { img: '/pixel-agents/furniture/electronics/PRINTER_DESKTOP.png', x: 14, y: 10, w: 16, h: 32 },
    // Staging crates
    { img: '/pixel-agents/furniture/storage/CRATES.png', x: 16, y: 10, w: 32, h: 32 },
    { img: '/pixel-agents/furniture/storage/CRATES_SM.png', x: 18, y: 10, w: 16, h: 16 },
    // PC tower near command desk
    { img: '/pixel-agents/furniture/electronics/DEFAULT_PC.png', x: 8, y: 5, w: 16, h: 16 },
    // Floor rug
    { img: '/pixel-agents/furniture/decor/MAT_CHESS_BOARD.png', x: 6, y: 7, w: 16, h: 16 },
    // Plants
    { img: '/pixel-agents/furniture/decor/PLANT_1.png', x: 1, y: 2, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/decor/PLANT_3.png', x: 1, y: 11, w: 16, h: 32 },
    // Break area
    { img: '/pixel-agents/furniture/misc/COFFEE_MACHINE.png', x: 2, y: 10, w: 16, h: 32 },
    { img: '/pixel-agents/furniture/desks/COFFEE_TABLE_LG.png', x: 3, y: 11, w: 32, h: 32 },
    // Cabinet
    { img: '/pixel-agents/furniture/storage/CABINET_TALL.png', x: 18, y: 8, w: 16, h: 32 },
  ];

  const customSnacks: CustomSnack[] = [
    { type: 'protein_bar', x: 4, y: 10 },
    { type: 'ramen_cup', x: 3, y: 10 },
  ];

  return {
    layout: grid,
    deskTiles,
    breakTiles,
    furniture,
    customSnacks,
    colors: {
      floor1: '#1a1e2a', floor2: '#1e2230',
      break1: '#252a38', break2: '#292e3c',
      wallTop: '#1e2236', wallSide: '#1a1e2e',
      wallTrim: '#2e3348', accent: '#ef4444',
    },
    wallLabel: 'OPS CENTER',
    supervisorDesks: [],
    deskAssignments: {
      'rataa-ops': 0,      // Luffy — command desk
      'supervisor': 1,     // Rataa-1 → secondary desk
      'supervisor-2': 2,   // Rataa-2 → monitoring desk
    },
  };
}

export const FLOOR_CONFIGS: Record<1 | 2 | 3, FloorConfig> = {
  1: buildFloor1(),
  2: buildFloor2(),
  3: buildFloor3(),
};
