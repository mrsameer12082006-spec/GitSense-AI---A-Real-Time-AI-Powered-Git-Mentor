import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─────────────────────────────────────────────────────────
   Commit data for each workflow state
───────────────────────────────────────────────────────── */
const WORKFLOWS = {
  normal: [
    { id:'1', hash:'e39da01', author:'Sameer',  message:'init: setup express server',      branch:'main',         x:80,  y:150, status:'synced', date:'2m ago',  files:['package.json','server.js'],       explanation:'Initial repository structure and Express server setup. Verified and clean.', purpose: 'Establish base production server and application setup.' },
    { id:'2', hash:'fb7299a', author:'Kartik',  message:'feat: add database schema',       branch:'main',         x:200, y:150, status:'synced', date:'5m ago',  files:['models/User.js','db.js'],         explanation:'MongoDB user schema and authentication model definitions. Connectivity confirmed.', purpose: 'Define database schemas for data storage and modeling.' },
    { id:'3', hash:'a12bc8f', author:'Ayesh',   message:'feat: auth middleware base',      branch:'feature/auth', x:320, y:250, status:'synced', date:'10m ago', files:['middleware/auth.js'],              explanation:'JWT verification scaffold. Route protection layer initialised.', purpose: 'Scaffold middleware components for route safety and tokens.' },
    { id:'4', hash:'92cd99b', author:'Manik',   message:'fix: login router logic',         branch:'feature/auth', x:440, y:250, status:'synced', date:'12m ago', files:['routes/auth.js'],                  explanation:'Fixed validation bugs in the login route. Tested against edge cases.', purpose: 'Fix authentication router endpoints and error handling.' },
    { id:'5', hash:'7c3b28d', author:'Sameer',  message:'docs: update readme guidelines',  branch:'main',         x:360, y:150, status:'synced', date:'15m ago', files:['README.md'],                       explanation:'Documentation update: project layout and dev environment notes.', purpose: 'Provide installation, configuration, and API docs.' },
    { id:'6', hash:'9dfa002', author:'Ayesh',   message:'merge branch feature/auth',       branch:'main',         x:560, y:150, status:'synced', date:'18m ago', files:['server.js','routes/auth.js'],     explanation:'Authentication branch merged cleanly. All protected routes verified.', purpose: 'Merge feature/auth back into production-ready main branch.' },
  ],
  diverged: [
    { id:'1', hash:'e39da01', author:'Sameer',           message:'init: setup express server',     branch:'main',        x:80,  y:150, status:'synced', date:'30m ago', files:['package.json','server.js'],    explanation:'Base setup with config files.', purpose: 'Establish base production server and application setup.' },
    { id:'2', hash:'fb7299a', author:'Kartik',           message:'feat: add database schema',      branch:'main',        x:200, y:150, status:'synced', date:'25m ago', files:['models/User.js'],              explanation:'Mongoose model setup.', purpose: 'Define database schemas for data storage and modeling.' },
    { id:'3', hash:'c90b021', author:'Origin Developer', message:'feat: add rate limiting',        branch:'origin/main', x:350, y:80,  status:'remote', date:'10m ago', files:['middleware/rateLimit.js'],     explanation:'Rate limiting added remotely. Not yet pulled locally.', purpose: 'Scaffold API request limits to secure host resources.' },
    { id:'4', hash:'d71a990', author:'Origin Developer', message:'fix: cors whitelist update',     branch:'origin/main', x:480, y:80,  status:'remote', date:'8m ago',  files:['config/cors.js'],              explanation:'CORS credentials updated on GitHub. Overlaps with local config.', purpose: 'Patch CORS configurations for production domains.' },
    { id:'5', hash:'a12bc8f', author:'Ayesh',            message:'feat: auth middleware base',     branch:'main',        x:350, y:150, status:'local',  date:'5m ago',  files:['middleware/auth.js'],          explanation:'Your local commit. Needs remote sync before pushing.', purpose: 'Implement middleware endpoints for secure paths.' },
    { id:'6', hash:'92cd99b', author:'Manik',            message:'fix: login router logic',        branch:'main',        x:480, y:150, status:'local',  date:'2m ago',  files:['routes/auth.js'],              explanation:'Your local patch. Safe to push once origin merges.', purpose: 'Implement verification logic and routes.' },
  ],
  conflict: [
    { id:'1', hash:'e39da01', author:'Sameer',           message:'init: setup express server',     branch:'main',        x:80,  y:150, status:'synced', date:'1h ago',  files:['package.json'],    explanation:'Baseline setup.', purpose: 'Establish base production server and application setup.' },
    { id:'2', hash:'fb7299a', author:'Kartik',           message:'feat: add database schema',      branch:'main',        x:200, y:150, status:'synced', date:'50m ago', files:['models/User.js'],  explanation:'User models established.', purpose: 'Define database schemas for data storage and modeling.' },
    { id:'3', hash:'f44bb01', author:'Origin Developer', message:'feat: update jwt key configs',   branch:'origin/main', x:350, y:85,  status:'remote', date:'10m ago', files:['config.js'],       explanation:'Origin updated config.js to use process.env. Not yet locally merged.', purpose: 'Refactor configuration variables to environment variables.' },
    { id:'4', hash:'a12bc8f', author:'Ayesh',            message:'feat: add session timeout',      branch:'main',        x:350, y:215, status:'local',  date:'5m ago',  files:['config.js'],       explanation:'⚠️ Conflict: both branches edited config.js at the same lines.', purpose: 'Set idle timeout thresholds for token refresh keys.' },
  ],
};

