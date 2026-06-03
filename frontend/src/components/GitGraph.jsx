import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─────────────────────────────────────────────────────────
   Commit data for each workflow state
───────────────────────────────────────────────────────── */
const WORKFLOWS = {
  normal: [
    { id:'1', hash:'e39da01', author:'Sameer',  message:'init: setup express server',      branch:'main',         x:80,  y:150, status:'synced', date:'2m ago',  files:['package.json','server.js'],       explanation:'Initial repository structure and Express server setup. Verified and clean.' },
    { id:'2', hash:'fb7299a', author:'Kartik',  message:'feat: add database schema',       branch:'main',         x:200, y:150, status:'synced', date:'5m ago',  files:['models/User.js','db.js'],         explanation:'MongoDB user schema and authentication model definitions. Connectivity confirmed.' },
    { id:'3', hash:'a12bc8f', author:'Ayesh',   message:'feat: auth middleware base',      branch:'feature/auth', x:320, y:250, status:'synced', date:'10m ago', files:['middleware/auth.js'],              explanation:'JWT verification scaffold. Route protection layer initialised.' },
    { id:'4', hash:'92cd99b', author:'Manik',   message:'fix: login router logic',         branch:'feature/auth', x:440, y:250, status:'synced', date:'12m ago', files:['routes/auth.js'],                  explanation:'Fixed validation bugs in the login route. Tested against edge cases.' },
    { id:'5', hash:'7c3b28d', author:'Sameer',  message:'docs: update readme guidelines',  branch:'main',         x:360, y:150, status:'synced', date:'15m ago', files:['README.md'],                       explanation:'Documentation update: project layout and dev environment notes.' },
    { id:'6', hash:'9dfa002', author:'Ayesh',   message:'merge branch feature/auth',       branch:'main',         x:560, y:150, status:'synced', date:'18m ago', files:['server.js','routes/auth.js'],     explanation:'Authentication branch merged cleanly. All protected routes verified.' },
  ],
  diverged: [
    { id:'1', hash:'e39da01', author:'Sameer',           message:'init: setup express server',     branch:'main',        x:80,  y:150, status:'synced', date:'30m ago', files:['package.json','server.js'],    explanation:'Base setup with config files.' },
    { id:'2', hash:'fb7299a', author:'Kartik',           message:'feat: add database schema',      branch:'main',        x:200, y:150, status:'synced', date:'25m ago', files:['models/User.js'],              explanation:'Mongoose model setup.' },
    { id:'3', hash:'c90b021', author:'Origin Developer', message:'feat: add rate limiting',        branch:'origin/main', x:350, y:80,  status:'remote', date:'10m ago', files:['middleware/rateLimit.js'],     explanation:'Rate limiting added remotely. Not yet pulled locally.' },
    { id:'4', hash:'d71a990', author:'Origin Developer', message:'fix: cors whitelist update',     branch:'origin/main', x:480, y:80,  status:'remote', date:'8m ago',  files:['config/cors.js'],              explanation:'CORS credentials updated on GitHub. Overlaps with local config.' },
    { id:'5', hash:'a12bc8f', author:'Ayesh',            message:'feat: auth middleware base',     branch:'main',        x:350, y:150, status:'local',  date:'5m ago',  files:['middleware/auth.js'],          explanation:'Your local commit. Needs remote sync before pushing.' },
    { id:'6', hash:'92cd99b', author:'Manik',            message:'fix: login router logic',        branch:'main',        x:480, y:150, status:'local',  date:'2m ago',  files:['routes/auth.js'],              explanation:'Your local patch. Safe to push once origin merges.' },
  ],
  conflict: [
    { id:'1', hash:'e39da01', author:'Sameer',           message:'init: setup express server',     branch:'main',        x:80,  y:150, status:'synced', date:'1h ago',  files:['package.json'],    explanation:'Baseline setup.' },
    { id:'2', hash:'fb7299a', author:'Kartik',           message:'feat: add database schema',      branch:'main',        x:200, y:150, status:'synced', date:'50m ago', files:['models/User.js'],  explanation:'User models established.' },
    { id:'3', hash:'f44bb01', author:'Origin Developer', message:'feat: update jwt key configs',   branch:'origin/main', x:350, y:85,  status:'remote', date:'10m ago', files:['config.js'],       explanation:'Origin updated config.js to use process.env. Not yet locally merged.' },
    { id:'4', hash:'a12bc8f', author:'Ayesh',            message:'feat: add session timeout',      branch:'main',        x:350, y:215, status:'local',  date:'5m ago',  files:['config.js'],       explanation:'⚠️ Conflict: both branches edited config.js at the same lines.' },
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
    setSelectedNode(commits[commits.length - 1]);
  }, [state]);   // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (node) => {
    setSelectedNode(node);
    onNodeSelect?.(node);
  };

  const legend = LEGENDS[state] ?? LEGENDS.normal;

  return (
    <div className="flex flex-col lg:flex-row gap-5 w-full items-stretch">

      {/* ── SVG Canvas ── */}
      <div className="flex-1 bg-slate-900/35 border border-white/[0.07] rounded-2xl p-4 min-h-[240px] relative overflow-hidden flex items-center justify-center">

        {/* Legend badge */}
        <div className="absolute top-3 left-3 flex gap-3 text-[10px] font-mono bg-slate-950/80 backdrop-blur border border-white/[0.07] px-3 py-1.5 rounded-lg z-10">
          {legend.map(({ color, label, dashed }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${dashed ? 'border border-dashed border-current' : ''}`}
                style={{ background: dashed ? 'transparent' : color, borderColor: color }}
              />
              <span style={{ color: '#94A3B8' }}>{label}</span>
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
          <g stroke="rgba(255,255,255,0.025)" strokeWidth={1}>
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
              <g key={node.id}>
                {/* Pulse ring on latest tip */}
                {isTip && (
                  <circle cx={node.x} cy={node.y} r={12} fill="none" stroke={fill} strokeWidth={1.5} opacity={0.4}>
                    <animate attributeName="r"       values="8;20;8"   dur="2.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0;0.6" dur="2.8s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Selected glow */}
                {isSelected && (
                  <circle cx={node.x} cy={node.y} r={15} fill={fill} opacity={0.18} filter="url(#glowFilter)" />
                )}

                {/* Main node */}
                <circle
                  cx={node.x} cy={node.y}
                  r={isSelected ? 9 : 6.5}
                  fill={fill}
                  stroke={isSelected ? '#F8FAFC' : '#0B1020'}
                  strokeWidth={isSelected ? 2.5 : 2}
                  className="node-circle"
                  onClick={() => handleClick(node)}
                />

                {/* Hash label */}
                <text
                  x={node.x} y={node.y - 16}
                  fill="#64748B" fontSize="8.5"
                  fontFamily="'Fira Code', monospace"
                  textAnchor="middle"
                  className="pointer-events-none"
                >
                  {node.hash}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Detail Sidebar ── */}
      <div className="w-full lg:w-[270px] bg-slate-900/50 border border-white/[0.07] rounded-2xl p-5
                      flex flex-col gap-4 relative overflow-hidden min-h-[200px]">

        {/* Corner tint */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-[#7C5CFF]/10 to-[#00D4FF]/10 blur-2xl pointer-events-none" />

        <AnimatePresence mode="wait">
          {selectedNode && (
            <motion.div
              key={selectedNode.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-4 relative z-10"
            >
              {/* Hash + date */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-[#00D4FF] bg-[#00D4FF]/10 px-2 py-0.5 rounded font-semibold">
                  {selectedNode.hash}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{selectedNode.date}</span>
              </div>

              {/* Message */}
              <h4 className="font-heading text-sm font-semibold text-slate-100 leading-snug">
                {selectedNode.message}
              </h4>

              {/* Author + Branch */}
              <div className="flex flex-col gap-1.5 text-xs border-t border-white/[0.06] pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-12 flex-shrink-0">Author</span>
                  <span className="text-slate-200 font-medium">{selectedNode.author}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-12 flex-shrink-0">Branch</span>
                  <span className="font-mono text-[#7C5CFF] text-[11px]">{selectedNode.branch}</span>
                </div>
              </div>

              {/* Files */}
              <div className="border-t border-white/[0.06] pt-3">
                <span className="text-[10px] text-slate-500 block mb-2 font-mono uppercase tracking-wider">Changed files</span>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.files.map(f => (
                    <span key={f} className="font-mono text-[10px] text-slate-300 bg-slate-800/60 border border-white/[0.06] px-1.5 py-0.5 rounded">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* AI explanation */}
              <div className="bg-[#7C5CFF]/[0.07] border border-[#7C5CFF]/20 rounded-xl p-3.5 -mx-0.5">
                <span className="text-[10px] font-semibold text-[#00E38C] flex items-center gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00E38C] animate-pulse" />
                  GitSense AI
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">{selectedNode.explanation}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
