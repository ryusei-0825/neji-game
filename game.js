const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx = nextCanvas.getContext("2d");
const scoreEl = document.getElementById("score");
const overlay = document.getElementById("overlay");
const finalScoreEl = document.getElementById("finalScore");
const restartButton = document.getElementById("restartButton");
const playAgainButton = document.getElementById("playAgainButton");
const debugButtons = document.getElementById("debugButtons");
const timerEl = document.getElementById("timer");
const timeLimitSelect = document.getElementById("timeLimitSelect");
const applyTimeButton = document.getElementById("applyTimeButton");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const WALL = 20;
const DROP_Y = 58;
const GAME_OVER_LINE = 76;
const GRAVITY = 0.32;
const FRICTION = 0.992;
const RESTITUTION = 0.15;
const MERGE_COOLDOWN = 10;
const GAME_OVER_FRAMES = 28;
const ANGULAR_FRICTION = 0.94;
const DEFAULT_TIME_LIMIT_SECONDS = 5 * 60;

const FRUITS = [
  { name: "M2", radius: 18, color: "#dfe7ea", edge: "#7c8a8f", score: 1, shine: "#ffffff", drive: "plus", head: "flat" },
  { name: "M3", radius: 24, color: "#b36f4a", edge: "#6c3825", score: 3, shine: "#ffd0a8", drive: "minus", head: "pan" },
  { name: "M4", radius: 30, color: "#d9c793", edge: "#8b7440", score: 6, shine: "#fff1b7", drive: "hex", head: "hexbolt" },
  { name: "M5", radius: 38, color: "#6f767c", edge: "#30363a", score: 10, shine: "#cdd5d9", drive: "plus", head: "pan" },
  { name: "M6", radius: 48, color: "#c8d2d7", edge: "#66747a", score: 15, shine: "#f7fbff", drive: "minus", head: "flat" },
  { name: "M8", radius: 60, color: "#d3b56a", edge: "#86672a", score: 21, shine: "#ffe6a0", drive: "hex", head: "washer" },
  { name: "M10", radius: 74, color: "#9a9fa4", edge: "#3f464b", score: 28, shine: "#f5f8fa", drive: "plus", head: "hexbolt" },
  { name: "M12", radius: 88, color: "#a86645", edge: "#56301e", score: 36, shine: "#ffc39a", drive: "minus", head: "flat" },
  { name: "M16", radius: 104, color: "#d0b061", edge: "#755820", score: 45, shine: "#ffe49b", drive: "hex", head: "pan" },
  { name: "特大", radius: 124, color: "#4d555b", edge: "#1e2529", score: 55, shine: "#b9c5ca", drive: "ring", head: "washer" },
];

let fruits;
let currentLevel;
let nextLevel;
let aimX;
let score;
let gameOver;
let lastTime;
let dropLocked;
let animationId;
let fruitId;
let remainingTime;
let timeLimitSeconds = DEFAULT_TIME_LIMIT_SECONDS;

function randomLevel() {
  return Math.floor(Math.random() * 5);
}