/* ─────────────────────────────────────────────────────────
   Legend definitions per state
───────────────────────────────────────────────────────── */
const LEGENDS = {
  normal:   [{ color:'#7C5CFF', label:'main' }, { color:'#00D4FF', label:'feature/auth' }],
  diverged: [{ color:'#7C5CFF', label:'local (main)' }, { color:'#00D4FF', label:'origin/main', dashed:true }],
  conflict: [{ color:'#7C5CFF', label:'local (main)' }, { color:'#FF4B4B', label:'origin/main ⚠' }],
};

/* ─────────────────────────────────────────────────────────
   Path builder
───────────────────────────────────────────────────────── */
function Paths({ state }) {
  if (state === 'normal') return (
    <>
      <line x1={80} y1={150} x2={560} y2={150} stroke="url(#lineGrad)" strokeWidth={3.5} className="node-link" />
      <path d="M 200 150 C 260 150, 260 250, 320 250 L 440 250 C 500 250, 500 150, 560 150"
        fill="none" stroke="url(#cyanGrad)" strokeWidth={2.5} className="node-link" />
    </>
  );
  if (state === 'diverged') return (
    <>
      <line x1={80} y1={150} x2={480} y2={150} stroke="#7C5CFF" strokeWidth={3.5} />
      <path d="M 200 150 C 265 150, 285 80, 350 80 L 480 80"
        fill="none" stroke="#00D4FF" strokeWidth={2.5} strokeDasharray="5 3" opacity={0.7} />
    </>
  );
  if (state === 'conflict') return (
    <>
      <line x1={80} y1={150} x2={200} y2={150} stroke="#7C5CFF" strokeWidth={3.5} />
      <path d="M 200 150 C 265 150, 285 215, 350 215"
        fill="none" stroke="#7C5CFF" strokeWidth={3.5} />
      <path d="M 200 150 C 265 150, 285 85, 350 85"
        fill="none" stroke="#FF4B4B" strokeWidth={2.5} strokeDasharray="5 3" opacity={0.8} />
    </>
  );
  return null;
}

