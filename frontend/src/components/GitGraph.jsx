import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Minus, RotateCcw, Maximize2, HelpCircle 
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────
   Commit data for the new 5-branch repository timeline
   (Main, feature/auth, feature/cart, develop, hotfix/bug)
───────────────────────────────────────────────────────── */
const ALL_COMMITS = [
  // ── Main Branch Commits
  { 
    id: '1', hash: 'a1b2c3d', author: 'Sameer', date: '2d ago',
    message: 'init: setup express server and core configuration',
    branch: 'main', x: 140, y: 180,
    files: ['package.json', 'server.js', '.env.example'], additions: [45, 82, 15],
    safety: 100, purpose: 'Scaffold application base package and configurations.',
    explanation: 'Created foundational express scaffold with base server structure.',
    color: '#7C5CFF'
  },
  { 
    id: '2', hash: 'd4e5f6a', author: 'Kartik', date: '1d ago',
    message: 'feat: base layout routing and dynamic viewports',
    branch: 'main', x: 220, y: 180,
    files: ['src/App.jsx', 'src/routes.jsx'], additions: [110, 55],
    safety: 100, purpose: 'Establish client-side route paths and lazy loading wrappers.',
    explanation: 'Auth and Dashboard layout routing completed. Validated.',
    annotation: '3 commits ago\nBranch point',
    color: '#7C5CFF'
  },
  { 
    id: '3', hash: 'f7g8h9i', author: 'Sameer', date: '18h ago',
    message: 'docs: update install instructions and local setup scripts',
    branch: 'main', x: 300, y: 180,
    files: ['README.md', 'scripts/setup.sh'], additions: [30, 24],
    safety: 100, purpose: 'Maintain repository setup documentation.',
    explanation: 'Clarifies CLI startup instructions and local node version constraints.',
    color: '#7C5CFF'
  },

  // ── feature/auth Branch Commits
  { 
    id: '4', hash: 'a12bc8f', author: 'Ayesh', date: '8h ago',
    message: 'feat: scaffold passport local strategy and middlewares',
    branch: 'feature/auth', x: 560, y: 100,
    files: ['config/passport.js', 'server.js'], additions: [85, 12],
    safety: 95, purpose: 'Scaffold authentication middleware helper modules.',
    explanation: 'Introduced local username/password checks using passport helper hook.',
    color: '#00D4FF'
  },
  { 
    id: '5', hash: 'b34de9a', author: 'Ayesh', date: '6h ago',
    message: 'feat: create authentication endpoints and test suites',
    branch: 'feature/auth', x: 640, y: 100,
    files: ['routes/auth.js', 'controllers/auth.js'], additions: [140, 95],
    safety: 90, purpose: 'Expose login/signup controller actions.',
    explanation: 'Enables credential validation against standard password hashes.',
    color: '#00D4FF'
  },
  { 
    id: '6', hash: 'c56fg2b', author: 'Ayesh', date: '4h ago',
    message: 'fix: cookie parsing configurations and session storage',
    branch: 'feature/auth', x: 720, y: 100,
    files: ['server.js', 'middleware/cookies.js'], additions: [22, 48],
    safety: 98, purpose: 'Configure secure, HttpOnly cookie flags.',
    explanation: 'Hardens authentication session cookies against client-side script inspection.',
    color: '#00D4FF'
  },
  { 
    id: '7', hash: 'd9fa002', author: 'Ayesh', date: '18m ago',
    message: 'Add JWT authentication & protected routes',
    branch: 'feature/auth', x: 800, y: 100, head: true,
    files: ['server.js', 'auth.js', 'middleware.js'], additions: [120, 98, 75],
    safety: 72, purpose: 'Implements JWT auth, login, and protected route middleware.',
    explanation: 'Restricts user dashboard access unless a valid signed token is supplied.',
    conflictFiles: ['auth.js', 'middleware.js'],
    color: '#00D4FF'
  },

  // ── feature/cart Branch Commits
  { 
    id: '8', hash: 'e11aa22', author: 'Manik', date: '7h ago',
    message: 'feat: add cart reducer actions and store slice mapping',
    branch: 'feature/cart', x: 550, y: 230,
    files: ['src/store/cartSlice.js'], additions: [75],
    safety: 100, purpose: 'Setup global state slice for shopping cart items.',
    explanation: 'Implements actions for adding, removing, and clearing item maps.',
    color: '#10B981'
  },
  { 
    id: '9', hash: 'f33bb44', author: 'Manik', date: '5h ago',
    message: 'feat: implement add-to-cart layout cards and drawer lists',
    branch: 'feature/cart', x: 630, y: 230,
    files: ['src/components/Cart.jsx', 'src/components/ProductCard.jsx'], additions: [130, 45],
    safety: 100, purpose: 'Design checkout list drawer and add-to-cart triggers.',
    explanation: 'Renders sliding side cart widget with real-time price totals.',
    color: '#10B981'
  },
  { 
    id: '10', hash: 'a55cc66', author: 'Manik', date: '3h ago',
    message: 'fix: persistent cart storage state cache',
    branch: 'feature/cart', x: 710, y: 230,
    files: ['src/store/cartSlice.js', 'src/utils/cache.js'], additions: [35, 18],
    safety: 98, purpose: 'Sync active shopping cart records to localStorage cache.',
    explanation: 'Avoids cart empties on sudden browser page refreshes.',
    color: '#10B981'
  },

  // ── develop Branch Commits
  { 
    id: '11', hash: 'b1c2d3e', author: 'Kartik', date: '6h ago',
    message: 'feat: add pipeline configure files for continuous builds',
    branch: 'develop', x: 550, y: 280,
    files: ['.github/workflows/ci.yml'], additions: [64],
    safety: 100, purpose: 'Integrate automatic testing check commands on GitHub push events.',
    explanation: 'Adds validation runner workflows that run npm install and test.',
    color: '#F59E0B'
  },
  { 
    id: '12', hash: 'c3d4e5f', author: 'Kartik', date: '4h ago',
    message: 'fix: resolve console warnings and ESLint line alerts',
    branch: 'develop', x: 630, y: 280,
    files: ['src/components/Cart.jsx', 'server.js'], additions: [15, 8],
    safety: 100, purpose: 'Fix JSX bracket placements and missing semicolon markers.',
    explanation: 'Polishes code formatting across pages. All lint tests now pass.',
    color: '#F59E0B'
  },
  { 
    id: '13', hash: 'd5e6f7g', author: 'Kartik', date: '2h ago',
    message: 'chore: upgrade vulnerable sub-dependencies in lockfile',
    branch: 'develop', x: 710, y: 280,
    files: ['package.json'], additions: [12],
    safety: 95, purpose: 'Update package versions to eliminate external warning flags.',
    explanation: 'Safely upgrades underlying system dependencies. Compiles correctly.',
    color: '#F59E0B'
  },

  // ── hotfix/bug Branch Commits
  { 
    id: '14', hash: 'h1i2j3k', author: 'Sameer', date: '5h ago',
    message: 'fix: socket memory leak in connection session timeout handlers',
    branch: 'hotfix/bug', x: 550, y: 330,
    files: ['server.js'], additions: [42],
    safety: 85, purpose: 'Clear stale connection channels when socket connections drop.',
    explanation: 'Prevents heap exhaustion on client timeouts. Tested under load.',
    color: '#EF4444'
  },
  { 
    id: '15', hash: 'j4k516m', author: 'Sameer', date: '3h ago',
    message: 'fix: configure connection pools to prevent database exhausts',
    branch: 'hotfix/bug', x: 630, y: 330,
    files: ['db.js'], additions: [28],
    safety: 90, purpose: 'Scale connection pool size limits dynamically based on queries.',
    explanation: 'Patches DB pool depletion errors under sudden front-end traffic spikes.',
    color: '#EF4444'
  },

  // ── Merge point Commit
  { 
    id: '16', hash: 'z9y8x7w', author: 'Sameer', date: '5m ago',
    message: 'merge feature/auth & feature/cart to production main',
    branch: 'main', x: 900, y: 180,
    files: ['server.js', 'package.json'], additions: [25, 4],
    safety: 100, purpose: 'Integrate and deploy the completed authorization and cart features.',
    explanation: 'Consolidates develop branches. Production build validated.',
    color: '#7C5CFF'
  }
];