function resetGame() {
  fruits = [];
  score = 0;
  aimX = WIDTH / 2;
  currentLevel = randomLevel();
  nextLevel = randomLevel();
  gameOver = false;
  dropLocked = false;
  fruitId = 0;
  remainingTime = timeLimitSeconds;
  lastTime = performance.now();
  overlay.classList.add("hidden");
  scoreEl.textContent = "0";
  updateTimerDisplay();
  drawNext();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function spawnFruit(levelOverride = currentLevel, isDebugSpawn = false) {
  if ((!isDebugSpawn && dropLocked) || gameOver) return;
  const spec = FRUITS[levelOverride];
  const angle = -0.5 + (Math.random() - 0.5) * 0.42;
  const preview = { level: levelOverride, radius: spec.radius, angle };
  const leftSupport = screwSupportRadius(preview, -1, 0);
  const rightSupport = screwSupportRadius(preview, 1, 0);
  fruits.push({
    id: nextFruitId(),
    level: levelOverride,
    x: clamp(aimX, WALL + leftSupport, WIDTH - WALL - rightSupport),
    y: DROP_Y,
    vx: 0,
    vy: 1.5,
    radius: spec.radius,
    angle,
    angularVelocity: 0,
    born: 18,
    mergeTimer: MERGE_COOLDOWN,
    lineTimer: 0,
  });
  if (!isDebugSpawn) {
    currentLevel = nextLevel;
    nextLevel = randomLevel();
    dropLocked = true;
    drawNext();
    setTimeout(() => {
      dropLocked = false;
    }, 430);
  }
}

function loop(now) {
  const delta = Math.min(2, (now - lastTime) / 16.67);
  lastTime = now;
  update(delta);
  draw();
  if (!gameOver) animationId = requestAnimationFrame(loop);
}

function update(delta) {
  remainingTime = Math.max(0, remainingTime - delta / 60);
  updateTimerDisplay();
  if (remainingTime <= 0) {
    finishGame();
    return;
  }

  for (const fruit of fruits) {
    fruit.vy += GRAVITY * delta;
    fruit.vx *= FRICTION;
    fruit.vy *= FRICTION;
    fruit.angularVelocity *= ANGULAR_FRICTION;
    if (Math.abs(fruit.angularVelocity) < 0.001) fruit.angularVelocity = 0;
    fruit.x += fruit.vx * delta;
    fruit.y += fruit.vy * delta;
    fruit.angle += fruit.angularVelocity * delta;
    fruit.born = Math.max(0, fruit.born - delta);
    fruit.mergeTimer = Math.max(0, fruit.mergeTimer - delta);
    updateLineTimer(fruit, delta);
    resolveWall(fruit, true);
  }

  for (let iteration = 0; iteration < 8; iteration += 1) {
    for (let i = 0; i < fruits.length; i += 1) {
      for (let j = i + 1; j < fruits.length; j += 1) {
        resolvePair(fruits[i], fruits[j]);
      }
    }
  }

  // Pair separation can push a screw back through the floor. Clamp the
  // final positions again after all contacts have been resolved.
  for (const fruit of fruits) {
    resolveWall(fruit, false);
  }

  // Floor correction can change the contact normal, so settle pairs once more.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    for (let i = 0; i < fruits.length; i += 1) {
      for (let j = i + 1; j < fruits.length; j += 1) {
        resolvePair(fruits[i], fruits[j]);
      }
    }
  }
  for (const fruit of fruits) {
    resolveWall(fruit, false);
  }

  checkGameOver();
}

function resolveWall(fruit, applyRolling = false) {
  const leftSupport = screwSupportRadius(fruit, -1, 0);
  const rightSupport = screwSupportRadius(fruit, 1, 0);
  const bottomSupport = screwSupportRadius(fruit, 0, 1);

  if (fruit.x - leftSupport < WALL) {
    fruit.x = WALL + leftSupport;
    fruit.vx = Math.abs(fruit.vx) * RESTITUTION;
    if (applyRolling) fruit.angularVelocity += clamp(fruit.vy * 0.0015, -0.025, 0.025);
  }
  if (fruit.x + rightSupport > WIDTH - WALL) {
    fruit.x = WIDTH - WALL - rightSupport;
    fruit.vx = -Math.abs(fruit.vx) * RESTITUTION;
    if (applyRolling) fruit.angularVelocity -= clamp(fruit.vy * 0.0015, -0.025, 0.025);
  }
  if (fruit.y + bottomSupport > HEIGHT - WALL) {
    fruit.y = HEIGHT - WALL - bottomSupport;
    fruit.vy = -Math.abs(fruit.vy) * RESTITUTION;
    if (applyRolling) {
      fruit.angularVelocity += fruit.vx / Math.max(28, fruit.radius) * 0.045;
      fruit.angularVelocity = clamp(fruit.angularVelocity, -0.045, 0.045);
    }
    fruit.vx *= 0.94;
  }
}

