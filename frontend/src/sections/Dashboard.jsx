import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, ChevronDown, LogOut, Settings, User, Info, FileText, Sun, Moon, 
  GitBranch, Send, Paperclip, Mic, Activity, Users, CheckCircle2, AlertTriangle, 
  RefreshCw, Plus, HelpCircle, Play, ArrowRight, Lock, GitCommit, GitPullRequest, 
  Sparkles, Terminal, Check, Copy, X, ShieldAlert, Cpu, Eye, MessageSquare, Database,
  ChevronLeft, ChevronRight, Download, Link as LinkIcon
} from 'lucide-react';
import {
  currentUser,
  isRepositoryConnected,
  connectedRepository,
  githubImportOptions,
  repositoryInsights,
  sidebarEmptyStateText,
  chatInputPlaceholder,
  welcomeSubtitle,
  getGreeting
} from '../data/mockDashboardData';

export default function Dashboard() {
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
  
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(true);

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
    // Initial check
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('gitsense_left_sidebar', JSON.stringify(isLeftSidebarOpen));
  }, [isLeftSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('gitsense_right_sidebar', JSON.stringify(isRightSidebarOpen));
  }, [isRightSidebarOpen]);

  // Current active conversation messages (placeholder logic kept)
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  
  // Custom states
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioWave, setAudioWave] = useState([10, 15, 8, 24, 18, 12, 30, 20, 14, 25, 9, 16]);
  const [attachedFile, setAttachedFile] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Audio wave animation simulation
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setAudioWave(prev => prev.map(() => Math.floor(Math.random() * 26) + 4));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const submitUserMessage = (text) => {
    if (!text.trim()) return;

    const userMsg = { sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    setIsAiTyping(true);

    setTimeout(() => {
      let aiMsg = { sender: 'ai', text: '' };
      const query = text.toLowerCase();
      
      if (query.includes('merge')) {
        aiMsg.text = 'Analyzing merge readiness for `feature/login` into `main`...';
        aiMsg.insight = 'Main branch has advanced by 2 commits since your feature branch split. No direct merge conflicts were found with `main`, but branch health is rated 94% safe.';
        aiMsg.recommendation = 'It is recommended to run a merge check locally or rebase before pushing to origin.';
        aiMsg.commandBlock = `git checkout main\ngit pull origin main\ngit checkout feature/login\ngit merge main\n# Verify build\nnpm run test`;
      } else if (query.includes('explain') || query.includes('code change')) {
        aiMsg.text = 'Here is the summary explanation of the changes in the latest commit on `feature/login`:';
        aiMsg.insight = 'This commit introduces authentication state persistence and updates the login route callback to handle session storage securely.';
        aiMsg.codeBlock = `// src/sections/AuthPage.jsx\nconst handleSubmit = (e) => {\n  e.preventDefault();\n  setFormSubmitted(true);\n  setTimeout(() => {\n    setFormSubmitted(false);\n    window.location.hash = '#dashboard';\n  }, 2000);\n};`;
      } else if (query.includes('diff')) {
        aiMsg.text = 'Generating file differences between your local branch and origin/main:';
        aiMsg.diff = `--- a/frontend/src/sections/AuthPage.jsx\n+++ b/frontend/src/sections/AuthPage.jsx\n@@ -25,2 +25,2 @@\n-      // Reset form and go to home page\n-      window.location.hash = '#home';\n+      // Redirect to the newly generated AI Dashboard\n+      window.location.hash = '#dashboard';`;
        aiMsg.insight = '1 file changed, 2 insertions, 2 deletions. Successfully updated redirection path to dashboard.';
      } else if (query.includes('ci') || query.includes('failing')) {
        aiMsg.text = 'Scanning latest workflow logs from Github Actions (CI Pipeline #10842):';
        aiMsg.insight = 'The job "Build & Deploy" failed at the linting step. The linter flagged an unused import in `src/sections/AIShowcase.jsx` and a missing key in a map inside `src/sections/HealthDashboard.jsx`.';
        aiMsg.recommendation = 'Run "npm run lint" locally and resolve the imports before pushing your next commit.';
        aiMsg.commandBlock = `npm run lint\n# or manually clean imports in AIShowcase.jsx`;
      } else {
        aiMsg.text = `Understood. I have scanned the repository files and found no immediate blockages. What specific aspect of your git state or workspace would you like me to inspect?`;
      }

      setMessages(prev => [...prev, aiMsg]);
      setIsAiTyping(false);
    }, 1500);
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      submitUserMessage(inputVal);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setInputVal('Can I merge this branch?');
    } else {
      setIsRecording(true);
    }
  };

  const handleFileAttach = () => {
    if (attachedFile) {
      setAttachedFile(null);
    } else {
      setAttachedFile({ name: 'auth.js', size: '2.4 KB' });
    }
  };

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
            <button 
              onClick={() => setIsLeftSidebarOpen(false)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Collapse Sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Sidebar Navigation */}
          <div className="p-3 flex flex-col gap-1">
            <button
              onClick={() => window.location.hash = '#dashboard'}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#F8FAFC]"
            >
              <Sparkles size={16} className="text-[#7C5CFF]" />
              <span>Git Assistant</span>
            </button>

            <button
              onClick={() => window.location.hash = '#visualizer-page'}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50"
            >
              <Activity size={16} className="text-slate-400" />
              <span>Visualization Graph</span>
            </button>
          </div>

          {/* Your Repository Section */}
          <div className="px-4 py-2.5 border-t border-white/[0.05] mt-2 text-left">
            <button
              onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
              className="w-full flex items-center justify-between text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider py-1.5 hover:text-slate-300 transition-colors duration-200 cursor-pointer"
            >
              <span>Your Repository</span>
              <ChevronDown 
                size={12} 
                className={`transition-transform duration-200 ${isRepoDropdownOpen ? '' : '-rotate-90'}`} 
              />
            </button>

            {isRepoDropdownOpen && (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {isRepositoryConnected && connectedRepository ? (
                  <a
                    href={connectedRepository.url || "https://github.com"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col gap-1 bg-slate-950/40 hover:bg-slate-900 border border-white/[0.04] hover:border-white/[0.08] p-2.5 rounded-xl transition-all duration-200 cursor-pointer text-left min-w-0"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 truncate">
                      <GitBranch size={12} className="text-[#00D4FF] shrink-0" />
                      <span className="truncate">{connectedRepository.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00E38C]" />
                      <span className="truncate">active: {connectedRepository.branch}</span>
                    </div>
                  </a>
                ) : (
                  <div className="bg-slate-950/20 border border-white/[0.03] p-2.5 rounded-xl text-[11px] text-slate-500 text-center flex flex-col gap-2">
                    <span>No repository connected</span>
                    <button
                      onClick={() => {
                        setIsGithubDropdownOpen(true);
                      }}
                      className="px-2.5 py-1 bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF] hover:bg-[#7C5CFF]/25 hover:text-white rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                    >
                      Connect Now
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat History Placeholder */}
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
                    {/* Header info */}
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

        {/* ── CENTRAL MAIN WORKSPACE PANELS ── */}
        <div className="flex-1 flex overflow-hidden min-w-0">

          {/* GIT ASSISTANT CHAT INTERFACE */}
          <div className="flex-1 flex flex-col min-w-0 relative bg-[var(--bg-color)]">
            
            {/* Chat Messages List */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 custom-scrollbar">
              
              {messages.length === 0 ? (
                /* Welcome Area Empty State */
                <div className="flex-1 flex flex-col items-center justify-center text-center max-w-[580px] mx-auto select-none mt-12 md:mt-24">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] p-[1.5px] flex items-center justify-center mb-6 shadow-2xl shadow-[#7C5CFF]/20"
                  >
                    <div className="w-full h-full bg-[#060913] rounded-[15px] flex items-center justify-center">
                      <Sparkles size={24} className="text-[#00D4FF] animate-pulse" />
                    </div>
                  </motion.div>
                  
                  <h3 className="text-3xl font-bold font-heading text-slate-100 mb-3">
                    {getGreeting(currentUser.name)}
                  </h3>
                  <p className="text-slate-400 text-base mb-8 leading-relaxed">
                    {welcomeSubtitle}
                  </p>
                </div>
              ) : (
                /* Conversation flow */
                <div className="max-w-[800px] mx-auto w-full flex flex-col gap-6">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-4 ${
                        msg.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {/* Avatar */}
                      {msg.sender === 'ai' && (
                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/[0.1] flex items-center justify-center text-slate-300 flex-shrink-0">
                          <Sparkles size={14} className="text-[#7C5CFF]" />
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={`max-w-[90%] rounded-2xl px-5 py-4 border ${
                          msg.sender === 'user'
                            ? 'bg-slate-900 border-white/[0.08] text-slate-200'
                            : 'bg-slate-950/60 border-[#7C5CFF]/15 text-slate-300'
                        }`}
                      >
                        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                        </p>
                      {/* Render Diff Block if exists */}
                      {msg.diff && (
                        <div className="mt-3 rounded-lg overflow-hidden border border-white/[0.08] bg-[#060913]">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-white/[0.06] text-[10px] font-mono text-slate-400">
                            <span>git diff view</span>
                            <button
                              onClick={() => copyToClipboard(msg.diff, `diff-${idx}`)}
                              className="hover:text-white transition-colors cursor-pointer"
                            >
                              {copiedIndex === `diff-${idx}` ? 'Copied' : <Copy size={11} />}
                            </button>
                          </div>
                          <pre className="p-3 text-[11px] font-mono text-left overflow-x-auto leading-relaxed bg-[#030712] text-slate-400 select-all">
                            {msg.diff.split('\n').map((line, lIdx) => {
                              let cls = '';
                              if (line.startsWith('+')) cls = 'text-[#00E38C] bg-[#00E38C]/5 px-1';
                              if (line.startsWith('-')) cls = 'text-rose-400 bg-rose-500/5 px-1';
                              if (line.startsWith('@@')) cls = 'text-cyan-400 font-bold';
                              return (
                                <div key={lIdx} className={cls}>
                                  {line}
                                </div>
                              );
                            })}
                          </pre>
                        </div>
                      )}

                      {/* Render Code Block if exists */}
                      {msg.codeBlock && (
                        <div className="mt-3 rounded-lg overflow-hidden border border-white/[0.08] bg-[#060913]">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-white/[0.06] text-[10px] font-mono text-slate-400">
                            <span>javascript</span>
                            <button
                              onClick={() => copyToClipboard(msg.codeBlock, `code-${idx}`)}
                              className="hover:text-white transition-colors cursor-pointer"
                            >
                              {copiedIndex === `code-${idx}` ? 'Copied' : <Copy size={11} />}
                            </button>
                          </div>
                          <pre className="p-3 text-[11px] font-mono text-left overflow-x-auto leading-relaxed bg-[#030712] text-slate-300 select-all">
                            <code>{msg.codeBlock}</code>
                          </pre>
                        </div>
                      )}

                      {/* Render Command Block if exists */}
                      {msg.commandBlock && (
                        <div className="mt-3 rounded-lg overflow-hidden border border-white/[0.08] bg-[#060913]">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-white/[0.06] text-[10px] font-mono text-slate-400">
                            <span>Git Commands</span>
                            <button
                              onClick={() => copyToClipboard(msg.commandBlock, `cmd-${idx}`)}
                              className="hover:text-white transition-colors cursor-pointer"
                            >
                              {copiedIndex === `cmd-${idx}` ? 'Copied' : <Copy size={11} />}
                            </button>
                          </div>
                          <pre className="p-3 text-[11px] font-mono text-left overflow-x-auto leading-relaxed bg-[#010409] text-[#00D4FF] select-all flex items-start gap-2">
                            <Terminal size={12} className="mt-0.5 text-slate-500" />
                            <code>{msg.commandBlock}</code>
                          </pre>
                        </div>
                      )}

                      {/* Insights section */}
                      {msg.insight && (
                        <div className="mt-3 pt-3 border-t border-white/[0.05] flex flex-col gap-1.5">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <Info size={12} className="text-[#00D4FF]" /> GitSense Insights
                          </span>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {msg.insight}
                          </p>
                        </div>
                      )}

                      {/* Recommendation section */}
                      {msg.recommendation && (
                        <div className="mt-2 pt-2 border-t border-white/[0.05] flex flex-col gap-1">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <CheckCircle2 size={12} className="text-[#00E38C]" /> Recommended Action
                          </span>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {msg.recommendation}
                          </p>
                        </div>
                      )}
                      </div>

                      {/* User Avatar */}
                      {msg.sender === 'user' && (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] flex items-center justify-center text-white text-xs font-heading font-bold flex-shrink-0">
                          {currentUser.avatarInitial}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* AI Typing Indicator */}
                  {isAiTyping && (
                    <div className="flex gap-4 justify-start">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/[0.1] flex items-center justify-center text-slate-300 flex-shrink-0">
                        <Sparkles size={14} className="text-[#7C5CFF] animate-pulse" />
                      </div>
                      <div className="bg-slate-950/60 border border-white/[0.06] rounded-2xl px-5 py-4 text-slate-400 flex items-center gap-2">
                        <span className="text-xs">Analyzing commits...</span>
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0s' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0.4s' }} />
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Bottom Chat Input Bar */}
            <div className="p-4 border-t border-white/[0.06] bg-[#060913]/60 backdrop-blur-md select-none flex-shrink-0">
              <div className="max-w-[800px] mx-auto flex flex-col gap-2">
                
                {/* Active file attachment indicator */}
                {attachedFile && (
                  <div className="flex items-center justify-between self-start px-2.5 py-1 bg-slate-900 border border-white/[0.08] rounded-lg text-xs font-mono text-[#00D4FF] gap-2">
                    <div className="flex items-center gap-1.5">
                      <FileText size={12} />
                      <span>{attachedFile.name} ({attachedFile.size})</span>
                    </div>
                    <button onClick={() => setAttachedFile(null)} className="hover:text-white cursor-pointer">
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Input container */}
                <div className="relative flex items-center bg-slate-900/90 border border-white/[0.08] hover:border-white/[0.15] focus-within:border-[#7C5CFF]/60 rounded-xl px-3 py-2.5 transition-all">
                  
                  {/* Attach File Button */}
                  <button
                    onClick={handleFileAttach}
                    className={`p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer ${attachedFile ? 'text-[#00D4FF] bg-slate-850' : ''}`}
                    title="Attach Repository File"
                  >
                    <Paperclip size={16} />
                  </button>

                  {/* Chat Text Input */}
                  <input
                    type="text"
                    placeholder={isRecording ? 'Listening for prompt...' : chatInputPlaceholder}
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isRecording || !isRepositoryConnected}
                    className="flex-1 bg-transparent border-none outline-none px-3 text-sm text-slate-100 placeholder-slate-500 disabled:opacity-50"
                  />

                  {/* Microphone / Waveform */}
                  <div className="flex items-center gap-2">
                    {isRecording && (
                      <div className="flex items-center gap-[2px] px-2">
                        {audioWave.map((h, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: h }}
                            className="w-[2px] bg-[#7C5CFF] rounded-full"
                            style={{ minHeight: '3px', maxHeight: '30px' }}
                          />
                        ))}
                      </div>
                    )}

                    <button
                      onClick={toggleRecording}
                      disabled={!isRepositoryConnected}
                      className={`p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isRecording 
                          ? 'text-rose-400 bg-rose-500/10 animate-pulse' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Voice Input"
                    >
                      <Mic size={16} />
                    </button>

                    {/* Send Button */}
                    <button
                      onClick={() => submitUserMessage(inputVal)}
                      disabled={(!inputVal.trim() && !isRecording) || !isRepositoryConnected}
                      className="p-2 rounded-lg bg-[#7C5CFF] hover:bg-[#8C6DFF] text-white disabled:opacity-40 disabled:hover:bg-[#7C5CFF] transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Send size={15} />
                    </button>
                  </div>

                </div>
              </div>
            </div>

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
          {/* Header with Collapse Button */}
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
            <span className="text-xs font-bold font-heading text-slate-400 tracking-wider uppercase flex items-center gap-2">
              <Database size={13} className="text-[#7C5CFF]" /> Repository Details
            </span>
            <button 
              onClick={() => setIsRightSidebarOpen(false)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Collapse Sidebar"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          
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
