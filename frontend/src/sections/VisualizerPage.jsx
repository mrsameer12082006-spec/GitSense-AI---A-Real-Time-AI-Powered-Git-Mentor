import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, LogOut, Settings, User, Info, FileText, Moon, 
  GitBranch, Activity, CheckCircle2, MessageSquare, Database, 
  ChevronLeft, ChevronRight, Download, Link as LinkIcon, Sparkles, FileText as FileIcon
} from 'lucide-react';
import GitGraph from '../components/GitGraph';
import {
  currentUser,
  isRepositoryConnected,
  connectedRepository,
  githubImportOptions,
  repositoryInsights,
  sidebarEmptyStateText
} from '../data/mockDashboardData';

export default function VisualizerPage() {
  const [isAvatarDropdownOpen, setIsAvatarDropdownOpen] = useState(false);
  const [isGithubDropdownOpen, setIsGithubDropdownOpen] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    return localStorage.getItem('gitsense_theme') !== 'light';
  });

  const toggleTheme = () => {
    const newVal = !isDarkTheme;
    setIsDarkTheme(newVal);
    localStorage.setItem('gitsense_theme', newVal ? 'dark' : 'light');
    if (newVal) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
  };

  useEffect(() => {
    const handleStorageChange = () => {
      setIsDarkTheme(localStorage.getItem('gitsense_theme') !== 'light');
    };
    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(handleStorageChange, 500);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);
  
  // Collapsible Sidebars State
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('gitsense_left_sidebar');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('gitsense_right_sidebar');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Handle resizing for mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsLeftSidebarOpen(false);
        setIsRightSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('gitsense_left_sidebar', JSON.stringify(isLeftSidebarOpen));
  }, [isLeftSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('gitsense_right_sidebar', JSON.stringify(isRightSidebarOpen));
  }, [isRightSidebarOpen]);

  // Visualizer page state
  const [graphState, setGraphState] = useState('normal'); // normal, diverged, conflict
  const [selectedNodeDetails, setSelectedNodeDetails] = useState(null);

  return (
    <div className="h-screen w-screen bg-[var(--bg-color)] text-[var(--text)] flex overflow-hidden font-sans relative">
      
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 glow-blur glow-purple w-[400px] h-[400px] opacity-15 pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 glow-blur glow-cyan w-[400px] h-[400px] opacity-15 pointer-events-none" />

      {/* Mobile Overlays */}
      {isLeftSidebarOpen && window.innerWidth < 768 && (
        <div className="sidebar-overlay" onClick={() => setIsLeftSidebarOpen(false)} />
      )}
      {isRightSidebarOpen && window.innerWidth < 768 && (
        <div className="sidebar-overlay" onClick={() => setIsRightSidebarOpen(false)} />
      )}

      {/* ── LEFT SIDEBAR ── */}
      <aside className={`sidebar-collapsible sidebar-left border-r border-white/[0.06] bg-[#060913]/90 flex flex-col z-20 select-none flex-shrink-0 relative ${!isLeftSidebarOpen ? 'collapsed' : ''}`} style={{ width: '260px', minWidth: '260px' }}>
        
        <div className="sidebar-inner w-[260px] h-full flex flex-col">
          {/* Sidebar Brand Top */}
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
            <a href="#home" className="flex items-center gap-2 group">
              <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full transition-transform duration-300 group-hover:rotate-[15deg]">
                  <defs>
                    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00D4FF" />
                      <stop offset="100%" stopColor="#7C5CFF" />
                    </linearGradient>
                  </defs>
                  <path d="M 25 50 C 25 20, 75 20, 75 50 C 75 80, 25 80, 25 50 Z"
                    fill="none" stroke="url(#logoGrad)" strokeWidth="11" strokeLinecap="round" />
                  <path d="M 25 50 H 52"
                    fill="none" stroke="url(#logoGrad)" strokeWidth="11" strokeLinecap="round" />
                  <circle cx="25" cy="50" r="10" fill="#060913" stroke="#00D4FF" strokeWidth="6" />
                  <circle cx="75" cy="50" r="10" fill="#060913" stroke="#7C5CFF" strokeWidth="6" />
                  <circle cx="50" cy="50" r="8" fill="#F8FAFC" />
                </svg>
              </div>
              <span className="font-heading font-bold text-base tracking-tight text-slate-100">
                GitSense<span className="text-[#7C5CFF]">.AI</span>
              </span>
            </a>
          </div>

          {/* Sidebar Navigation */}
          <div className="p-3 flex flex-col gap-1">
            <button
              onClick={() => window.location.hash = '#dashboard'}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50"
            >
              <Sparkles size={16} className="text-slate-400" />
              <span>Git Assistant</span>
            </button>

            <button
              onClick={() => window.location.hash = '#visualizer-page'}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#F8FAFC]"
            >
              <Activity size={16} className="text-[#7C5CFF]" />
              <span>Visualization Graph</span>
            </button>
          </div>

          {/* Sidebar Empty State / Bottom Area */}
          <div className="flex-1 overflow-y-auto px-3 py-6 flex flex-col gap-4 custom-scrollbar text-center justify-center">
             <div className="text-slate-500 text-xs px-4 flex flex-col items-center gap-3">
               <MessageSquare size={20} className="opacity-40" />
               <p>{sidebarEmptyStateText}</p>
             </div>
          </div>
        </div>
      </aside>

      {/* Toggle Button for Left Sidebar */}
      {!isLeftSidebarOpen && (
        <button 
          className="sidebar-toggle-btn left"
          onClick={() => setIsLeftSidebarOpen(true)}
          title="Expand Sidebar"
        >
          <ChevronRight size={14} />
        </button>
      )}
      {isLeftSidebarOpen && (
        <button 
          className="sidebar-toggle-btn left hidden md:flex"
          onClick={() => setIsLeftSidebarOpen(false)}
          title="Collapse Sidebar"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      {/* ── MAIN WORKSPACE CONTAINER ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── TOP HEADER ── */}
        <header className="h-[60px] border-b border-white/[0.06] bg-[#060913]/70 backdrop-blur-md flex items-center justify-between px-6 z-10 flex-shrink-0 select-none">
          
          {/* Left: GitHub Repo Connect/Import */}
          <div className="flex items-center gap-3 relative">
            <button
              onClick={() => setIsGithubDropdownOpen(!isGithubDropdownOpen)}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 transition-all cursor-pointer group"
            >
              <GitBranch size={14} className="text-slate-400 group-hover:text-white transition-colors" />
              <span>{isRepositoryConnected && connectedRepository ? `${connectedRepository.name} (${connectedRepository.branch})` : 'Connect / Import GitHub Repo'}</span>
              <ChevronDown size={12} className={`opacity-60 transition-transform ${isGithubDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* GitHub Import Dropdown */}
            <AnimatePresence>
              {isGithubDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsGithubDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute left-0 top-[110%] mt-1 w-[240px] bg-slate-950/95 border border-white/[0.1] rounded-xl shadow-2xl backdrop-blur-xl z-50 p-1"
                  >
                    {githubImportOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => {
                          setIsGithubDropdownOpen(false);
                          alert(`Placeholder: ${option.label} clicked.`);
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-3 text-slate-300 hover:text-white hover:bg-slate-900 cursor-pointer"
                      >
                        {option.icon === 'GitBranch' && <GitBranch size={14} />}
                        {option.icon === 'Download' && <Download size={14} />}
                        {option.icon === 'Link' && <LinkIcon size={14} />}
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Right: User Avatar & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsAvatarDropdownOpen(!isAvatarDropdownOpen)}
              className="w-8 h-8 rounded-full border border-white/[0.08] bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] flex items-center justify-center text-white text-xs font-heading font-bold hover:scale-105 transition-all cursor-pointer shadow-[0_0_10px_rgba(124,92,255,0.2)]"
            >
              {currentUser.avatarInitial}
            </button>

            {/* Profile Dropdown */}
            <AnimatePresence>
              {isAvatarDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAvatarDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 0.95 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-[220px] bg-slate-950/95 border border-white/[0.08] rounded-xl shadow-2xl backdrop-blur-xl z-50 p-2 overflow-hidden"
                  >
                    <div className="px-3 py-2.5 border-b border-white/[0.06] mb-1 flex flex-col">
                      <span className="text-xs font-semibold text-slate-100">{currentUser.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{currentUser.email}</span>
                    </div>

                    {[
                      { icon: <User size={13} />, label: 'Profile', onClick: () => window.location.hash = '#profile' },
                      { icon: <Settings size={13} />, label: 'Settings', onClick: () => window.location.hash = '#settings' },
                      { icon: <Info size={13} />, label: 'About Us', onClick: () => window.location.hash = '#about-us' },
                      { icon: <FileText size={13} />, label: 'Privacy Policy', onClick: () => window.location.hash = '#terms' },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          item.onClick();
                          setIsAvatarDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition-colors text-left cursor-pointer"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    ))}

                    <div className="border-t border-white/[0.06] my-1 pt-1">
                      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-400">
                        <span className="flex items-center gap-2">
                          <Moon size={13} />
                          <span>Dark Theme</span>
                        </span>
                        <div 
                          onClick={toggleTheme}
                          className={`w-7 h-4 rounded-full p-0.5 flex items-center cursor-pointer transition-all ${
                            isDarkTheme ? 'bg-[#7C5CFF]/30 justify-end' : 'bg-slate-700 justify-start'
                          }`}
                        >
                          <div className={`w-3 h-3 rounded-full transition-all ${isDarkTheme ? 'bg-[#7C5CFF]' : 'bg-slate-400'}`} />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => window.location.hash = '#home'}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors text-left mt-1 cursor-pointer border-t border-white/[0.06] pt-2"
                    >
                      <LogOut size={13} />
                      <span>Log Out</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

        </header>

        {/* Central main visualizer workspace */}
        <div className="flex-1 overflow-y-auto px-6 py-6 bg-[var(--bg-color)] custom-scrollbar flex flex-col gap-6">
          <div className="max-w-[900px] mx-auto w-full flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="badge self-start bg-[#00D4FF]/10 border-[#00D4FF]/30 text-[#00D4FF] flex items-center gap-1.5">
                  <Activity size={12} /> COMMIT MAP VISUALIZER
                </div>
                <h3 className="text-2xl font-bold font-heading text-slate-100">
                  Branch Relationship Graph
                </h3>
              </div>

              {/* Workflow State Selector Buttons */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-white/[0.06] self-start">
                {[
                  { key: 'normal', label: 'Clean Branch' },
                  { key: 'diverged', label: 'Diverged Heads' },
                  { key: 'conflict', label: 'Merge Conflict' }
                ].map((stateOpt) => (
                  <button
                    key={stateOpt.key}
                    onClick={() => {
                      setGraphState(stateOpt.key);
                      setSelectedNodeDetails(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      graphState === stateOpt.key
                        ? 'bg-[#7C5CFF] text-white shadow-lg shadow-[#7C5CFF]/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {stateOpt.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-slate-400 text-sm">
              Click on any node in the SVG commit map to inspect metadata, file changes, and validation recommendations.
            </p>

            {/* GitGraph container wrapper */}
            <div className="mt-2 bg-slate-950/40 border border-white/[0.06] rounded-2xl p-4">
              <GitGraph 
                state={graphState} 
                onNodeSelect={(node) => setSelectedNodeDetails(node)} 
              />
            </div>

            {/* Detailed Commit Info Drawer */}
            {selectedNodeDetails ? (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="gitsense-card p-6 text-left flex flex-col gap-4 mt-2 border-[#7C5CFF]/30"
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#00D4FF] bg-[#00D4FF]/10 border border-[#00D4FF]/20 px-2 py-0.5 rounded">
                      {selectedNodeDetails.hash}
                    </span>
                    <h4 className="font-heading font-bold text-sm text-slate-100">
                      {selectedNodeDetails.message}
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {selectedNodeDetails.date}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-1">Author</span>
                    <span className="font-medium text-slate-200">{selectedNodeDetails.author}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Branch</span>
                    <span className="font-mono font-medium text-[#7C5CFF]">{selectedNodeDetails.branch}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Status</span>
                    <span className={`font-semibold capitalize ${
                      selectedNodeDetails.status === 'synced' ? 'text-[#00E38C]' :
                      selectedNodeDetails.status === 'remote' ? 'text-[#00D4FF]' : 'text-[#7C5CFF]'
                    }`}>{selectedNodeDetails.status}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/[0.05] flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-300">Modified Files:</span>
                  <div className="flex flex-wrap gap-2">
                    {selectedNodeDetails.files?.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-slate-900 border border-white/[0.06] px-2.5 py-1 rounded-lg text-[10px] font-mono text-slate-300">
                        <FileIcon size={10} className="text-slate-500" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/[0.05]">
                  <span className="text-xs font-bold text-slate-300 block mb-1">GitSense Explanation:</span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {selectedNodeDetails.explanation}
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-white/[0.06] rounded-xl bg-slate-950/20">
                Select a node from the commit tree to view full metadata details.
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Toggle Button for Right Sidebar */}
      {!isRightSidebarOpen && (
        <button 
          className="sidebar-toggle-btn right"
          onClick={() => setIsRightSidebarOpen(true)}
          title="Expand Details"
        >
          <ChevronLeft size={14} />
        </button>
      )}
      {isRightSidebarOpen && (
        <button 
          className="sidebar-toggle-btn right hidden xl:flex"
          onClick={() => setIsRightSidebarOpen(false)}
          title="Collapse Details"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* ── RIGHT SIDEBAR ── */}
      <aside className={`sidebar-collapsible sidebar-right border-l border-white/[0.06] bg-[#060913]/90 flex flex-col z-20 select-none flex-shrink-0 relative hidden xl:flex ${!isRightSidebarOpen ? 'collapsed' : ''}`} style={{ width: '300px', minWidth: '300px' }}>
        <div className="sidebar-inner w-[300px] h-full p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          
          {!isRepositoryConnected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-slate-500 mt-12">
               <div className="w-12 h-12 rounded-full bg-slate-900/80 border border-white/[0.05] flex items-center justify-center mb-2">
                  <Database size={20} className="opacity-40" />
               </div>
               <p className="text-sm px-4 leading-relaxed">
                 {repositoryInsights.emptyStateText}
               </p>
            </div>
          ) : (
            <>
              {/* Repo Summary Card */}
              <div className="flex flex-col gap-3">
                <h4 className="font-heading font-bold text-xs tracking-wider text-slate-400 uppercase flex items-center gap-2">
                  <Database size={13} className="text-[#7C5CFF]" /> Repository Summary
                </h4>

                <div className="bg-slate-950/60 border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-500 font-semibold">Commits</span>
                      <span className="font-heading font-bold text-lg text-slate-100">{repositoryInsights.commits}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-500 font-semibold">Open PRs</span>
                      <span className="font-heading font-bold text-lg text-[#00D4FF]">{repositoryInsights.openPRs}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-500 font-semibold">Issues</span>
                      <span className="font-heading font-bold text-lg text-rose-400">{repositoryInsights.issues}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-500 font-semibold">Contributors</span>
                      <span className="font-heading font-bold text-lg text-slate-100">{repositoryInsights.contributors}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.05] flex items-center justify-between text-xs">
                    <span className="text-slate-500">Security Scans:</span>
                    <span className="text-[#00E38C] font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} /> {repositoryInsights.securityStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Activity Card */}
              <div className="flex flex-col gap-3 flex-1 overflow-hidden min-h-0">
                <h4 className="font-heading font-bold text-xs tracking-wider text-slate-400 uppercase flex items-center gap-2">
                  <Activity size={13} className="text-[#00D4FF]" /> Recent Activity
                </h4>

                <div className="flex-1 bg-slate-950/60 border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                  
                  {/* Activity Commits */}
                  <div className="flex flex-col gap-2.5">
                    <span className="text-[10px] font-heading font-bold text-slate-500 uppercase tracking-wider">
                      Commits
                    </span>
                    <div className="flex flex-col gap-2">
                      {repositoryInsights.latestCommits?.map((commit, idx) => (
                        <div key={idx} className="flex flex-col gap-0.5 bg-slate-900/60 p-2 rounded-lg border border-white/[0.03]">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono text-[#00D4FF]">{commit.hash}</span>
                            <span className="text-slate-500">{commit.time}</span>
                          </div>
                          <span className="text-xs font-semibold text-slate-300 truncate">{commit.message}</span>
                          <span className="text-[10px] text-slate-500">by {commit.author}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Activity Pull Requests */}
                  {repositoryInsights.activePRs && repositoryInsights.activePRs.length > 0 && (
                    <div className="flex flex-col gap-2.5 mt-2">
                      <span className="text-[10px] font-heading font-bold text-slate-500 uppercase tracking-wider">
                        Active Pull Requests
                      </span>
                      <div className="flex flex-col gap-2">
                        {repositoryInsights.activePRs.map((pr, idx) => (
                          <div key={idx} className="flex flex-col gap-1 bg-slate-900/60 p-2 rounded-lg border border-white/[0.03]">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-200">{pr.id}</span>
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                pr.status === 'Approved' ? 'bg-[#00E38C]/15 text-[#00E38C]' :
                                pr.status === 'In Review' ? 'bg-[#00D4FF]/15 text-[#00D4FF]' :
                                'bg-amber-500/15 text-amber-400'
                              }`}>
                                {pr.status}
                              </span>
                            </div>
                            <span className="text-[11px] font-medium text-slate-400 truncate">{pr.title}</span>
                            <span className="text-[9px] text-slate-500">Opened by {pr.author}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pipeline Runs */}
                  {repositoryInsights.pipelines && repositoryInsights.pipelines.length > 0 && (
                    <div className="flex flex-col gap-2.5 mt-2">
                      <span className="text-[10px] font-heading font-bold text-slate-500 uppercase tracking-wider">
                        CI/CD Pipelines
                      </span>
                      <div className="flex flex-col gap-2">
                        {repositoryInsights.pipelines.map((pipe, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-lg border border-white/[0.03] text-xs">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${pipe.status === 'Passed' ? 'bg-[#00E38C]' : 'bg-rose-400'}`} />
                              <span className="font-semibold text-slate-300">{pipe.name}</span>
                            </div>
                            <span className={`text-[10px] font-semibold ${pipe.status === 'Passed' ? 'text-slate-500' : 'text-rose-400'}`}>{pipe.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </>
          )}

        </div>
      </aside>

    </div>
  );
}