/* ─────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────── */
export default function GitGraph({ state = 'normal', onNodeSelect }) {
  const commits = WORKFLOWS[state] || WORKFLOWS.normal;

  // Reset selected node whenever state changes
  const [selectedNode, setSelectedNode] = useState(commits[commits.length - 1]);
  useEffect(() => {
    const latestNode = commits[commits.length - 1];
    setSelectedNode(latestNode);
    onNodeSelect?.(latestNode);
  }, [state]);   // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (node) => {
    setSelectedNode(node);
    onNodeSelect?.(node);
  };

  const legend = LEGENDS[state] ?? LEGENDS.normal;

  return (
    <div className="w-full gitgraph-card rounded-2xl p-4 min-h-[280px] relative overflow-hidden flex items-center justify-center shadow-lg shadow-black/25 backdrop-blur-sm transition-all duration-300">
      
      {/* Legend badge */}
      <div className="absolute top-3 left-3 flex gap-3 text-[10px] font-mono gitgraph-legend backdrop-blur px-3 py-1.5 rounded-lg z-10">
        {legend.map(({ color, label, dashed }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${dashed ? 'border border-dashed border-current' : ''}`}
              style={{ background: dashed ? 'transparent' : color, borderColor: color }}
            />
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      <svg
        viewBox="0 0 640 300"
        preserveAspectRatio="xMidYMid meet"
        className="w-full select-none"
        style={{ maxHeight: '280px' }}
      >
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#7C5CFF" />
            <stop offset="100%" stopColor="#00D4FF" />
          </linearGradient>
          <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#00D4FF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#7C5CFF" stopOpacity="0.85" />
          </linearGradient>
          <filter id="glowFilter" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Subtle grid */}
        <g stroke="var(--graph-grid)" strokeWidth={1}>
          {[50,100,150,200,250].map(y => <line key={`h${y}`} x1={0}   y1={y} x2={640} y2={y} />)}
          {[100,200,300,400,500,600].map(x => <line key={`v${x}`} x1={x} y1={0}   x2={x} y2={300} />)}
        </g>

        <Paths state={state} />

        {commits.map((node) => {
          const isSelected = selectedNode?.id === node.id;
          const isTip      = node.id === commits[commits.length - 1].id;

          let fill = '#7C5CFF';
          if (node.branch.includes('feature'))           fill = '#00D4FF';
          if (node.status === 'remote')                  fill = '#00D4FF';
          if (node.status === 'local')                   fill = '#7C5CFF';
          if (state === 'conflict' && node.status === 'remote') fill = '#FF4B4B';

          return (
            <g key={node.id} className="cursor-pointer">
              {/* Pulse ring on latest tip */}
              {isTip && (
                <circle
                  key="tip-pulse"
                  cx={node.x}
                  cy={node.y}
                  r={12}
                  fill="none"
                  stroke={fill}
                  strokeWidth={1.5}
                  opacity={0.4}
                >
                  <animate attributeName="r"       values="8;20;8"   dur="2.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2.8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Selected glow */}
              {isSelected && (
                <circle
                  key="selected-glow"
                  cx={node.x}
                  cy={node.y}
                  r={15}
                  fill={fill}
                  opacity={0.18}
                  filter="url(#glowFilter)"
                  className="pointer-events-none"
                />
              )}

              {/* Hover backdrop glow */}
              <circle
                key="hover-backdrop"
                cx={node.x}
                cy={node.y}
                r={16}
                fill="transparent"
                className="hover:fill-white/[0.04] transition-colors duration-200"
                onClick={() => handleClick(node)}
              />

              {/* Main node */}
              <circle
                key="main-node"
                cx={node.x}
                cy={node.y}
                r={isSelected ? 9 : 6.5}
                fill={fill}
                stroke={isSelected ? 'var(--graph-node-selected-stroke)' : 'var(--graph-node-stroke)'}
                strokeWidth={isSelected ? 2.5 : 2}
                className="node-circle hover:scale-125 transition-transform duration-200"
                onClick={() => handleClick(node)}
              />

              {/* Hash label */}
              <text
                x={node.x} y={node.y - 16}
                fill="#64748B" fontSize="8.5"
                fontFamily="'Fira Code', monospace"
                textAnchor="middle"
                className="pointer-events-none font-medium"
              >
                {node.hash}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
