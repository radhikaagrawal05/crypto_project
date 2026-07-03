/**
 * Verifier Simulation
 * Simulates checking constraints for Zero-Knowledge Verification
 *
 * It generates an environment and checks whether the path meets the requirement
 * without giving away the exact locations to unauthorized elements.
 */

// Generate a 4x4 grid with some simulated hidden traps
function simulateEnvironment() {
  const traps = [
    {x: 1, y: 1},
    {x: 2, y: 3},
    {x: 3, y: 0}
  ];

  return {
    gridSize: { width: 4, height: 4 },
    start: { x: 0, y: 0 },
    goal: { x: 2, y: 2 },
    traps
  };
}

// Check Constraint: The path must never touch a trap
function validatePathConstraints(path, traps) {
  // We assume the path is an array of coordinates: [{x, y}, {x, y}]
  // Check intersection
  for (const step of path) {
    for (const trap of traps) {
      if (step.x === trap.x && step.y === trap.y) {
        return false; // Constraint Failed: Hit a trap
      }
    }
  }
  return true; // Path avoids traps
}

// Shortest path finder using BFS (each step has equal weight = 1).
// On a grid with uniform edge weights, this yields a minimum-distance path.
function findPath(environment) {
  const { gridSize, start, goal, traps } = environment;
  if (!gridSize || !start || !goal) return null;

  const width = gridSize.width;
  const height = gridSize.height;
  const trapSet = new Set(traps.map(t => `${t.x},${t.y}`));

  const inBounds = (x, y) =>
    x >= 0 && x < width && y >= 0 && y < height && !trapSet.has(`${x},${y}`);

  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;

  if (!inBounds(start.x, start.y) || !inBounds(goal.x, goal.y)) {
    return null;
  }

  const queue = [];
  const visited = new Set();
  const prev = new Map();

  queue.push(startKey);
  visited.add(startKey);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === goalKey) break;

    const [cx, cy] = current.split(',').map(Number);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (!inBounds(nx, ny) || visited.has(key)) continue;
      visited.add(key);
      prev.set(key, current);
      queue.push(key);
    }
  }

  if (!visited.has(goalKey)) {
    return null;
  }

  const path = [];
  let cur = goalKey;
  while (cur) {
    const [x, y] = cur.split(',').map(Number);
    path.push({ x, y });
    cur = prev.get(cur);
  }
  path.reverse();
  return path;
}

module.exports = {
  simulateEnvironment,
  validatePathConstraints,
  findPath
};