function resolvePair(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;
  const aRadius = screwSupportRadius(a, nx, ny);
  const bRadius = screwSupportRadius(b, -nx, -ny);
  const minDistance = aRadius + bRadius + 0.8;

  if (distance >= minDistance) return;

  if (canMerge(a, b)) {
    mergeFruits(a, b);
    return;
  }

  const overlap = minDistance - distance;
  const totalRadius = aRadius + bRadius;
  const aShare = bRadius / totalRadius;
  const bShare = aRadius / totalRadius;

  a.x -= nx * overlap * aShare;
  a.y -= ny * overlap * aShare;
  b.x += nx * overlap * bShare;
  b.y += ny * overlap * bShare;

  const relativeVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relativeVelocity <= 0) {
    const impulse = -(1 + RESTITUTION) * relativeVelocity * 0.5;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }

  // Screw heads and shafts should have some contact friction. Without it,
  // the directional support shape lets one screw slide unrealistically along
  // another and fall straight through a stack.
  const tx = -ny;
  const ty = nx;
  const tangentVelocity = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
  const frictionImpulse = clamp(-tangentVelocity * 0.16, -0.7, 0.7);
  a.vx -= frictionImpulse * tx;
  a.vy -= frictionImpulse * ty;
  b.vx += frictionImpulse * tx;
  b.vy += frictionImpulse * ty;

}

function canMerge(a, b) {
  return a.level === b.level && a.mergeTimer === 0 && b.mergeTimer === 0;
}

function mergeFruits(a, b) {
  if (a.level === FRUITS.length - 1) {
    fruits = fruits.filter((fruit) => fruit.id !== a.id && fruit.id !== b.id);
    score += FRUITS[a.level].score * 2;
    scoreEl.textContent = score.toLocaleString("ja-JP");
    return;
  }

  const level = a.level + 1;
  const spec = FRUITS[level];
  const merged = {
    id: nextFruitId(),
    level,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    vx: (a.vx + b.vx) * 0.36,
    vy: (a.vy + b.vy) * 0.36 - 1.5,
    radius: spec.radius,
    angle: averageAngle(a.angle, b.angle),
    angularVelocity: (a.angularVelocity + b.angularVelocity) * 0.18,
    born: 14,
    mergeTimer: MERGE_COOLDOWN,
    lineTimer: Math.max(a.lineTimer, b.lineTimer),
  };
  fruits = fruits.filter((fruit) => fruit.id !== a.id && fruit.id !== b.id);
  fruits.push(merged);
  score += spec.score;
  scoreEl.textContent = score.toLocaleString("ja-JP");
}

function checkGameOver() {
  const danger = fruits.some((fruit) => fruit.lineTimer >= GAME_OVER_FRAMES);
  if (!danger) return;
  finishGame();
}

function finishGame() {
  if (gameOver) return;
  gameOver = true;
  finalScoreEl.textContent = score.toLocaleString("ja-JP");
  overlay.classList.remove("hidden");
}

function updateTimerDisplay() {
  const totalSeconds = Math.ceil(remainingTime);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  timerEl.textContent = minutes + ":" + seconds;
  timerEl.classList.toggle("urgent", totalSeconds <= 30);
}

function updateLineTimer(fruit, delta) {
  const topSupport = screwSupportRadius(fruit, 0, -1);
  const touchesLine = fruit.born === 0 && fruit.y - topSupport <= GAME_OVER_LINE;
  if (touchesLine) {
    fruit.lineTimer += delta;
    return;
  }
  fruit.lineTimer = Math.max(0, fruit.lineTimer - delta * 2);
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBoard();
  drawAim();
  for (const fruit of fruits) drawFruit(ctx, fruit.x, fruit.y, fruit.level, fruit.radius, fruit.born, 1, fruit.angle);
}

