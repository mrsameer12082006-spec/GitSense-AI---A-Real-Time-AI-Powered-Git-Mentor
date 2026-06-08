import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, LogOut, Settings, User, Info, FileText, Moon, 
  GitBranch, Activity, CheckCircle2, MessageSquare, Database, 
  ChevronLeft, ChevronRight, Download, Link as LinkIcon, Sparkles, FileText as FileIcon,
  AlertTriangle, RotateCw, Code, Paperclip, X, Loader2, Lock, RefreshCw
} from 'lucide-react';
import GitGraph from '../components/GitGraph';
import {
  currentUser,
  githubImportOptions,
  sidebarEmptyStateText
} from '../data/mockDashboardData';

// ── API Helper ──
const API_BASE = '/api';
const getToken = () => localStorage.getItem('gitsense_token');
const apiFetch = async (path, options = {}) => {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('gitsense_token');
    window.location.hash = '#login';
    throw new Error('Session expired');
  }
  return res;
};

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

  const [connectedRepo, setConnectedRepo] = useState(null);
  const [commits, setCommits] = useState([]);
  const [branches, setBranches] = useState([]);
  const [repoInsights, setRepoInsights] = useState(null);

  // ── GitHub Account & Repository List State ──
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [githubRepos, setGithubRepos] = useState([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [githubError, setGithubError] = useState('');
  const [importingRepo, setImportingRepo] = useState(null);
  const [profileInput, setProfileInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState('insights'); // insights, activity

  // ── Paste URL Modal States ──
  const [showPasteUrlModal, setShowPasteUrlModal] = useState(false);
  const [pasteUrlValue, setPasteUrlValue] = useState('');
  const [pasteUrlLoading, setPasteUrlLoading] = useState(false);
  const [pasteUrlError, setPasteUrlError] = useState('');
  const [showConnectSuccess, setShowConnectSuccess] = useState(false);

  // Derived values
  const isRepositoryConnected = !!connectedRepo;
  const connectedRepository = connectedRepo || { name: '', branch: 'main', url: 'https://github.com' };
  const repositoryInsights = repoInsights || { commits: 0, openPRs: 0, issues: 0, contributors: 0, securityStatus: 'N/A', latestCommits: [], activePRs: [], pipelines: [] };

  // ── GitHub status & repository fetching helpers ──
  const checkGithubStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/github/status');
      const data = await res.json();
      setIsGithubConnected(data.connected);
      if (data.connected) {
        setGithubUsername(data.githubUsername);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to check GitHub status:', err.message);
      setIsGithubConnected(false);
      return false;
    }
  }, [apiFetch]);

  const fetchGithubRepos = useCallback(async () => {
    setIsLoadingRepos(true);
    setGithubError('');
    try {
      const res = await apiFetch('/github/repos');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load repositories.');
      }
      setGithubRepos(data.repos || []);
    } catch (err) {
      setGithubError(err.message || 'Failed to fetch repositories.');
    } finally {
      setIsLoadingRepos(false);
    }
  }, [apiFetch]);

  const handleLinkProfile = async (e) => {
    if (e) e.preventDefault();
    if (!profileInput.trim()) return;
    
    setIsLinking(true);
    setGithubError('');
    try {
      const res = await apiFetch('/github/link-profile', {
        method: 'POST',
        body: JSON.stringify({ profileUrl: profileInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to link GitHub profile.');
      }
      setIsGithubConnected(true);
      setGithubUsername(data.githubUsername);
      setProfileInput('');
      
      // Fetch repositories immediately
      setIsLoadingRepos(true);
      const repoRes = await apiFetch('/github/repos');
      const repoData = await repoRes.json();
      if (repoRes.ok) {
        setGithubRepos(repoData.repos || []);
      }
    } catch (err) {
      setGithubError(err.message || 'Failed to link GitHub profile.');
    } finally {
      setIsLinking(false);
    }
  };

  const handleImportRepo = async (repo) => {
    setImportingRepo(repo.fullName);
    setGithubError('');
    try {
      const res = await apiFetch('/github/import', {
        method: 'POST',
        body: JSON.stringify({ fullName: repo.fullName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import repository.');
      }
      setConnectedRepo(data.repository);
      setShowConnectSuccess(true);
      setTimeout(() => setShowConnectSuccess(false), 2500);

      // Fetch new commits & insights immediately
      apiFetch(`/repos/${data.repository.id}/commits`)
        .then(r => r.json())
        .then(cData => {
          if (cData.commits) setCommits(cData.commits);
          if (cData.branches) setBranches(cData.branches);
        })
        .catch(() => {});

      apiFetch(`/repos/${data.repository.id}/insights`)
        .then(r => r.json())
        .then(insData => {
          if (insData.insights) setRepoInsights(insData.insights);
        })
        .catch(() => {});
    } catch (err) {
      setGithubError(err.message || 'Failed to import repository.');
      alert(err.message || 'Failed to import repository.');
    } finally {
      setImportingRepo(null);
    }
  };

  const handleDisconnectGithub = async () => {
    if (!window.confirm('Are you sure you want to disconnect your GitHub account?')) return;
    try {
      const res = await apiFetch('/github/disconnect', { method: 'POST' });
      if (res.ok) {
        setIsGithubConnected(false);
        setGithubUsername('');
        setGithubRepos([]);
        setConnectedRepo(null);
        setCommits([]);
        setBranches([]);
        setRepoInsights(null);
        alert('GitHub account disconnected.');
      }
    } catch (err) {
      alert('Failed to disconnect GitHub account.');
    }
  };

  // ── Handle OAuth callback message from popup ──
  useEffect(() => {
    const handleOAuthMessage = (event) => {
      if (event.data && event.data.type === 'GITSENSE_OAUTH_TOKEN') {
        const token = event.data.token;
        localStorage.setItem('gitsense_token', token);
        window.location.reload();
      } else if (event.data && event.data.type === 'GITSENSE_GITHUB_CONNECTED') {
        checkGithubStatus().then(connected => {
          if (connected) {
            fetchGithubRepos();
          }
        });
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [checkGithubStatus, fetchGithubRepos]);

  // ── Handle hash changes for redirect-based OAuth callback ──
  useEffect(() => {
    const handleHashCheck = () => {
      const hash = window.location.hash;
      if (hash.includes('github=connected')) {
        window.location.hash = hash.replace(/[?&]github=connected/, '');
        checkGithubStatus().then(connected => {
          if (connected) {
            fetchGithubRepos();
          }
        });
      }
    };
    handleHashCheck();
    window.addEventListener('hashchange', handleHashCheck);
    return () => window.removeEventListener('hashchange', handleHashCheck);
  }, [checkGithubStatus, fetchGithubRepos]);

  // Fetch current repository and its commits & insights on mount
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    
    apiFetch('/repos/current')
      .then(r => r.json())
      .then(data => {
        if (data.connected && data.repository) {
          setConnectedRepo(data.repository);
          
          apiFetch(`/repos/${data.repository.id}/commits`)
            .then(r => r.json())
            .then(cData => {
              if (cData.commits) setCommits(cData.commits);
              if (cData.branches) setBranches(cData.branches);
            })
            .catch(() => {});

          apiFetch(`/repos/${data.repository.id}/insights`)
            .then(r => r.json())
            .then(insData => {
              if (insData.insights) setRepoInsights(insData.insights);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    // Check GitHub Connection status on mount
    checkGithubStatus().then(connected => {
      if (connected) {
        fetchGithubRepos();
      }
    });
  }, [apiFetch, checkGithubStatus, fetchGithubRepos]);

  const handleNodeSelect = async (node) => {
    if (connectedRepo && node.sha) {
      try {
        const res = await apiFetch(`/repos/${connectedRepo.id}/commits/${node.sha}`);
        const data = await res.json();
        if (data.commit) {
          setSelectedNodeDetails({
            ...node,
            ...data.commit,
            files: data.commit.files || [],
            additions: data.commit.stats?.additions || 0,
            deletions: data.commit.stats?.deletions || 0,
          });
          return;
        }
      } catch (err) {
        console.error('Failed to fetch commit details:', err);
      }
    }
    setSelectedNodeDetails(node);
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
      <div className="relative flex-shrink-0 h-full z-20 flex">
        <aside className={`sidebar-collapsible sidebar-left border-r border-white/[0.06] bg-[#060913]/90 flex flex-col select-none flex-shrink-0 relative ${!isLeftSidebarOpen ? 'collapsed' : ''}`} style={{ width: '260px', minWidth: '260px' }}>
        
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
              onClick={() => window.location.hash = '#dashboard?section=chat'}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50"
            >
              <Sparkles size={16} className="text-slate-400" />
              <span>Git Assistant</span>
            </button>

            <button
              onClick={() => window.location.hash = '#dashboard?section=ide'}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50"
            >
              <Code size={16} className="text-slate-400" />
              <span>Code IDE</span>
            </button>

            <button
              onClick={() => window.location.hash = '#visualizer-page'}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#F8FAFC]"
            >
              <Activity size={16} className="text-[#7C5CFF]" />
              <span>Visualization Graph</span>
            </button>
          </div>

          {/* GitHub Repositories Section */}
          <div className="px-3 py-2 border-t border-white/[0.05] mt-2 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">GitHub Repositories</span>
              {isGithubConnected && (
                <button
                  onClick={fetchGithubRepos}
                  disabled={isLoadingRepos}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Refresh Repositories"
                >
                  <RefreshCw size={10} className={isLoadingRepos ? 'animate-spin' : ''} />
                </button>
              )}
            </div>

            {!isGithubConnected ? (
              <form onSubmit={handleLinkProfile} className="bg-gradient-to-b from-slate-950 to-slate-900/40 border border-white/[0.05] p-3.5 rounded-xl flex flex-col gap-3 shadow-lg text-left">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-200">Connect GitHub Profile</span>
                  <span className="text-[10px] text-slate-400 leading-normal">
                    Enter your username or profile URL to fetch public repositories.
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="e.g. github.com/username"
                    value={profileInput}
                    onChange={(e) => setProfileInput(e.target.value)}
                    disabled={isLinking}
                    className="w-full bg-slate-900/80 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#7C5CFF]/50 transition-all"
                  />
                  {githubError && (
                    <span className="text-[9px] text-rose-400 px-1">{githubError}</span>
                  )}
                  <button
                    type="submit"
                    disabled={isLinking || !profileInput.trim()}
                    className="w-full py-2 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1 hover:shadow-[0_0_12px_rgba(124,92,255,0.25)]"
                  >
                    {isLinking ? (
                      <RefreshCw size={10} className="animate-spin" />
                    ) : (
                      <GitBranch size={10} />
                    )}
                    <span>{isLinking ? 'Linking...' : 'Fetch Repositories'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                {githubError && (
                  <span className="text-[9px] text-rose-400 px-1">{githubError}</span>
                )}
                {isLoadingRepos && githubRepos.length === 0 ? (
                  <div className="flex items-center justify-center py-4 gap-2 text-slate-500 text-[10px]">
                    <RefreshCw size={12} className="animate-spin text-[#7C5CFF]" />
                    <span>Loading...</span>
                  </div>
                ) : githubRepos.length === 0 ? (
                  <span className="text-[10px] text-slate-500 text-center py-2">No repositories found.</span>
                ) : (
                  githubRepos.map((repo) => {
                    const isActive = connectedRepo && connectedRepo.fullName === repo.fullName;
                    const isImportingThis = importingRepo === repo.fullName;

                    return (
                      <div
                        key={repo.fullName}
                        className={`group/repo flex items-center justify-between bg-slate-900/40 hover:bg-slate-900/80 border rounded-lg px-2.5 py-2 transition-all min-w-0 ${
                          isActive 
                            ? 'border-[#00E38C]/30 bg-[#00E38C]/5 shadow-[0_0_8px_rgba(0,227,140,0.05)]' 
                            : 'border-white/[0.04] hover:border-white/[0.08]'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-2 text-left">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span 
                              className={`text-[11px] font-semibold truncate block ${
                                isActive ? 'text-white' : 'text-slate-300 group-hover/repo:text-white'
                              }`} 
                              title={repo.fullName}
                            >
                              {repo.name}
                            </span>
                            {repo.isPrivate && (
                              <Lock size={9} className="text-amber-400 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[9px] text-slate-500">
                            {repo.language && (
                              <span className="truncate max-w-[50px]">{repo.language}</span>
                            )}
                            {repo.stars > 0 && (
                              <span>⭐ {repo.stars}</span>
                            )}
                          </div>
                        </div>

                        {isActive ? (
                          <div className="flex items-center gap-1 text-[9px] text-[#00E38C] font-semibold shrink-0 select-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00E38C] animate-pulse" />
                            <span>Active</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleImportRepo(repo)}
                            disabled={!!importingRepo}
                            className={`px-2 py-1 border text-[9px] font-bold rounded-md transition-all shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-0.5 ${
                              isImportingThis 
                                ? 'bg-[#7C5CFF]/10 border-[#7C5CFF]/25 text-[#7C5CFF]'
                                : 'bg-slate-800/60 border-white/[0.08] hover:border-[#7C5CFF]/40 hover:bg-[#7C5CFF]/20 text-slate-300 hover:text-white'
                            }`}
                          >
                            {isImportingThis ? (
                              <RefreshCw size={8} className="animate-spin" />
                            ) : (
                              <Download size={8} />
                            )}
                            <span>{isImportingThis ? 'Cloning' : 'Import'}</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                <div className="flex items-center justify-between border-t border-white/[0.04] pt-1.5 mt-1 px-1">
                  <span className="text-[9px] text-slate-500 font-mono">@{githubUsername}</span>
                  <button
                    onClick={handleDisconnectGithub}
                    className="text-[9px] text-slate-500 hover:text-rose-400 transition-colors underline cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <span className="text-[10px] text-slate-600 font-mono tracking-tight select-none">VISUALIZATION GRAPH ACTIVE</span>
          </div>
        </div>
      </aside>

        {/* Toggle Button for Left Sidebar */}
        {!isLeftSidebarOpen && (
          <button 
            className="sidebar-toggle-btn left closed"
            onClick={() => setIsLeftSidebarOpen(true)}
            title="Expand Sidebar"
          >
            <ChevronRight size={14} />
          </button>
        )}
        {isLeftSidebarOpen && (
          <button 
            className="sidebar-toggle-btn left open hidden md:flex"
            onClick={() => setIsLeftSidebarOpen(false)}
            title="Collapse Sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

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
                          if (option.id === 'connect') {
                            const urlOrUsername = prompt('Enter your GitHub profile URL or Username:');
                            if (urlOrUsername && urlOrUsername.trim()) {
                              setIsLoadingRepos(true);
                              apiFetch('/github/link-profile', {
                                method: 'POST',
                                body: JSON.stringify({ profileUrl: urlOrUsername.trim() }),
                              }).then(r => r.json()).then(data => {
                                if (data.githubUsername) {
                                  setIsGithubConnected(true);
                                  setGithubUsername(data.githubUsername);
                                  apiFetch('/github/repos').then(r => r.json()).then(repoData => {
                                    setGithubRepos(repoData.repos || []);
                                    setIsLoadingRepos(false);
                                  }).catch(() => setIsLoadingRepos(false));
                                } else {
                                  alert(data.error || 'Failed to link profile.');
                                  setIsLoadingRepos(false);
                                }
                              }).catch(() => {
                                alert('Failed to link profile.');
                                setIsLoadingRepos(false);
                              });
                            }
                          } else if (option.id === 'paste') {
                            setShowPasteUrlModal(true);
                            setPasteUrlValue('');
                            setPasteUrlError('');
                          }
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-3 text-slate-300 hover:text-white hover:bg-slate-900 cursor-pointer"
                      >
                        {option.icon === 'GitBranch' && <GitBranch size={14} />}
                        {option.icon === 'Download' && <Download size={14} />}
                        {option.icon === 'Link' && <LinkIcon size={14} />}
                        {option.icon === 'Paperclip' && <Paperclip size={14} />}
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
                        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
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
            <div className="mt-2 gitgraph-wrapper rounded-2xl p-4">
              <GitGraph 
                state={graphState} 
                onNodeSelect={handleNodeSelect} 
                commits={commits}
                branches={branches}
              />
            </div>

            {/* Bottom Commit Inspector Details Panel */}
            {selectedNodeDetails ? (
              <motion.div
                key={selectedNodeDetails.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-12 gap-5 mt-2 w-full text-left"
              >
                {/* Column 1: Commit details, author and file changes (Takes 5 cols) */}
                <div className="md:col-span-5 gitsense-card p-6 flex flex-col gap-4.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 select-none">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        COMMIT DETAILS
                      </span>
                      <span className="bg-[#10B981]/15 text-[#10B981] px-1.5 py-0.5 rounded text-[9px] font-bold select-none flex items-center gap-0.5">
                        <Sparkles size={8} /> AI
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                      <h4 className="font-mono text-xl font-extrabold text-[#00D4FF]">
                        {selectedNodeDetails.hash}
                      </h4>
                      <span className="text-xs text-slate-500 font-mono select-none">
                        {selectedNodeDetails.date}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-100 leading-snug">
                      {selectedNodeDetails.message}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider select-none">Author</span>
                    <div className="flex items-center gap-2 bg-slate-950/40 border border-white/[0.04] p-2.5 rounded-xl">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] flex items-center justify-center text-white text-xs font-bold select-none">
                        {selectedNodeDetails.author.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-slate-200 truncate">{selectedNodeDetails.author}</span>
                        <span className="text-[9px] text-slate-500 font-mono truncate select-none">{selectedNodeDetails.author.toLowerCase()}@gitsense.ai</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider select-none">
                      Files Changed ({selectedNodeDetails.files?.length || 0})
                    </span>
                    <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                      {selectedNodeDetails.files?.map((f, i) => {
                        const filename = typeof f === 'object' ? f.filename : f;
                        const ext = filename ? filename.split('.').pop().toUpperCase() : '';
                        const addition = typeof f === 'object' ? (f.additions ?? 0) : (selectedNodeDetails.additions?.[i] || Math.floor(Math.random() * 80) + 10);
                        return (
                          <div key={i} className="flex items-center justify-between bg-slate-950/20 border border-white/[0.03] px-3 py-2 rounded-xl text-[11px] font-mono text-slate-300">
                            <div className="flex items-center gap-2 truncate">
                              <FileIcon size={12} className="text-[#00D4FF]/60" />
                              <span className="truncate">{filename}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-bold text-slate-400 font-sans bg-slate-900 border border-white/[0.04] px-1 py-0.5 rounded select-none">
                                {ext}
                              </span>
                              <span className="text-[10px] font-bold text-[#10B981] font-sans">
                                +{addition}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Column 2: AI Analysis panel (Takes 7 cols) */}
                <div className="md:col-span-7 gitsense-card p-6 flex flex-col gap-4.5 justify-between">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-1.5 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-heading">
                        AI ANALYSIS
                      </span>
                    </div>

                    <div className="flex flex-col gap-3.5 text-left">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-[#10B981] flex items-center gap-1.5 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> PURPOSE
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed pl-3">
                          {selectedNodeDetails.purpose || selectedNodeDetails.explanation}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-[#10B981] flex items-center gap-1.5 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> IMPACT
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed pl-3">
                          {selectedNodeDetails.impact || "Modifies key logic branches to implement target functionality."}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-[#10B981] flex items-center gap-1.5 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> MERGE SAFETY
                        </span>
                        
                        <div className="flex items-center gap-3 pl-3">
                          <div className="flex-1 h-2 bg-slate-900 border border-white/[0.04] rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${selectedNodeDetails.safety || 100}%`,
                                background: (selectedNodeDetails.safety || 100) < 80 
                                  ? 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%)' 
                                  : 'linear-gradient(90deg, #10B981 0%, #34D399 100%)'
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-300 font-mono min-w-[28px] text-right select-none">
                            {selectedNodeDetails.safety || 100}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Warning banner block (only if safety is below 80%) */}
                  {(selectedNodeDetails.safety || 100) < 80 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl p-3.5 flex items-center gap-3 text-xs leading-relaxed mt-4">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>
                        Potential conflict in {selectedNodeDetails.conflictFiles?.join(', ') || "conflicting files"}.
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="gitsense-card p-6 text-center flex flex-col items-center justify-center py-10 gap-3 text-slate-500 mt-2 select-none">
                <Sparkles size={20} className="opacity-30 animate-pulse text-[#7C5CFF]" />
                <p className="text-xs px-4 leading-relaxed font-medium">
                  Select a commit node in the graph map above to inspect detailed code changes and AI insights.
                </p>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ── RIGHT SIDEBAR WRAPPER ── */}
      <div className="relative flex-shrink-0 h-full flex hidden xl:flex z-20">
        {/* Toggle Button for Right Sidebar */}
        {!isRightSidebarOpen && (
          <button 
            className="sidebar-toggle-btn right closed"
            onClick={() => setIsRightSidebarOpen(true)}
            title="Expand Details"
          >
            <ChevronLeft size={14} />
          </button>
        )}
        {isRightSidebarOpen && (
          <button 
            className="sidebar-toggle-btn right open hidden xl:flex"
            onClick={() => setIsRightSidebarOpen(false)}
            title="Collapse Details"
          >
            <ChevronRight size={14} />
          </button>
        )}

        {/* ── RIGHT SIDEBAR ── */}
        <aside className={`sidebar-collapsible sidebar-right border-l border-white/[0.06] bg-[#060913]/90 flex flex-col select-none flex-shrink-0 relative ${!isRightSidebarOpen ? 'collapsed' : ''}`} style={{ width: '300px', minWidth: '300px' }}>
        <div className="sidebar-inner w-[300px] h-full p-4 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
          
          {/* Header with Collapse Button */}
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.05]">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
              REPOSITORY INSIGHTS
            </span>
            <div className="flex items-center gap-1">
              {isRepositoryConnected && (
                <button
                  onClick={async () => {
                    if (!connectedRepo) return;
                    try {
                      const res = await apiFetch(`/repos/${connectedRepo.id}/insights`);
                      const ins = await res.json();
                      if (ins.insights) setRepoInsights(ins.insights);
                      
                      // Also refetch commits
                      const cRes = await apiFetch(`/repos/${connectedRepo.id}/commits`);
                      const cData = await cRes.json();
                      if (cData.commits) setCommits(cData.commits);
                      if (cData.branches) setBranches(cData.branches);
                    } catch {}
                  }}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Refresh Insights"
                >
                  <RotateCw size={12} className="hover:rotate-45 transition-transform" />
                </button>
              )}
              <button 
                onClick={() => setIsRightSidebarOpen(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Collapse Sidebar"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Repo Insights Content */}
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
              {/* Tab Switcher */}
              <div className="flex bg-slate-950 p-0.5 rounded-xl border border-white/[0.06] mb-3">
                <button
                  onClick={() => setActiveSidebarTab('insights')}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    activeSidebarTab === 'insights'
                      ? 'bg-slate-900 border border-white/[0.06] text-[#00D4FF]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Repo Insights
                </button>
                <button
                  onClick={() => setActiveSidebarTab('activity')}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    activeSidebarTab === 'activity'
                      ? 'bg-slate-900 border border-white/[0.06] text-[#00D4FF]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Recent Activity
                </button>
              </div>

              {activeSidebarTab === 'insights' ? (
                /* Repo Summary Card */
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
              ) : (
                /* Recent Activity Card */
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
              )}
            </>
          )}

        </div>
      </aside>
    </div>

      {/* ── PASTE URL MODAL ── */}
      <AnimatePresence>
        {showPasteUrlModal && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowPasteUrlModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              {showConnectSuccess ? (
                <div className="bg-slate-950 border border-[#00E38C]/30 rounded-2xl p-8 w-full max-w-md text-center flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#00E38C]/15 border border-[#00E38C]/30 flex items-center justify-center text-[#00E38C]">
                    <CheckCircle2 size={28} />
                  </div>
                  <h3 className="text-lg font-bold font-heading text-white">Repository Connected!</h3>
                  <p className="text-sm text-slate-400">Your repository has been successfully linked to GitSense AI.</p>
                  <button
                    onClick={() => { setShowPasteUrlModal(false); setShowConnectSuccess(false); }}
                    className="mt-2 px-6 py-2 bg-[#7C5CFF] hover:bg-[#8C6DFF] text-white rounded-xl text-sm font-semibold transition-all cursor-pointer"
                  >
                    Start Visualizing
                  </button>
                </div>
              ) : (
                <div className="bg-slate-950 border border-white/[0.08] rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold font-heading text-white flex items-center gap-2">
                      <LinkIcon size={16} className="text-[#00D4FF]" /> Paste Repository URL
                    </h3>
                    <button onClick={() => setShowPasteUrlModal(false)} className="text-slate-400 hover:text-white cursor-pointer"><X size={16} /></button>
                  </div>
                  <p className="text-xs text-slate-400">Enter a public GitHub repository URL to connect it.</p>
                  <input
                    type="text"
                    placeholder="https://github.com/owner/repo"
                    value={pasteUrlValue}
                    onChange={(e) => { setPasteUrlValue(e.target.value); setPasteUrlError(''); }}
                    className="w-full bg-slate-900 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#7C5CFF]/60 transition-all font-mono"
                    autoFocus
                  />
                  {pasteUrlError && <p className="text-xs text-rose-400">{pasteUrlError}</p>}
                  <button
                    onClick={async () => {
                      if (!pasteUrlValue.trim()) { setPasteUrlError('Please enter a URL.'); return; }
                      setPasteUrlLoading(true);
                      setPasteUrlError('');
                      try {
                        const res = await apiFetch('/repos/connect-url', {
                          method: 'POST',
                          body: JSON.stringify({ url: pasteUrlValue }),
                        });
                        const data = await res.json();
                        if (res.ok && data.repository) {
                          setConnectedRepo(data.repository);
                          setShowConnectSuccess(true);
                           // Fetch commits
                           apiFetch(`/repos/${data.repository.id}/commits`).then(r => r.json()).then(cData => {
                             if (cData.commits) setCommits(cData.commits);
                             if (cData.branches) setBranches(cData.branches);
                           }).catch(() => {});
                          // Fetch insights
                          apiFetch(`/repos/${data.repository.id}/insights`).then(r => r.json()).then(ins => {
                            if (ins.insights) setRepoInsights(ins.insights);
                          }).catch(() => {});
                        } else {
                          setPasteUrlError(data.error || 'Failed to connect.');
                        }
                      } catch {
                        setPasteUrlError('Backend not running. Start with: cd backend && npm run dev');
                      } finally {
                        setPasteUrlLoading(false);
                      }
                    }}
                    disabled={pasteUrlLoading}
                    className="w-full py-3 bg-[#7C5CFF] hover:bg-[#8C6DFF] text-white rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {pasteUrlLoading ? <><Loader2 size={14} className="animate-spin" /> Connecting...</> : 'Connect Repository'}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
