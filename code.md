# Zero-Knowledge Proof (ZKP) Task Verification - Codebase Guide

This document is a complete walkthrough of the **Zero-Knowledge Task Verification Simulation** codebase. Use this guide if you need to understand how the internal code actually functions, how the cryptography works, or if you need to explain the project architecture to a professor or peer.

---

## 1. High-Level Architecture

The project is split into two independent domains interacting with each other via HTTP REST API.

1. **`backend/` (Node.js + Express):** Acts as the authoritative "Simulation Engine." It literally performs the cryptographic Math, handles the memory state between phases, and builds out the hidden maps.
2. **`frontend/` (React + Vite):** Acts as the visual "Dashboard." It has no idea what the secret answers are; it only issues commands to the backend API and visualizes the Hash tokens it receives on screen.

---

## 2. Exploring the Backend Code (`/backend`)

The backend holds the magic of the Cryptography execution. It's built cleanly into modular folders.

### `backend/server.js`
This is the root API server running on **Port 5000**. It wires together the cryptographic primitives and the map/constraint logic and exposes a 4-step REST API that the frontend drives.

- **In-memory state**
  - **`currentTask`**: Stores the current environment (grid size, start, goal, traps), the secret path (stringified), a nonce, and timestamp for the active protocol run.
  - **`currentCommitment`**: Last commitment hash issued.
  - **`currentChallenge`**: Last challenge string issued.

- **Routes**
  1. **`POST /api/generate-task` – Task creation & commitment**
     - Accepts an optional JSON body from the frontend:
       - **`environment`**: User-chosen grid configuration (`gridSize`, `start`, `goal`, `traps`).
       - **`path`** (optional): A full path array; if omitted, the backend computes a valid path automatically using `findPath`.
     - If no `environment` is supplied, it falls back to `simulateEnvironment()` (built-in 4x4 demo).
     - Validates that the chosen path does not intersect any traps using `validatePathConstraints`.
     - Generates:
       - a cryptographic **nonce** via `generateNonce()`
       - a **commitment** to the secret path via `generateCommitment(pathString, nonce)`
     - Stores this in `currentTask` and responds with:
       - `commitment`, `nonce`, the `environment`, and the actual `path` (for Observer-side visualisation only; it is *not* used by the Verifier directly).

  2. **`POST /api/challenge` – Verifier issues a challenge**
     - Requires a prior commitment (`currentCommitment` must be set).
     - Uses `generateChallenge()` to create a random 64‑bit hex challenge string.
     - Saves it in `currentChallenge` and sends it to the frontend as the verifier → observer challenge.

  3. **`POST /api/proof` – Observer computes a proof**
     - Requires both `currentTask` and `currentChallenge`.
     - Recomputes a zero-knowledge style proof with:
       - `generateProof(currentTask.secretPath, currentChallenge, currentTask.timestamp)`
     - Returns the `proof` to the frontend; this models the Observer sending a proof back to the Verifier without revealing the raw path.

  4. **`POST /api/verify` – Verifier checks proof and constraints**
     - Accepts `proof` from the frontend.
     - Uses `verifyHMACProof` to re‑derive and compare the expected proof from:
       - `currentTask.secretPath`, `currentChallenge` and `currentTask.timestamp`.
     - Separately, revalidates the path against the traps via `validatePathConstraints`.
     - Responds with:
       - `verified` flag, human‑readable `result`, and `details` describing why verification passed or failed.

---

### `backend/crypto/zkp.js`
This file is the absolute core of the **Cryptography Simulation**. It imports Node's native `crypto` library to execute the protocol logic.

* **`generateNonce()`:** 
  Creates a 16-byte random hex string. This acts as a random salt so that the same map path doesn't result in the same identical hash every time (thwarting attackers trying to guess the path).
* **`generateCommitment(solution, nonce)`:**
  This uses `crypto.createHash('sha256')`. This acts as the *Hiding Phase* mechanism in ZKP. The Observer binds themselves to a specific answer without showing it.
* **`generateProof(secretSolution, challenge, timestamp)`:**
  Since true SNARKs (Complex Math Polynomials) are too heavy for a simple demo, we simulate Fiat-Shamir non-interactive proofs using **HMAC-SHA256**. The original `secretSolution` is signed against the newly provided `challenge` key. 