function drawBoard() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#fff8d8");
  gradient.addColorStop(1, "#ffeeb4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(250, 196, 93, 0.23)";
  for (let y = 0; y < HEIGHT; y += 36) {
    ctx.fillRect(WALL, y, WIDTH - WALL * 2, 1);
  }

  drawWood(0, 0, WALL, HEIGHT);
  drawWood(WIDTH - WALL, 0, WALL, HEIGHT);
  drawWood(0, HEIGHT - WALL, WIDTH, WALL);

  ctx.strokeStyle = "rgba(86, 44, 17, 0.62)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
  ctx.strokeStyle = "rgba(255, 222, 143, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WALL + 3, 0);
  ctx.lineTo(WALL + 3, HEIGHT - WALL);
  ctx.moveTo(WIDTH - WALL - 3, 0);
  ctx.lineTo(WIDTH - WALL - 3, HEIGHT - WALL);
  ctx.moveTo(WALL, HEIGHT - WALL - 3);
  ctx.lineTo(WIDTH - WALL, HEIGHT - WALL - 3);
  ctx.stroke();

  ctx.setLineDash([10, 12]);
  ctx.strokeStyle = "rgba(236, 70, 52, 0.62)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(WALL, GAME_OVER_LINE);
  ctx.lineTo(WIDTH - WALL, GAME_OVER_LINE);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWood(x, y, width, height) {
  const wood = ctx.createLinearGradient(x, y, x + width, y + height);
  wood.addColorStop(0, "#a95d27");
  wood.addColorStop(0.5, "#d0863d");
  wood.addColorStop(1, "#8d481d");
  ctx.fillStyle = wood;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(98, 49, 17, 0.32)";
  ctx.lineWidth = 2;
  if (height > width) {
    for (let yy = 20; yy < height; yy += 56) {
      ctx.beginPath();
      ctx.moveTo(x + 4, yy);
      ctx.quadraticCurveTo(x + width * 0.55, yy + 10, x + width - 4, yy + 2);
      ctx.stroke();
    }
  } else {
    for (let xx = 18; xx < width; xx += 56) {
      ctx.beginPath();
      ctx.moveTo(xx, y + 5);
      ctx.quadraticCurveTo(xx + 12, y + height * 0.52, xx + 2, y + height - 4);
      ctx.stroke();
    }
  }
}

function drawAim() {
  const spec = FRUITS[currentLevel];
  const preview = { level: currentLevel, radius: spec.radius, angle: -0.5 };
  const leftSupport = screwSupportRadius(preview, -1, 0);
  const rightSupport = screwSupportRadius(preview, 1, 0);
  const x = clamp(aimX, WALL + leftSupport, WIDTH - WALL - rightSupport);
  ctx.strokeStyle = "rgba(36, 69, 51, 0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 18);
  ctx.lineTo(x, HEIGHT - WALL);
  ctx.stroke();
  drawFruit(ctx, x, DROP_Y, currentLevel, spec.radius, 0, 0.6, preview.angle);
}

function drawFruit(targetCtx, x, y, level, radius, born = 0, alpha = 1, angle = -0.5) {
  const spec = FRUITS[level];
  const scale = born > 0 ? 1 + Math.sin(born * 0.55) * 0.06 : 1;
  const drawRadius = radius * scale;

  targetCtx.save();
  targetCtx.globalAlpha = alpha;
  targetCtx.translate(x, y);
  targetCtx.rotate(angle);

  drawThreadedShaft(targetCtx, spec, drawRadius);
  drawScrewHead(targetCtx, spec, drawRadius);

  targetCtx.restore();
}

function drawThreadedShaft(targetCtx, spec, drawRadius) {
  const shaftWidth = drawRadius * 0.5;
  const shaftLength = drawRadius * 1.55;
  const topY = -drawRadius * 0.04;
  const left = -shaftWidth * 0.5;
  const right = shaftWidth * 0.5;
  const threadBottom = topY + shaftLength;
  const tipY = threadBottom + drawRadius * 0.24;

  const shaft = targetCtx.createLinearGradient(left, 0, right, 0);
  shaft.addColorStop(0, "#394247");
  shaft.addColorStop(0.12, spec.edge);
  shaft.addColorStop(0.28, "#ffffff");
  shaft.addColorStop(0.45, spec.color);
  shaft.addColorStop(0.68, "#f8fbfc");
  shaft.addColorStop(0.86, spec.edge);
  shaft.addColorStop(1, "#30373b");
  targetCtx.fillStyle = shaft;

  targetCtx.beginPath();
  targetCtx.moveTo(left, topY);
  targetCtx.lineTo(right, topY);
  targetCtx.lineTo(right * 0.7, threadBottom);
  targetCtx.lineTo(0, tipY);
  targetCtx.lineTo(left * 0.7, threadBottom);
  targetCtx.closePath();
  targetCtx.fill();

  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.moveTo(left, topY);
  targetCtx.lineTo(right, topY);
  targetCtx.lineTo(right * 0.7, threadBottom);
  targetCtx.lineTo(0, tipY);
  targetCtx.lineTo(left * 0.7, threadBottom);
  targetCtx.closePath();
  targetCtx.clip();

  targetCtx.strokeStyle = "rgba(24, 30, 33, 0.62)";
  targetCtx.lineWidth = Math.max(1.5, drawRadius * 0.045);
  for (let y = topY + drawRadius * 0.08; y < threadBottom; y += drawRadius * 0.14) {
    targetCtx.beginPath();
    targetCtx.moveTo(left - drawRadius * 0.1, y + drawRadius * 0.15);
    targetCtx.bezierCurveTo(-drawRadius * 0.16, y - drawRadius * 0.1, drawRadius * 0.18, y - drawRadius * 0.1, right + drawRadius * 0.1, y + drawRadius * 0.15);
    targetCtx.stroke();

    targetCtx.strokeStyle = "rgba(255, 255, 255, 0.58)";
    targetCtx.lineWidth = Math.max(1, drawRadius * 0.022);
    targetCtx.beginPath();
    targetCtx.moveTo(left - drawRadius * 0.08, y + drawRadius * 0.04);
    targetCtx.bezierCurveTo(-drawRadius * 0.14, y - drawRadius * 0.2, drawRadius * 0.2, y - drawRadius * 0.2, right + drawRadius * 0.08, y + drawRadius * 0.04);
    targetCtx.stroke();
    targetCtx.strokeStyle = "rgba(24, 30, 33, 0.62)";
  }
  targetCtx.restore();

  targetCtx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  targetCtx.lineWidth = Math.max(1.2, drawRadius * 0.026);
  targetCtx.beginPath();
  targetCtx.moveTo(-shaftWidth * 0.18, topY + drawRadius * 0.08);
  targetCtx.lineTo(-shaftWidth * 0.06, threadBottom - drawRadius * 0.08);
  targetCtx.stroke();

  targetCtx.strokeStyle = "rgba(36, 42, 45, 0.68)";
  targetCtx.lineWidth = Math.max(1.3, drawRadius * 0.025);
  targetCtx.beginPath();
  targetCtx.moveTo(left * 0.7, threadBottom);
  targetCtx.lineTo(0, tipY);
  targetCtx.lineTo(right * 0.7, threadBottom);
  targetCtx.stroke();
}

function drawScrewHead(targetCtx, spec, drawRadius) {
  if (spec.head === "hexbolt") {
    drawHexBoltHead(targetCtx, spec, drawRadius);
    return;
  }
  if (spec.head === "pan") {
    drawPanHead(targetCtx, spec, drawRadius);
    return;
  }
  if (spec.head === "washer") {
    drawWasherHead(targetCtx, spec, drawRadius);
    return;
  }
  drawCountersunkHead(targetCtx, spec, drawRadius);
}

function drawCountersunkHead(targetCtx, spec, drawRadius) {
  const headY = -drawRadius * 0.2;
  const headWidth = drawRadius * 1.72;
  const headHeight = drawRadius * 0.58;
  const neckWidth = drawRadius * 0.62;
  const neckY = drawRadius * 0.28;

  const bevel = targetCtx.createLinearGradient(0, headY - headHeight, 0, neckY);
  bevel.addColorStop(0, "#ffffff");
  bevel.addColorStop(0.22, spec.shine);
  bevel.addColorStop(0.55, spec.color);
  bevel.addColorStop(1, spec.edge);
  targetCtx.fillStyle = bevel;
  targetCtx.beginPath();
  targetCtx.ellipse(0, headY, headWidth * 0.5, headHeight * 0.5, 0, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.fillStyle = "rgba(48, 53, 56, 0.2)";
  targetCtx.beginPath();
  targetCtx.moveTo(-headWidth * 0.48, headY);
  targetCtx.quadraticCurveTo(0, neckY + drawRadius * 0.15, headWidth * 0.48, headY);
  targetCtx.quadraticCurveTo(neckWidth * 0.5, neckY, 0, neckY);
  targetCtx.quadraticCurveTo(-neckWidth * 0.5, neckY, -headWidth * 0.48, headY);
  targetCtx.fill();

  targetCtx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  targetCtx.lineWidth = Math.max(1.4, drawRadius * 0.028);
  targetCtx.beginPath();
  targetCtx.ellipse(-drawRadius * 0.12, headY - drawRadius * 0.06, headWidth * 0.34, headHeight * 0.23, 0, Math.PI * 1.05, Math.PI * 1.86);
  targetCtx.stroke();

  drawRecessPair(targetCtx, spec.drive, drawRadius, headY);
}

function drawPanHead(targetCtx, spec, drawRadius) {
  const headY = -drawRadius * 0.18;
  const headWidth = drawRadius * 1.38;
  const headHeight = drawRadius * 0.72;
  const dome = targetCtx.createRadialGradient(-drawRadius * 0.28, headY - drawRadius * 0.25, drawRadius * 0.08, 0, headY, drawRadius);
  dome.addColorStop(0, spec.shine);
  dome.addColorStop(0.42, spec.color);
  dome.addColorStop(1, spec.edge);
  targetCtx.fillStyle = dome;
  targetCtx.beginPath();
  targetCtx.ellipse(0, headY, headWidth * 0.5, headHeight * 0.5, 0, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.strokeStyle = "rgba(28, 32, 35, 0.42)";
  targetCtx.lineWidth = Math.max(1.5, drawRadius * 0.035);
  targetCtx.stroke();
  drawRecessPair(targetCtx, spec.drive, drawRadius, headY);
}

function drawHexBoltHead(targetCtx, spec, drawRadius) {
  const headY = -drawRadius * 0.13;
  const headRadius = drawRadius * 0.78;
  const face = targetCtx.createLinearGradient(-headRadius, headY - headRadius, headRadius, headY + headRadius);
  face.addColorStop(0, spec.shine);
  face.addColorStop(0.42, spec.color);
  face.addColorStop(1, spec.edge);
  targetCtx.fillStyle = face;
  targetCtx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 6 + (i / 6) * Math.PI * 2;
    const x = Math.cos(angle) * headRadius;
    const y = headY + Math.sin(angle) * headRadius * 0.72;
    if (i === 0) targetCtx.moveTo(x, y);
    else targetCtx.lineTo(x, y);
  }
  targetCtx.closePath();
  targetCtx.fill();
  targetCtx.strokeStyle = "rgba(28, 32, 35, 0.48)";
  targetCtx.lineWidth = Math.max(2, drawRadius * 0.04);
  targetCtx.stroke();
  drawRecessPair(targetCtx, spec.drive, drawRadius, headY);
}

function drawWasherHead(targetCtx, spec, drawRadius) {
  const headY = -drawRadius * 0.15;
  const outer = drawRadius * 0.86;
  const inner = drawRadius * 0.33;
  const face = targetCtx.createRadialGradient(-drawRadius * 0.24, headY - drawRadius * 0.2, drawRadius * 0.08, 0, headY, outer);
  face.addColorStop(0, spec.shine);
  face.addColorStop(0.48, spec.color);
  face.addColorStop(1, spec.edge);
  targetCtx.fillStyle = face;
  targetCtx.beginPath();
  targetCtx.arc(0, headY, outer, 0, Math.PI * 2);
  targetCtx.arc(0, headY, inner, 0, Math.PI * 2, true);
  targetCtx.fill();
  targetCtx.strokeStyle = "rgba(28, 32, 35, 0.48)";
  targetCtx.lineWidth = Math.max(2, drawRadius * 0.04);
  targetCtx.beginPath();
  targetCtx.arc(0, headY, outer, 0, Math.PI * 2);
  targetCtx.arc(0, headY, inner, 0, Math.PI * 2);
  targetCtx.stroke();
}

function drawRecessPair(targetCtx, drive, drawRadius, headY) {
  targetCtx.strokeStyle = "rgba(32, 35, 36, 0.7)";
  targetCtx.lineCap = "round";
  targetCtx.lineWidth = Math.max(4, drawRadius * 0.13);
  drawDrive(targetCtx, drive, drawRadius, headY);
  targetCtx.strokeStyle = "rgba(255, 255, 255, 0.34)";
  targetCtx.lineWidth = Math.max(1.5, drawRadius * 0.035);
  targetCtx.save();
  targetCtx.translate(-drawRadius * 0.03, -drawRadius * 0.05);
  drawDrive(targetCtx, drive, drawRadius, headY);
  targetCtx.restore();
}

function drawCrossRecess(targetCtx, drawRadius, y) {
  targetCtx.beginPath();
  targetCtx.moveTo(-drawRadius * 0.4, y);
  targetCtx.lineTo(drawRadius * 0.4, y);
  targetCtx.moveTo(0, y - drawRadius * 0.25);
  targetCtx.lineTo(0, y + drawRadius * 0.25);
  targetCtx.stroke();
}

function drawDrive(targetCtx, drive, drawRadius, y) {
  if (drive === "minus") {
    targetCtx.beginPath();
    targetCtx.moveTo(-drawRadius * 0.42, y);
    targetCtx.lineTo(drawRadius * 0.42, y);
    targetCtx.stroke();
    return;
  }
  if (drive === "hex") {
    targetCtx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.PI / 6 + (i / 6) * Math.PI * 2;
      const x = Math.cos(angle) * drawRadius * 0.32;
      const yy = y + Math.sin(angle) * drawRadius * 0.32;
      if (i === 0) targetCtx.moveTo(x, yy);
      else targetCtx.lineTo(x, yy);
    }
    targetCtx.closePath();
    targetCtx.stroke();
    return;
  }
  if (drive === "ring") {
    targetCtx.beginPath();
    targetCtx.arc(0, y, drawRadius * 0.32, 0, Math.PI * 2);
    targetCtx.stroke();
    return;
  }
  drawCrossRecess(targetCtx, drawRadius, y);
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const spec = FRUITS[nextLevel];
  drawFruit(nextCtx, nextCanvas.width / 2, nextCanvas.height / 2 - 2, nextLevel, Math.min(24, spec.radius), 0);
}

function buildDebugButtons() {
  debugButtons.innerHTML = "";
  FRUITS.forEach((spec, level) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = spec.name;
    button.title = `${spec.name} を落とす`;
    button.addEventListener("click", () => spawnFruit(level, true));
    debugButtons.appendChild(button);
  });
}