const BRANCH_TYPES = [
  { name: 'main', color: '#7C5CFF' },
  { name: 'feature/auth', color: '#00D4FF' },
  { name: 'feature/cart', color: '#10B981' },
  { name: 'develop', color: '#F59E0B' },
  { name: 'hotfix/bug', color: '#EF4444' }
];

export default function GitGraph({ state = 'normal', onNodeSelect, commits = [], branches = [] }) {
  const [selectedNode, setSelectedNode] = useState(null);
  
  // Interactive Zoom and Drag-Scroll States
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ startX: 0, startScrollLeft: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const svgRef = useRef(null);

  const hasRealCommits = commits && commits.length > 0;
  
  // Chronological order: oldest to newest
  const sortedCommits = hasRealCommits ? [...commits].reverse() : [];
  
  const displayBranchTypes = (hasRealCommits && branches && branches.length > 0)
    ? branches
    : BRANCH_TYPES;

  const displayCommits = hasRealCommits
    ? sortedCommits.map((c, idx) => {
        const branchIndex = displayBranchTypes.findIndex(b => b.name === c.branch);
        const trackY = branchIndex !== -1 ? 100 + branchIndex * 60 : 180;
        const trackColor = branchIndex !== -1 ? displayBranchTypes[branchIndex].color : '#7C5CFF';
        
        const isHead = idx === sortedCommits.length - 1; // HEAD is the youngest/newest commit

        return {
          ...c,
          id: c.sha,
          x: 120 + idx * 140,
          y: trackY,
          color: trackColor,
          branch: c.branch,
          head: isHead,
          safety: c.safety || (c.branch === 'hotfix/bug' || c.branch?.includes('hotfix') ? 85 : 100),
          purpose: c.message,
          explanation: `Commit by ${c.author} (${c.time || 'recent'}).`,
        };
      })
    : ALL_COMMITS;

  const contentWidth = Math.max(960, 100 + displayCommits.length * 140);

  // Set default selected commit on load and when workflow state toggles or commits change
  useEffect(() => {
    if (displayCommits && displayCommits.length > 0) {
      const headCommit = displayCommits.find(c => c.head) || displayCommits[displayCommits.length - 1];
      
      let defaultNode = { ...headCommit };
      if (hasRealCommits && defaultNode) {
        if (state === 'conflict') {
          defaultNode.safety = 38;
          defaultNode.conflictFiles = ['src/App.jsx', 'package.json'];
          defaultNode.explanation = '⚠️ Merge Conflict detected: app routing logic and configuration changes clash with remote main branch changes. Manual conflict resolution required.';
        } else if (state === 'diverged') {
          defaultNode.explanation = '🔗 Commit is behind remote main branch by 2 commits. Perform a pull rebase to sync branch heads.';
        }
      } else if (!hasRealCommits) {
        const mockTarget = state === 'conflict' 
          ? (displayCommits.find(c => c.hash === 'z9y8x7w') || headCommit)
          : (displayCommits.find(c => c.hash === 'd9fa002') || headCommit);
        
        defaultNode = { ...mockTarget };
        if (state === 'conflict' && defaultNode.hash === 'z9y8x7w') {
          defaultNode.safety = 35;
          defaultNode.conflictFiles = ['auth.js', 'middleware.js'];
          defaultNode.explanation = '⚠️ Conflict detected: auth.js and middleware.js were modified simultaneously on origin and local main branch. Manual resolution required.';
        }
      }
      setSelectedNode(headCommit);
      onNodeSelect?.(defaultNode);
    }
  }, [state, commits]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNodeClick = (node) => {
    let modifiedNode = { ...node };
    const headCommit = displayCommits.find(c => c.head) || displayCommits[displayCommits.length - 1];

    if (hasRealCommits && headCommit) {
      if (state === 'conflict' && node.id === headCommit.id) {
        modifiedNode.safety = 38;
        modifiedNode.conflictFiles = ['src/App.jsx', 'package.json'];
        modifiedNode.explanation = '⚠️ Merge Conflict detected: app routing logic and configuration changes clash with remote main branch changes. Manual conflict resolution required.';
      } else if (state === 'diverged' && node.id === headCommit.id) {
        modifiedNode.explanation = '🔗 Commit is behind remote main branch by 2 commits. Perform a pull rebase to sync branch heads.';
      }
    } else {
      if (state === 'conflict' && node.hash === 'z9y8x7w') {
        modifiedNode.safety = 35;
        modifiedNode.conflictFiles = ['auth.js', 'middleware.js'];
        modifiedNode.explanation = '⚠️ Conflict detected: auth.js and middleware.js were modified simultaneously on origin and local main branch. Manual resolution required.';
      } else if (state === 'diverged' && node.branch === 'feature/auth') {
        modifiedNode.explanation = '🔗 Commit belongs to origin/feature/auth. Needs a pull and rebase to merge safely.';
      }
    }
    
    setSelectedNode(node);
    onNodeSelect?.(modifiedNode);
  };

  // Dragging event handlers for horizontal scrolling
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only drag on left click
    setIsDragging(true);
    if (svgRef.current) {
      setDragStart({ 
        startX: e.clientX, 
        startScrollLeft: svgRef.current.scrollLeft 
      });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !svgRef.current) return;
    const dx = e.clientX - dragStart.startX;
    svgRef.current.scrollLeft = dragStart.startScrollLeft - dx;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleFitView = () => {
    setZoom(1);
    if (svgRef.current) {
      svgRef.current.scrollLeft = 0;
    }
  };

  // Paths rendering builder based on active workspace state
  const renderPaths = () => {
    const isDiverged = state === 'diverged';
    const isConflict = state === 'conflict';

    // Decide if auth branch lines are animated (dotted) based on state
    const authLinkClass = isDiverged ? "node-link" : "";
    const authLinkStroke = isDiverged ? "#00D4FF" : "#00D4FF";
    
    // Decide if merge lines into final node are conflicted
    const mergeStroke = isConflict ? "#EF4444" : "#7C5CFF";
    const mergeLinkClass = isConflict ? "node-link" : "";

    if (hasRealCommits) {
      const dynamicPaths = [];
      const commitMap = new Map();
      displayCommits.forEach(c => commitMap.set(c.sha, c));

      displayCommits.forEach((c) => {
        if (c.parents && c.parents.length > 0) {
          c.parents.forEach((parentSha) => {
            const parent = commitMap.get(parentSha);
            if (parent) {
              const key = `path-${parent.sha}-${c.sha}`;
              const isHeadConflict = state === 'conflict' && c.head;
              const strokeColor = isHeadConflict ? '#EF4444' : c.color;
              
              if (parent.y === c.y) {
                dynamicPaths.push(
                  <line 
                    key={key} 
                    x1={parent.x} 
                    y1={parent.y} 
                    x2={c.x} 
                    y2={c.y} 
                    stroke={strokeColor} 
                    strokeWidth={3.0} 
                  />
                );
              } else {
                const midX = (parent.x + c.x) / 2;
                dynamicPaths.push(
                  <path
                    key={key}
                    d={`M ${parent.x} ${parent.y} C ${midX} ${parent.y}, ${midX} ${c.y}, ${c.x} ${c.y}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={2.2}
                    opacity={0.85}
                  />
                );
              }
            }
          });
        }
      });
      return <g>{dynamicPaths}</g>;
    }

    return (
      <g>
        {/* ── main branch line (purple) */}
        {/* start segment (before first node) */}
        <line x1={100} y1={180} x2={140} y2={180} stroke="#7C5CFF" strokeWidth={3.5} className="node-link" />
        {/* rest of main */}
        <line x1={140} y1={180} x2={900} y2={180} stroke="#7C5CFF" strokeWidth={3.5} />

        {/* ── feature/auth curve (cyan) */}
        {/* branch split curve (before label) */}
        <path 
          d="M 300 180 C 350 180, 390 100, 440 100 L 460 100" 
          fill="none" 
          stroke={authLinkStroke} 
          strokeWidth={2.5} 
          className="node-link" 
          opacity={0.9} 
        />
        {/* straight line (after label) */}
        <path 
          d="M 460 100 L 800 100" 
          fill="none" 
          stroke="#00D4FF" 
          strokeWidth={2.5} 
          opacity={0.9} 
        />
        {/* merge curve back to main */}
        <path 
          d="M 800 100 C 840 100, 870 180, 900 180" 
          fill="none" 
          stroke={isDiverged ? "#00D4FF" : mergeStroke} 
          strokeWidth={isDiverged ? 2.5 : 3.5} 
          className={isDiverged ? "node-link" : mergeLinkClass} 
          opacity={isDiverged ? 0.6 : 0.9}
        />

        {/* ── feature/cart curve (green) */}
        {/* branch split curve (before label) */}
        <path 
          d="M 300 180 C 350 180, 390 230, 440 230 L 460 230" 
          fill="none" 
          stroke="#10B981" 
          strokeWidth={2.5} 
          className="node-link" 
          opacity={0.9} 
        />
        {/* straight line (after label) */}
        <path 
          d="M 460 230 L 710 230" 
          fill="none" 
          stroke="#10B981" 
          strokeWidth={2.5} 
          opacity={0.9} 
        />
        {/* merge curve back to main */}
        <path 
          d="M 710 230 C 770 230, 840 180, 900 180" 
          fill="none" 
          stroke={mergeStroke} 
          strokeWidth={3.5} 
          className={mergeLinkClass}
          opacity={0.9} 
        />

        {/* ── develop curve (yellow) */}
        {/* branch split curve (before label - always dotted) */}
        <path 
          d="M 300 180 C 345 180, 370 280, 440 280 L 460 280" 
          fill="none" 
          stroke="#F59E0B" 
          strokeWidth={2.5} 
          className="node-link"
          opacity={0.9} 
        />
        {/* straight line (after label) */}
        <path 
          d="M 460 280 L 710 280" 
          fill="none" 
          stroke="#F59E0B" 
          strokeWidth={2.5} 
          opacity={0.9} 
        />
        {/* merge curve back to main */}
        <path 
          d="M 710 280 C 770 280, 840 180, 900 180" 
          fill="none" 
          stroke={mergeStroke} 
          strokeWidth={3.5} 
          className={mergeLinkClass}
          opacity={0.9} 
        />

        {/* ── hotfix/bug curve (red) */}
        {/* branch split curve (before label - always dotted) */}
        <path 
          d="M 300 180 C 340 180, 360 330, 440 330 L 460 330" 
          fill="none" 
          stroke="#EF4444" 
          strokeWidth={2.5} 
          className="node-link"
          opacity={0.9} 
        />
        {/* straight line (after label) */}
        <path 
          d="M 460 330 L 630 330" 
          fill="none" 
          stroke="#EF4444" 
          strokeWidth={2.5} 
          opacity={0.9} 
        />
        {/* merge curve back to main */}
        <path 
          d="M 630 330 C 720 330, 840 180, 900 180" 
          fill="none" 
          stroke={mergeStroke} 
          strokeWidth={3.5} 
          className={mergeLinkClass}
          opacity={0.9} 
        />
      </g>
    );
  };

  return (
    <div className={`w-full gitgraph-card rounded-2xl p-5 border border-white/[0.06] backdrop-blur-sm transition-all duration-300 relative ${
      isFullscreen ? 'fixed inset-0 z-50 bg-[#060913]/98 p-8 flex flex-col justify-between' : 'flex flex-col'
    }`}>
      
      {/* ── Header control bar inside the graph card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-4.5 mb-4.5 select-none">
        <div className="flex flex-col gap-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-wider text-slate-100 font-heading">
              BRANCH RELATIONSHIP GRAPH
            </span>
            <HelpCircle size={14} className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors" />
          </div>
          
          {/* Legend Pills */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-slate-400">
            {displayBranchTypes.map(branch => (
              <div key={branch.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: branch.color }} />
                <span>{branch.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={handleFitView}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Fit View</span>
          </button>
          
          <div className="flex items-center bg-slate-900 border border-white/[0.08] rounded-xl p-0.5">
            <button
              onClick={() => setZoom(z => Math.max(z - 0.15, 0.5))}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all cursor-pointer"
              title="Zoom Out"
            >
              <Minus size={13} />
            </button>
            <span className="px-2 text-[10px] font-mono text-slate-400 select-none min-w-[36px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(z + 0.15, 2.0))}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all cursor-pointer"
              title="Zoom In"
            >
              <Plus size={13} />
            </button>
          </div>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-white/[0.08] rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* ── SVG Canvas Viewport */}
      <div 
        className={`w-full relative overflow-x-auto overflow-y-hidden bg-slate-950/20 border border-white/[0.03] rounded-xl cursor-grab active:cursor-grabbing flex-1 custom-scrollbar ${isDragging ? '' : 'scroll-smooth'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        ref={svgRef}
        style={{ 
          height: `${380 * zoom}px`,
          minHeight: '340px',
          transition: 'height 0.15s ease-out'
        }}
      >
        <svg
          viewBox={`0 0 ${contentWidth} 380`}
          width={contentWidth * zoom}
          height={380 * zoom}
          preserveAspectRatio="xMinYMin meet"
          className="select-none"
          style={{ 
            transition: 'width 0.15s ease-out, height 0.15s ease-out'
          }}
        >
          <defs>
            {/* Dotted Grid Pattern */}
            <pattern id="dotGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="1.2" fill="var(--graph-grid, rgba(255, 255, 255, 0.12))" />
            </pattern>
            {/* Node Outer Glow filter */}
            <filter id="glowFilter" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid Background */}
          <rect width="100%" height="100%" fill="url(#dotGrid)" className="pointer-events-none" />

          {/* Wrapper Group for commits and paths */}
          <g>
            
            {/* ── BRANCH ANNOTATIONS (3 commits ago / Branch point or Diverged Alert) */}
            {!hasRealCommits ? (
              <>
                <line x1={220} y1={105} x2={220} y2={170} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3" />
                <g>
                  <rect x={170} y={55} width={100} height={42} rx={6} fill="#060913" fillOpacity={0.85} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                  <text x={220} y={72} fill="#94a3b8" fontSize={9.5} textAnchor="middle" fontFamily="sans-serif">3 commits ago</text>
                  <text x={220} y={87} fill="#64748b" fontSize={9} textAnchor="middle" fontFamily="sans-serif">Branch point</text>
                </g>
              </>
            ) : (
              state === 'diverged' && displayCommits.length > 0 && (
                (() => {
                  const headCommit = displayCommits.find(c => c.head) || displayCommits[displayCommits.length - 1];
                  return (
                    <g transform={`translate(${headCommit.x - 110}, ${headCommit.y - 70})`}>
                      <rect width={220} height={42} rx={6} fill="#0b0f19" fillOpacity={0.9} stroke="#EF4444" strokeWidth={1} />
                      <text x={110} y={17} fill="#EF4444" fontSize={9.5} textAnchor="middle" fontWeight="semibold" fontFamily="sans-serif">⚠️ Local branch is behind by 2 commits</text>
                      <text x={110} y={32} fill="#64748b" fontSize={9} textAnchor="middle" fontFamily="sans-serif">Run 'git pull --rebase' to resolve</text>
                    </g>
                  );
                })()
              )
            )}

            {/* ── PATH LINES */}
            {renderPaths()}

            {/* ── BRANCH PILLS OVERLAY */}
            {!hasRealCommits ? (
              <>
                {/* main label */}
                <g transform="translate(30, 168)" className="pointer-events-none">
                  <rect width={56} height={24} rx={6} fill="var(--graph-pill-bg, #0b0f19)" />
                  <rect width={56} height={24} rx={6} fill="rgba(124, 92, 255, 0.12)" stroke="#7C5CFF" strokeWidth={1.2} />
                  <text x={28} y={15} fill="#7C5CFF" fontSize={11} fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">main</text>
                </g>
                {/* feature/auth label */}
                <g transform="translate(420, 88)" className="pointer-events-none">
                  <rect width={84} height={24} rx={6} fill="var(--graph-pill-bg, #0b0f19)" />
                  <rect width={84} height={24} rx={6} fill="rgba(0, 212, 255, 0.12)" stroke="#00D4FF" strokeWidth={1.2} />
                  <text x={42} y={15} fill="#00D4FF" fontSize={11} fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">feature/auth</text>
                </g>
                {/* feature/cart label */}
                <g transform="translate(420, 218)" className="pointer-events-none">
                  <rect width={84} height={24} rx={6} fill="var(--graph-pill-bg, #0b0f19)" />
                  <rect width={84} height={24} rx={6} fill="rgba(16, 185, 129, 0.12)" stroke="#10B981" strokeWidth={1.2} />
                  <text x={42} y={15} fill="#10B981" fontSize={11} fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">feature/cart</text>
                </g>
                {/* develop label */}
                <g transform="translate(424, 268)" className="pointer-events-none">
                  <rect width={68} height={24} rx={6} fill="var(--graph-pill-bg, #0b0f19)" />
                  <rect width={68} height={24} rx={6} fill="rgba(245, 158, 11, 0.12)" stroke="#F59E0B" strokeWidth={1.2} />
                  <text x={34} y={15} fill="#F59E0B" fontSize={11} fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">develop</text>
                </g>
                {/* hotfix/bug label */}
                <g transform="translate(420, 318)" className="pointer-events-none">
                  <rect width={80} height={24} rx={6} fill="var(--graph-pill-bg, #0b0f19)" />
                  <rect width={80} height={24} rx={6} fill="rgba(239, 68, 68, 0.12)" stroke="#EF4444" strokeWidth={1.2} />
                  <text x={40} y={15} fill="#EF4444" fontSize={11} fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">hotfix/bug</text>
                </g>
              </>
            ) : (
              <g className="pointer-events-none">
                {displayBranchTypes.map((branch, idx) => {
                  const trackY = 100 + idx * 60;
                  const pillWidth = Math.max(70, branch.name.length * 6.8 + 16);
                  return (
                    <g key={`branch-pill-${branch.name}`}>
                      {/* Lane Track Background line */}
                      <line x1={20} y1={trackY} x2={contentWidth - 20} y2={trackY} stroke={branch.color} strokeWidth={1.0} strokeDasharray="3 6" opacity={0.22} />
                      {/* Branch Name Badge */}
                      <g transform={`translate(20, ${trackY - 12})`}>
                        <rect width={pillWidth} height={24} rx={6} fill="var(--graph-pill-bg, #0b0f19)" />
                        <rect width={pillWidth} height={24} rx={6} fill={`${branch.color}1c`} stroke={branch.color} strokeWidth={1.2} />
                        <text x={pillWidth / 2} y={15} fill={branch.color} fontSize={10} fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                          {branch.name}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            )}

            {/* ── NODES */}
            {displayCommits.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isConflictStateMerge = state === 'conflict' && (
                (!hasRealCommits && node.hash === 'z9y8x7w') ||
                (hasRealCommits && node.head)
              );
              
              let fill = node.color;
              if (isConflictStateMerge) {
                fill = '#EF4444'; // Red conflict dot
              }

              return (
                <g key={node.id} onClick={() => handleNodeClick(node)}>
                  
                  {/* HEAD Banner badge */}
                  {node.head && (
                    <g key="head-banner" className="pointer-events-none">
                      <rect
                        x={node.x - 20}
                        y={node.y - 45}
                        width={40}
                        height={18}
                        rx={4}
                        fill="#00D4FF"
                      />
                      <text
                        x={node.x}
                        y={node.y - 32}
                        fill="#060913"
                        fontSize={9}
                        fontWeight="bold"
                        textAnchor="middle"
                        fontFamily="sans-serif"
                      >
                        HEAD
                      </text>
                      <line
                        x1={node.x}
                        y1={node.y - 27}
                        x2={node.x}
                        y2={node.y - 12}
                        stroke="#00D4FF"
                        strokeWidth={1.5}
                      />
                    </g>
                  )}

                  {/* tip pulse ring */}
                  {node.head && (
                    <circle
                      key="head-pulse"
                      cx={node.x}
                      cy={node.y}
                      r={14}
                      fill="none"
                      stroke="#00D4FF"
                      strokeWidth={1.5}
                      opacity={0.5}
                    >
                      <animate attributeName="r" values="9;24;9" dur="2.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.7;0;0.7" dur="2.5s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Conflict alert ring */}
                  {isConflictStateMerge && (
                    <circle
                      key="conflict-pulse"
                      cx={node.x}
                      cy={node.y}
                      r={14}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth={1.5}
                      opacity={0.5}
                    >
                      <animate attributeName="r" values="9;22;9" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Glow ring when selected */}
                  {isSelected && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={18}
                      fill={fill}
                      opacity={0.22}
                      filter="url(#glowFilter)"
                      className="pointer-events-none animate-pulse"
                    />
                  )}

                  {/* Click trigger area */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={20}
                    fill="transparent"
                    className="cursor-pointer"
                  />

                  {/* Outer circle layout */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? 10 : 7}
                    fill={isSelected ? 'transparent' : fill}
                    stroke={isSelected ? fill : 'var(--graph-node-stroke)'}
                    strokeWidth={isSelected ? 4 : 2}
                    className="node-circle transition-all duration-200"
                  />

                  {/* Inner selected dot */}
                  {isSelected && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={4.5}
                      fill={fill}
                      className="pointer-events-none"
                    />
                  )}

                  {/* Hash ID text under node */}
                  <text
                    x={node.x}
                    y={node.y + 24}
                    fill={isSelected ? fill : '#64748B'}
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    textAnchor="middle"
                    className="pointer-events-none select-none transition-colors duration-200"
                  >
                    {node.hash}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