* **`verifyHMACProof()`:**
  The Verifier assesses the HMAC proof returned to verify its authenticity.

---

### `backend/protocol/verifier.js`
This module defines the “map world” and the rules that a valid solution must respect.

- **`simulateEnvironment()`**  
  - Builds a default 4×4 grid environment for the demo:
    - `gridSize`: width/height (4×4),
    - `start`: fixed starting cell,
    - `goal`: fixed destination cell,
    - `traps`: a fixed list of dangerous coordinates that must be avoided.
  - Used when the user does not provide their own environment in `/api/generate-task`.

- **`validatePathConstraints(path, traps)`**  
  - Input: `path` (array of `{x, y}` steps) and `traps` (array of `{x, y}`).
  - For each step in the path it checks if any coordinate coincides with a trap.
  - Returns:
    - `false` immediately if the path ever hits a trap (constraint violation).
    - `true` if the entire path is trap‑free.
  - This simulates the Verifier checking high‑level task constraints without needing to reveal the traps to the observer.

- **`findPath(environment)`**  
  - Computes a **shortest path** (minimum number of steps) from `start` to `goal` in the grid, avoiding all trap cells.
  - Strategy:
    - Uses **Breadth‑First Search (BFS)** over the grid as an unweighted graph, which guarantees minimum distance when all moves cost 1.
    - Treats the grid as nodes `(x, y)` with edges to up/down/left/right neighbours that:
      - stay within bounds, and
      - are not in the trap set.
    - Reconstructs the path by remembering a `prev` pointer for each visited cell and walking backwards from `goal` to `start`.
  - Returns:
    - An ordered array of `{x, y}` cells from start to goal, or
    - `null` if no trap‑free path exists (in which case the server rejects task generation).

---

## 3. Exploring the Frontend Code (`/frontend`)

The frontend is built using **React**. It maintains beautiful "Agents" panels and fires off commands via `axios`.

### `frontend/src/App.jsx`
This is the master **State Machine** and layout controller for the entire React app.

- **Core state**
  - **`cryptoData`**: Tracks the cryptographic artefacts (`commitment`, `nonce`, `challenge`, `proof`, `verified`, `details`).
  - **`mapData`**: Holds the current environment sent back from the backend (`gridSize`, `start`, `goal`, `traps`, plus the computed `path` used for visualising the Observer’s secret).
  - **`step`**: Integer from 0–4 describing which phase of the protocol we are in (commit, challenge, proof, verify).
  - **`logs`**: Rich textual log entries rendered in `LogsPanel` for a terminal‑style explanation of what just happened.
  - **`customConfig`**: Form state backing the “Custom Map Configuration” panel:
    - `startX`, `startY`, `goalX`, `goalY` (entered as **row, col**),
    - `traps` (a simple string like `"1,1; 2,2; 3,1"` or one `row,col` per line),
    - `autoPath` (boolean) and optional raw `path` JSON when the user wants to specify a path manually.

- **Key handlers**
  - **`handleGenerateTask()`**
    - Reads the custom configuration form.
    - Parses traps from a human‑friendly `row,col; row,col` string into `{x, y}` coordinates (with `x = col`, `y = row` to match the grid renderer).
    - Optionally parses a manual `path` JSON if `autoPath` is disabled.
    - Builds an `environment` object and sends it to `POST /api/generate-task`.
    - On success:
      - updates `mapData` with `environment` plus the returned `path`,
      - updates `cryptoData` with `commitment` and `nonce`,
      - appends explanatory log lines and advances `step` to 1.

  - **`handleRequestChallenge()`**
    - Calls `POST /api/challenge`.
    - Stores the `challenge` into `cryptoData`, logs the verifier’s challenge creation, and advances `step` to 2.

  - **`handleGenerateProof()`**
    - Calls `POST /api/proof`.
    - Saves the returned `proof` in `cryptoData`, logs that the Observer responded with an HMAC‑based proof, and advances `step` to 3.

  - **`handleVerify()`**
    - Calls `POST /api/verify` with the current `proof`.
    - Logs and stores whether verification succeeded and any additional `details`, then moves to `step` 4.

  - **`handleRestart()`**
    - Resets all state back to the initial configuration and logs that the simulation has been reset.

