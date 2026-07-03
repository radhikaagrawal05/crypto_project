import React, { useState } from 'react';
import axios from 'axios';
import { ContextInfo } from './components/ContextInfo';
import { ObserverAgent } from './components/ObserverAgent';
import { VerifierAgent } from './components/VerifierAgent';
import { NetworkChannel } from './components/NetworkChannel';
import { LogsPanel } from './components/LogsPanel';
import { RotateCcw } from 'lucide-react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function App() {
  const [cryptoData, setCryptoData] = useState({
    commitment: '',
    nonce: '',
    challenge: '',
    proof: '',
    verified: null,
    details: ''
  });
  const [mapData, setMapData] = useState(null);
  const [step, setStep] = useState(0);
  const [logs, setLogs] = useState([]);
  const [customConfig, setCustomConfig] = useState({
    startX: '',
    startY: '',
    goalX: '',
    goalY: '',
    traps: '',
    path: '',
    autoPath: true
  });

  const addLog = (msg, highlight = false) => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" }), msg, highlight }]);
  };

  const handleGenerateTask = async () => {
    try {
      // Always build a payload from current form values so backend does not fall back silently.
      let payload;
      try {
        // Parse traps from a simple "row,col; row,col" or line-separated format.
        // Be forgiving: ignore malformed entries instead of throwing immediately.
        let traps = [];
        if (customConfig.traps.trim()) {
          const rawEntries = customConfig.traps
            .split(/[;\n]/)
            .map(pair => pair.trim())
            .filter(pair => pair.length > 0);

          for (const pair of rawEntries) {
            const parts = pair.split(',');
            if (parts.length !== 2) continue;
            const [rowStr, colStr] = parts.map(p => p.trim());
            const row = Number(rowStr);
            const col = Number(colStr);
            if (Number.isNaN(row) || Number.isNaN(col)) continue;
            const x = col;
            const y = row;
            traps.push({ x, y });
          }
        }

        let path = undefined;
        if (!customConfig.autoPath && customConfig.path.trim()) {
          path = JSON.parse(customConfig.path);
        }

        payload = {
          environment: {
            gridSize: { width: 4, height: 4 },
            // Inputs are (row, col); internal uses (x, y) = (col, row)
            start: { x: Number(customConfig.startY) || 0, y: Number(customConfig.startX) || 0 },
            goal: { x: Number(customConfig.goalY) || 0, y: Number(customConfig.goalX) || 0 },
            traps
          },
          ...(path ? { path } : {})
        };
      } catch (e) {
        addLog("Invalid traps or path input. Use 'row,col; row,col' for traps and valid JSON for manual path.", true);
        return;
      }

      const { data } = await axios.post(`${API_URL}/generate-task`, payload);
      // Attach computed path to mapData so the Map component can render it
      setMapData({ ...data.environment, path: data.path });
      setCryptoData(prev => ({ ...prev, commitment: data.commitment, nonce: data.nonce, verified: null, details: '' }));
      addLog("Observer solved constraints secretly. Generated Nonce and SHA256 Hash Commitment.");
      addLog(`Sending Commitment to Verifier: ${data.commitment}`, true);
      setStep(1);
    } catch (err) {
      console.error("Backend Error:", err);
      addLog("Failed to reach simulation engine. Is Backend running on Port 5000?");
    }
  };

  const handleRequestChallenge = async () => {
    try {
      const { data } = await axios.post(`${API_URL}/challenge`);
      setCryptoData(prev => ({ ...prev, challenge: data.challenge }));
      addLog("Verifier received Commitment. Enforcing non-interactive ZKP via Fiat-Shamir.");
      addLog(`Verifier computing random 64-bit Challenge query: ${data.challenge}`, true);
      addLog("Challenge sent to Observer.");
      setStep(2);
    } catch (err) {
      console.error(err);
      addLog("Failed to generate Challenge vector.");
    }
  };

  const handleGenerateProof = async () => {
    try {
      const { data } = await axios.post(`${API_URL}/proof`);
      setCryptoData(prev => ({ ...prev, proof: data.proof }));
      addLog("Observer received Challenge. Re-routing through HMAC-SHA256 with hidden mapping data.");
      addLog(`Observer generated HMAC Proof ZKP Response without data disclosure.`, true);
      addLog("Proof submitted to network channel.");
      setStep(3);
    } catch (err) {
      console.error(err);
      addLog("Failed to produce cryptographic proof.");
    }
  };

  const handleVerify = async () => {
    try {
      const { data } = await axios.post(`${API_URL}/verify`, { proof: cryptoData.proof });
      setCryptoData(prev => ({ ...prev, verified: data.verified, details: data.details }));
      addLog("Verifier received Proof from channel. Auditing signature...", true);
      addLog(`Verdict: ${data.verified ? 'ACCEPT' : 'REJECT'} | Constraints successfully computed via HMAC.`);
      setStep(4);
    } catch (err) {
      console.error(err);
      addLog("Failed to run verification logic.");
    }
  };
  
  const handleRestart = () => {
    setStep(0);
    setMapData(null);
    setCryptoData({ commitment: '', nonce: '', challenge: '', proof: '', verified: null, details: '' });
    setLogs([]);
    addLog("Demo reset. Ready for new protocol sequence.");
  };

  return (
    <div className="app-wrapper">
      <header>
        <h1>Zero-Knowledge Task Verification</h1>
        <p>Interactive Cryptographic Protocol Simulator</p>
      </header>
      
      <ContextInfo />

      <div className="custom-config-panel glass-panel" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Custom Map Configuration (Optional)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
          You can let the backend auto-generate the entire map, or provide your own start, goal, and traps.
          By default, the Observer will automatically compute a safe path that avoids traps.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Start (row, col)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="number"
                placeholder="row"
                value={customConfig.startX}
                onChange={e => setCustomConfig(cfg => ({ ...cfg, startX: e.target.value }))}
              />
              <input
                type="number"
                placeholder="col"
                value={customConfig.startY}
                onChange={e => setCustomConfig(cfg => ({ ...cfg, startY: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Goal (row, col)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="number"
                placeholder="row"
                value={customConfig.goalX}
                onChange={e => setCustomConfig(cfg => ({ ...cfg, goalX: e.target.value }))}
              />
              <input
                type="number"
                placeholder="col"
                value={customConfig.goalY}
                onChange={e => setCustomConfig(cfg => ({ ...cfg, goalY: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Traps (as "row,col; row,col")</label>
            <textarea
              rows={3}
              placeholder='1,1; 2,3; 3,0'
              value={customConfig.traps}
              onChange={e => setCustomConfig(cfg => ({ ...cfg, traps: e.target.value }))}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Path</label>
            <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="checkbox"
                  checked={customConfig.autoPath}
                  onChange={e => setCustomConfig(cfg => ({ ...cfg, autoPath: e.target.checked }))}
                />
                Let Observer auto-generate a safe path
              </label>
            </div>
            {!customConfig.autoPath && (
              <textarea
                rows={3}
                placeholder='[{"x":0,"y":0},{"x":1,"y":0},{"x":2,"y":0}]'
                value={customConfig.path}
                onChange={e => setCustomConfig(cfg => ({ ...cfg, path: e.target.value }))}
                style={{ width: '100%', resize: 'vertical' }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="agents-grid">
        <ObserverAgent 
           step={step} 
           mapData={mapData} 
           cryptoData={cryptoData} 
           onGenerateTask={handleGenerateTask} 
           onGenerateProof={handleGenerateProof} 
        />
        
        <NetworkChannel step={step} cryptoData={cryptoData} />

        <VerifierAgent 
           step={step} 
           mapData={mapData} 
           cryptoData={cryptoData} 
           onRequestChallenge={handleRequestChallenge} 
           onVerify={handleVerify} 
        />
      </div>

      <LogsPanel logs={logs} />
      
      <div style={{textAlign: 'center', marginTop: '3rem'}}>
         <button onClick={handleRestart} style={{background:'rgba(255,255,255,0.05)', color: 'var(--text-dim)', border:'1px solid var(--card-border)', padding:'0.75rem 2rem', borderRadius:'30px', cursor:'pointer', fontWeight:500, transition:'all 0.2s ease', display: 'inline-flex', alignItems: 'center', gap: '0.5rem'}} onMouseOver={(e)=>e.currentTarget.style.color='var(--text-main)'} onMouseOut={(e)=>e.currentTarget.style.color='var(--text-dim)'}>
            <RotateCcw size={16}/> Reset Simulation Protocol
         </button>
      </div>
    </div>
  );
}

export default App;