function pointerX(event) {
  const rect = canvas.getBoundingClientRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  return ((clientX - rect.left) / rect.width) * WIDTH;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function screwSupportRadius(fruit, nx, ny) {
  const spec = FRUITS[fruit.level];
  const radius = fruit.radius;
  const cos = Math.cos(fruit.angle || 0);
  const sin = Math.sin(fruit.angle || 0);
  const localX = nx * cos + ny * sin;
  const localY = -nx * sin + ny * cos;

  const shaftTop = -radius * 0.04;
  const shaftLength = radius * 1.45;
  const shaftCenterY = shaftTop + shaftLength * 0.52;
  const shaftHalfWidth = radius * 0.26;
  const shaftHalfLength = shaftLength * 0.54;
  const shaftRound = radius * 0.08;
  const shaftSupport =
    shaftCenterY * localY +
    Math.abs(localX) * shaftHalfWidth +
    Math.abs(localY) * shaftHalfLength +
    shaftRound;

  const head = headCollisionShape(spec, radius);
  const headSupport =
    head.centerY * localY +
    Math.hypot(head.halfWidth * localX, head.halfHeight * localY);

  return Math.max(shaftSupport, headSupport);
}

function headCollisionShape(spec, radius) {
  if (spec.head === "hexbolt") {
    return { centerY: -radius * 0.13, halfWidth: radius * 0.78, halfHeight: radius * 0.56 };
  }
  if (spec.head === "washer") {
    return { centerY: -radius * 0.15, halfWidth: radius * 0.86, halfHeight: radius * 0.86 };
  }
  if (spec.head === "pan") {
    return { centerY: -radius * 0.18, halfWidth: radius * 0.69, halfHeight: radius * 0.36 };
  }
  return { centerY: -radius * 0.2, halfWidth: radius * 0.86, halfHeight: radius * 0.29 };
}

function averageAngle(a, b) {
  return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
}

function nextFruitId() {
  fruitId += 1;
  return fruitId;
}

function moveAim(event) {
  aimX = pointerX(event);
}

canvas.addEventListener("pointermove", moveAim);
canvas.addEventListener("pointerdown", (event) => {
  moveAim(event);
  spawnFruit();
});
canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
  moveAim(event);
}, { passive: false });
canvas.addEventListener("touchstart", (event) => {
  event.preventDefault();
  moveAim(event);
  spawnFruit();
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") aimX -= 28;
  if (event.key === "ArrowRight") aimX += 28;
  if (event.key === " " || event.key === "Enter") spawnFruit();
});

restartButton.addEventListener("click", resetGame);
playAgainButton.addEventListener("click", resetGame);
applyTimeButton.addEventListener("click", () => {
  timeLimitSeconds = Number(timeLimitSelect.value);
  resetGame();
});

buildDebugButtons();
resetGame();