- **Layout**
  - Renders:
    - The context explanation (`ContextInfo`),
    - The custom configuration form,
    - The three main columns: `ObserverAgent`, `NetworkChannel`, `VerifierAgent`,
    - And the `LogsPanel` plus a reset button.

### `frontend/src/index.css`
This file contains all formatting. 
There is no Tailwind or Bootstrap. The UI relies strictly on raw vanilla CSS configurations:
* **`--bg-gradient`**: Forms the beautiful deep-slate galaxy background.
* **`.agent-col` & `.module`**: Implements the advanced `backdrop-filter: blur(20px)` setting allowing the translucent glassmorphism look to work.

### Component Breakdown (`/frontend/src/components/`)
To keep the React code highly readable, everything was broken into unique isolated components:

1. **`ContextInfo.jsx`**  
   - Static text panel at the top of the page.
   - Explains the real‑world intuition behind the ZKP demo and what each agent represents.

2. **`ObserverAgent.jsx`**  
   - Left‑hand column (pink accent).
   - Shows:
     - The Observer’s view of the map via `Map` with `isVerifierView={false}` (all traps and the secret path are visible).
     - Cryptographic state: current commitment and nonce.
     - Phase buttons:
       - **Phase 1**: “GENERATE & COMMIT” wired to `onGenerateTask`.
       - **Phase 3**: “COMPUTE MAC ZKP” wired to `onGenerateProof`.

3. **`VerifierAgent.jsx`**  
   - Right‑hand column (cyan accent).
   - Uses the same `Map` component with `isVerifierView={true}`:
     - Start and goal are visible, but traps and the path are hidden/obscured to mimic a blind verification.
   - Shows challenge and verification status.
   - Phase buttons:
     - **Phase 2**: “REQUEST CHALLENGE” wired to `onRequestChallenge`.
     - **Phase 4**: “VERIFY PROOF” wired to `onVerify`.

4. **`Map.jsx`**  
   - Renders the grid based on `mapData.gridSize`.
   - For each cell `(x, y)`:
     - Marks `S` (start) and `G` (goal),
     - Marks `T` for trap cells (only when `isVerifierView` is false),
     - Marks `✓` for cells that are part of the secret path using `mapData.path`.
   - In verifier view, hides internal structure for non‑start/goal cells by using a neutral “hidden” style, preserving the zero‑knowledge flavour.

5. **`NetworkChannel.jsx`**  
   - Middle animated column showing packet‑like visuals moving between Observer and Verifier.
   - Reads the current `step` and `cryptoData` to decide direction (Observer → Verifier or Verifier → Observer) and labels for the packets (e.g. commitment, challenge, proof).

6. **`LogsPanel.jsx`**  
   - Bottom terminal‑style panel.
   - Displays time‑stamped log events appended by `addLog` in `App.jsx`, allowing the user to follow the protocol transcript in plain English.

7. **`CryptoPanel.jsx` (if present in your version)**  
   - A supplemental component that can visualise individual cryptographic artefacts (hashes, HMAC, nonces) in a compact card layout.
   - Not essential to the core protocol, but useful for explaining each field to a reader.

---

## Summary of the Protocol Flow in Code

When someone asks "How does it work?", explain this specific execution chain:

1. **(Frontend) `App.jsx: handleGenerateTask()`** is clicked.
2. **(Backend) `server.js: /api/generate-task`** generates the secret Traps (`verifier.js`).
3. **(Backend) `zkp.js`** hashes the Secret Traps using SHA-256 to create a `commitment` string.
4. **(Frontend)** Map updates, Network packet UI visualizes the Commitment hash heading to the Verifier.
5. **(Frontend) `App.jsx: handleRequestChallenge()`** is clicked.
6. **(Backend) `server.js: /api/challenge`** creates a random hex token.
7. **(Frontend)** Network packet UI visualizes the random Hex Token heading back to the Observer.
8. **(Frontend) `App.jsx: handleGenerateProof()`** is clicked.
9. **(Backend) `zkp.js: generateProof()`** produces an HMAC token mixing the Secret Data and the Challenge hex.
10. **(Frontend) `App.jsx: handleVerify()`** is clicked.
11. **(Backend) `server.js: /api/verify`** checks the math behind the HMAC. If it's pure, we conclude the Zero Knowledge parameters were met!
