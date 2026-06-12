import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, LogOut, Settings, User, Info, FileText, Moon, 
  GitBranch, Activity, CheckCircle2, MessageSquare, Database, 
  ChevronLeft, ChevronRight, Download, Link as LinkIcon, Sparkles, FileText as FileIcon,
  AlertTriangle, RotateCw, Code, Paperclip, X, Loader2, Lock, RefreshCw, Check, AlertCircle, ArrowRightCircle, Plus, Search
} from 'lucide-react';

// ── API Helper ──
const API_BASE = '/api';
const getToken = () => localStorage.getItem('gitsense_token');
const apiFetch = async (path, options = {}) => {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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
  } catch (err) {
    console.error('[API Fetch Error]', err);
    throw err;
  }
};

export default function MergeControlPage() {
  // Theme state
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    return localStorage.getItem('gitsense_theme') !== 'light';
  });

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('gitsense_user');
      return saved ? JSON.parse(saved) : { name: 'User', email: '', avatarInitial: 'U' };
    } catch { return { name: 'User', email: '', avatarInitial: 'U' }; }
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

  // Sidebar navigation and UI states
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('gitsense_left_sidebar');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('gitsense_left_sidebar', JSON.stringify(isLeftSidebarOpen));
  }, [isLeftSidebarOpen]);

  // GitHub integration states
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [profileInput, setProfileInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [githubError, setGithubError] = useState('');
  const [githubRepos, setGithubRepos] = useState([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [importingRepo, setImportingRepo] = useState(null);
  const [connectedRepo, setConnectedRepo] = useState(null);

  // Merge dashboard states
  const [branches, setBranches] = useState([]);
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [resolutionBranchName, setResolutionBranchName] = useState('');
  
  // Loading & status states
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isCheckingMerge, setIsCheckingMerge] = useState(false);
  const [isCreatingMergeBranch, setIsCreatingMergeBranch] = useState(false);
  const [mergeStatus, setMergeStatus] = useState(null); // 'clean' | 'conflict' | 'error' | null
  
  // Conflict resolution states
  const [conflicts, setConflicts] = useState([]); // [{ file, content, conflictBlocks }]
  const [selectedFileIdx, setSelectedFileIdx] = useState(null);
  const [aiResolutions, setAiResolutions] = useState({}); // { [file]: { recommendedResolution, explanation, loading, error } }
  const [customResolutions, setCustomResolutions] = useState({}); // { [file]: string }
  const [applyingResolution, setApplyingResolution] = useState(false);
  const [resolutionProgress, setResolutionProgress] = useState([]); // files that are completed

  // Final push/merge states
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeSuccess, setFinalizeSuccess] = useState(null);
  const [avatarDropdownOpen, setAvatarDropdownOpen] = useState(false);
  const [showConnectSuccess, setShowConnectSuccess] = useState(false);

  // Chat History states
  const [chatHistory, setChatHistory] = useState({ today: [], week: [], month: [], older: [] });
  const [historySearch, setHistorySearch] = useState('');

  const loadChatHistory = useCallback(async () => {
    try {
      const r = await apiFetch(`/conversations${historySearch ? `?search=${encodeURIComponent(historySearch)}` : ''}`);
      const data = await r.json();
      if (data.conversations) setChatHistory(data.conversations);
    } catch {}
  }, [historySearch]);

  useEffect(() => { loadChatHistory(); }, [loadChatHistory]);

  // Sync profile linking info
  useEffect(() => {
    const checkGitHubConnection = async () => {
      try {
        const res = await apiFetch('/github/status');
        if (res.ok) {
          const data = await res.json();
          setIsGithubConnected(data.connected);
          if (data.connected) {
            setGithubUsername(data.githubUsername);
            fetchRepos();
          }
        }
      } catch {}
    };

    const fetchActiveRepo = async () => {
      try {
        const res = await apiFetch('/repos/current');
        if (res.ok) {
          const data = await res.json();
          if (data.repository) {
            setConnectedRepo(data.repository);
            setTargetBranch(data.repository.defaultBranch || 'main');
          }
        }
      } catch {}
    };

    checkGitHubConnection();
    fetchActiveRepo();
  }, []);

  // Fetch branches whenever active repo changes
  useEffect(() => {
    if (connectedRepo) {
      fetchBranches(connectedRepo.id);
    } else {
      setBranches([]);
    }
  }, [connectedRepo]);

  // Auto-generate resolution branch name
  useEffect(() => {
    if (sourceBranch && targetBranch) {
      const cleanSource = sourceBranch.replace(/\//g, '-');
      const cleanTarget = targetBranch.replace(/\//g, '-');
      setResolutionBranchName(`git-resolve/merge-${cleanSource}-into-${cleanTarget}`);
    } else {
      setResolutionBranchName('');
    }
  }, [sourceBranch, targetBranch]);

  const fetchRepos = async () => {
    setIsLoadingRepos(true);
    setGithubError('');
    try {
      const res = await apiFetch('/github/repos');
      if (res.ok) {
        const data = await res.json();
        setGithubRepos(data.repos || []);
      } else {
        throw new Error('Failed to load repositories.');
      }
    } catch (err) {
      setGithubError(err.message || 'Error loading repositories.');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const fetchBranches = async (repoId) => {
    setIsLoadingBranches(true);
    try {
      const res = await apiFetch(`/workspace/${repoId}/git/branches`);
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
        if (data.branches && data.branches.length > 0) {
          // Set initial source/target
          const defaultBr = connectedRepo?.defaultBranch || 'main';
          const available = data.branches.filter(b => b !== defaultBr);
          setSourceBranch(available[0] || data.branches[0]);
          setTargetBranch(data.branches.includes(defaultBr) ? defaultBr : data.branches[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load branches:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const handleLinkProfile = async (e) => {
    e.preventDefault();
    if (!profileInput.trim()) return;
    setIsLinking(true);
    setGithubError('');
    try {
      const res = await apiFetch('/github/link-profile', {
        method: 'POST',
        body: JSON.stringify({ profileUrl: profileInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link profile.');
      setIsGithubConnected(true);
      setGithubUsername(data.githubUsername);
      setProfileInput('');
      fetchRepos();
    } catch (err) {
      setGithubError(err.message || 'Error connecting profile.');
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
      if (!res.ok) throw new Error(data.error || 'Failed to import repository.');
      
      setConnectedRepo(data.repository);
      setTargetBranch(data.repository.defaultBranch || 'main');
      setShowConnectSuccess(true);
      setTimeout(() => setShowConnectSuccess(false), 2500);
    } catch (err) {
      setGithubError(err.message || 'Failed to import repository.');
      alert(err.message);
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
        setBranches([]);
        alert('GitHub account disconnected.');
      }
    } catch {
      alert('Failed to disconnect GitHub account.');
    }
  };

  // Merge check & run workflow
  const checkMergeSafety = async () => {
    if (!sourceBranch || !targetBranch || !connectedRepo) return;
    setIsCheckingMerge(true);
    setMergeStatus(null);
    try {
      const res = await apiFetch(`/workspace/${connectedRepo.id}/git/merge-check`, {
        method: 'POST',
        body: JSON.stringify({ sourceBranch, targetBranch })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to check merge safety.');
      }
      if (data.hasConflicts) {
        setMergeStatus('conflict');
        setConflicts(data.conflicts.map(f => ({ file: f, content: '', conflictBlocks: [] })));
      } else {
        setMergeStatus('clean');
        setConflicts([]);
      }
    } catch (err) {
      setMergeStatus('error');
      alert(err.message || 'Failed to check merge safety.');
    } finally {
      setIsCheckingMerge(false);
    }
  };

  const triggerBranchMerge = async () => {
    if (!sourceBranch || !targetBranch || !resolutionBranchName || !connectedRepo) return;
    setIsCreatingMergeBranch(true);
    try {
      const res = await apiFetch(`/workspace/${connectedRepo.id}/git/merge-create-branch`, {
        method: 'POST',
        body: JSON.stringify({ sourceBranch, targetBranch, resolutionBranch: resolutionBranchName })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize local merge branch.');
      }
      
      if (data.success) {
        setConflicts(data.conflicts || []);
        setResolutionProgress([]);
        setAiResolutions({});
        setCustomResolutions({});
        
        if (data.conflicts && data.conflicts.length > 0) {
          setSelectedFileIdx(0);
          fetchAIResolution(data.conflicts[0].file, data.conflicts[0].conflictBlocks[0]);
        } else {
          setMergeStatus('clean');
        }
      }
    } catch (err) {
      alert(err.message || 'Failed to initialize local merge branch.');
    } finally {
      setIsCreatingMergeBranch(false);
    }
  };

  const fetchAIResolution = async (file, block) => {
    if (!block || !connectedRepo) return;
    
    setAiResolutions(prev => ({
      ...prev,
      [file]: { recommendedResolution: '', explanation: '', loading: true, error: null }
    }));

    try {
      const res = await apiFetch(`/workspace/${connectedRepo.id}/git/merge-resolve-ai`, {
        method: 'POST',
        body: JSON.stringify({ conflictFile: file, rawConflictBlock: block })
      });
      const data = await res.json();
      
      if (data.success) {
        setAiResolutions(prev => ({
          ...prev,
          [file]: { 
            recommendedResolution: data.recommendedResolution, 
            explanation: data.explanation, 
            loading: false, 
            error: null 
          }
        }));
        setCustomResolutions(prev => ({
          ...prev,
          [file]: data.recommendedResolution
        }));
      } else {
        throw new Error('AI could not resolve conflict.');
      }
    } catch (err) {
      setAiResolutions(prev => ({
        ...prev,
        [file]: { recommendedResolution: '', explanation: '', loading: false, error: err.message }
      }));
    }
  };

  const applyFileResolution = async (file) => {
    const resolvedContent = customResolutions[file];
    if (resolvedContent === undefined || !connectedRepo) return;
    
    setApplyingResolution(true);
    try {
      const res = await apiFetch(`/workspace/${connectedRepo.id}/git/merge-apply-resolution`, {
        method: 'POST',
        body: JSON.stringify({
          conflictFile: file,
          resolutionBranch: resolutionBranchName,
          resolvedContent
        })
      });
      const data = await res.json();
      if (data.success) {
        setResolutionProgress(prev => [...prev, file]);
        if (data.allResolved) {
          // Complete!
          setConflicts([]);
          setSelectedFileIdx(null);
          setMergeStatus('resolved');
        } else {
          // Go to next file
          const nextIdx = conflicts.findIndex(c => c.file === data.remainingConflicts[0]);
          if (nextIdx !== -1) {
            setSelectedFileIdx(nextIdx);
            const nextFile = conflicts[nextIdx];
            if (!aiResolutions[nextFile.file]) {
              fetchAIResolution(nextFile.file, nextFile.conflictBlocks[0]);
            }
          }
        }
      }
    } catch (err) {
      alert('Failed to apply conflict resolution.');
    } finally {
      setApplyingResolution(false);
    }
  };

  const handlePushAndFinalize = async (mergeIntoTarget) => {
    if (!connectedRepo || !resolutionBranchName || !targetBranch) return;
    setIsFinalizing(true);
    setFinalizeSuccess(null);
    try {
      const res = await apiFetch(`/workspace/${connectedRepo.id}/git/merge-push-and-finalize`, {
        method: 'POST',
        body: JSON.stringify({
          resolutionBranch: resolutionBranchName,
          targetBranch,
          mergeIntoTarget
        })
      });
      const data = await res.json();
      if (data.success) {
        setFinalizeSuccess(mergeIntoTarget ? 'merge-target' : 'push-branch');
        // Refresh branches
        fetchBranches(connectedRepo.id);
      } else {
        alert(data.message || 'Push failed. Please verify your write permissions on GitHub.');
      }
    } catch {
      alert('Connection error finalising push.');
    } finally {
      setIsFinalizing(false);
    }
  };

  const selectedFile = selectedFileIdx !== null ? conflicts[selectedFileIdx] : null;

  return (
    <div className="h-screen w-screen bg-[var(--bg-color)] text-[var(--text)] flex overflow-hidden font-sans relative">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 glow-blur glow-purple w-[400px] h-[400px] opacity-15 pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 glow-blur glow-cyan w-[400px] h-[400px] opacity-15 pointer-events-none animate-pulse" />

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
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            {/* Sidebar Navigation */}
            <div className="p-3 flex flex-col gap-1">
              <button
                onClick={() => window.location.hash = '#dashboard?section=chat'}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50 text-left"
              >
                <Sparkles size={16} className="text-slate-400" />
                <span>Git Assistant</span>
              </button>

              <button
                onClick={() => window.location.hash = '#dashboard?section=ide'}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50 text-left"
              >
                <Code size={16} className="text-slate-400" />
                <span>Code IDE</span>
              </button>

              <button
                onClick={() => window.location.hash = '#visualizer-page'}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50 text-left"
              >
                <Activity size={16} className="text-slate-400" />
                <span>Visualization Graph</span>
              </button>

              <button
                onClick={() => window.location.hash = '#merge-control'}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#F8FAFC] text-left"
              >
                <GitBranch size={16} className="text-[#7C5CFF]" />
                <span>Merge & Resolve</span>
              </button>
            </div>

            {/* GitHub Repositories Section */}
            <div className="px-3 py-2 border-t border-white/[0.05] mt-2 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">GitHub Repositories</span>
                {isGithubConnected && (
                  <button
                    onClick={() => fetchRepos()}
                    disabled={isLoadingRepos}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
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
                      Enter username to fetch public repositories.
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
                      className="w-full py-2 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
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
                <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
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
                              <span className={`text-[11px] font-semibold truncate block ${isActive ? 'text-white' : 'text-slate-300 group-hover/repo:text-white'}`} title={repo.fullName}>
                                {repo.name}
                              </span>
                              {repo.isPrivate && <Lock size={9} className="text-amber-400 shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 text-[9px] text-slate-500">
                              {repo.language && <span className="truncate max-w-[50px]">{repo.language}</span>}
                              {repo.stars > 0 && <span>⭐ {repo.stars}</span>}
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
                      className="text-[9px] text-slate-500 hover:text-rose-400 transition-colors underline cursor-pointer font-medium"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Chat History Section */}
            <div className="px-3 py-2 border-t border-white/[0.05] mt-2 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Chat History</span>
                <button
                  onClick={() => {
                    localStorage.removeItem('gitsense_open_conversation_id');
                    window.location.hash = '#dashboard?section=chat';
                  }}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="New Chat"
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="relative mb-2">
                <span className="absolute left-2.5 top-2 text-slate-500"><Search size={12} /></span>
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/[0.06] rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#7C5CFF]/50 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-1 flex flex-col gap-3 custom-scrollbar">
              {[['today', 'Today'], ['week', 'Previous 7 Days'], ['month', 'Previous 30 Days'], ['older', 'Older']].map(([key, label]) => {
                const items = chatHistory[key] || [];
                if (items.length === 0) return null;
                return (
                  <div key={key} className="flex flex-col gap-1 text-left">
                    <span className="text-[9px] font-heading font-bold tracking-wider text-slate-500 uppercase px-2 mb-0.5">{label}</span>
                    {items.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          localStorage.setItem('gitsense_open_conversation_id', conv.id);
                          window.location.hash = '#dashboard?section=chat';
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer truncate flex items-center gap-2 group text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 border-l-2 border-transparent"
                      >
                        <MessageSquare size={11} className="opacity-50 flex-shrink-0 group-hover:text-[#00D4FF]" />
                        <span className="truncate flex-1">{conv.title}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {!isLeftSidebarOpen && (
          <button className="sidebar-toggle-btn left closed" onClick={() => setIsLeftSidebarOpen(true)}>
            <ChevronRight size={14} />
          </button>
        )}
        {isLeftSidebarOpen && (
          <button className="sidebar-toggle-btn left open hidden md:flex" onClick={() => setIsLeftSidebarOpen(false)}>
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* ── MAIN WORKSPACE CONTAINER ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        
        {/* ── TOP HEADER ── */}
        <header className="h-[60px] border-b border-white/[0.06] bg-[#060913]/70 backdrop-blur-md flex items-center justify-between px-6 z-10 flex-shrink-0 select-none">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-[#7C5CFF]" />
            <h1 className="text-sm font-bold text-slate-200">
              {connectedRepo ? `${connectedRepo.owner} / ${connectedRepo.name}` : 'Merge & Conflict Dashboard'}
            </h1>
          </div>
          
          {/* User profile actions */}
          <div className="relative">
            <button
              onClick={() => setAvatarDropdownOpen(!avatarDropdownOpen)}
              className="w-8 h-8 rounded-full border border-white/[0.08] bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] flex items-center justify-center text-white text-xs font-bold hover:scale-105 transition-all cursor-pointer"
            >
              {currentUser.avatarInitial}
            </button>
            <AnimatePresence>
              {avatarDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAvatarDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 0.95 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-[220px] bg-slate-950/95 border border-white/[0.08] rounded-xl shadow-2xl backdrop-blur-xl z-50 p-2 text-left"
                  >
                    <div className="px-3 py-2 border-b border-white/[0.06] mb-1 flex flex-col">
                      <span className="text-xs font-semibold text-slate-100">{currentUser.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{currentUser.email}</span>
                    </div>
                    <button onClick={() => { window.location.hash = '#profile'; setAvatarDropdownOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-900 transition-colors">
                      <User size={13} /> <span>Profile</span>
                    </button>
                    <button onClick={() => { window.location.hash = '#settings'; setAvatarDropdownOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-900 transition-colors">
                      <Settings size={13} /> <span>Settings</span>
                    </button>
                    <div className="border-t border-white/[0.06] my-1 pt-1">
                      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-400">
                        <span className="flex items-center gap-2"><Moon size={13} /> <span>Dark Theme</span></span>
                        <div onClick={toggleTheme} className={`w-7 h-4 rounded-full p-0.5 flex items-center cursor-pointer transition-all ${isDarkTheme ? 'bg-[#7C5CFF]/30 justify-end' : 'bg-slate-700 justify-start'}`}>
                          <div className={`w-3 h-3 rounded-full transition-all ${isDarkTheme ? 'bg-[#7C5CFF]' : 'bg-slate-400'}`} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* ── MAIN WORKSPACE CONTENT ── */}
        <div className="flex-1 overflow-y-auto px-6 py-8 bg-[var(--bg-color)] custom-scrollbar flex flex-col items-center">
          <div className="max-w-[1000px] w-full flex flex-col gap-6">

            {/* If no repo connected */}
            {!connectedRepo ? (
              <div className="gitsense-card p-12 text-center flex flex-col items-center gap-4.5 max-w-[550px] mx-auto mt-12">
                <GitBranch size={42} className="text-[#7C5CFF] opacity-80 animate-bounce" />
                <h3 className="text-xl font-bold font-heading text-slate-100">Connect a Git Repository</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                  To access the merge and conflict resolution control panel, please type your profile name in the left sidebar and import a repository.
                </p>
              </div>
            ) : (
              <>
                {/* ── SECTION A: MERGE FORM ── */}
                <div className="gitsense-card p-6 flex flex-col gap-5 text-left">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/[0.04]">
                    <Sparkles size={16} className="text-[#00D4FF]" />
                    <span className="font-heading font-bold text-sm text-slate-100 tracking-wide">
                      Branch Merge Control
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
                    {/* Source Branch Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
                        SOURCE BRANCH (incoming changes)
                      </label>
                      <div className="relative">
                        <select
                          value={sourceBranch}
                          onChange={(e) => setSourceBranch(e.target.value)}
                          className="w-full bg-slate-950/40 border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#7C5CFF] appearance-none transition-colors cursor-pointer"
                        >
                          {branches.map(b => (
                            <option key={b} value={b} className="bg-slate-950 text-slate-200">{b}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                      </div>
                    </div>

                    {/* Target Branch Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
                        TARGET BRANCH (merge into)
                      </label>
                      <div className="relative">
                        <select
                          value={targetBranch}
                          onChange={(e) => setTargetBranch(e.target.value)}
                          className="w-full bg-slate-950/40 border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#7C5CFF] appearance-none transition-colors cursor-pointer"
                        >
                          {branches.map(b => (
                            <option key={b} value={b} className="bg-slate-950 text-slate-200">{b}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                      </div>
                    </div>

                    {/* Resolution Branch Input */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
                        RESOLUTION BRANCH NAME
                      </label>
                      <input
                        type="text"
                        value={resolutionBranchName}
                        onChange={(e) => setResolutionBranchName(e.target.value)}
                        placeholder="Resolution branch name..."
                        className="w-full bg-slate-950/40 border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#7C5CFF] transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-1.5">
                    {/* Check Safety button */}
                    <button
                      onClick={checkMergeSafety}
                      disabled={isCheckingMerge || isCreatingMergeBranch || !sourceBranch || !targetBranch || sourceBranch === targetBranch}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-white/[0.08] text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                    >
                      {isCheckingMerge ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      <span>Check Merge Safety</span>
                    </button>

                    {/* Trigger Local Merge button */}
                    <button
                      onClick={triggerBranchMerge}
                      disabled={isCheckingMerge || isCreatingMergeBranch || !sourceBranch || !targetBranch || sourceBranch === targetBranch || !resolutionBranchName}
                      className="px-4 py-2 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer hover:shadow-[0_0_15px_rgba(124,92,255,0.25)]"
                    >
                      {isCreatingMergeBranch ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />}
                      <span>Start Branch Merge</span>
                    </button>
                  </div>

                  {/* Merge safety feedback message */}
                  <AnimatePresence>
                    {mergeStatus && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`p-3 rounded-xl border text-xs flex items-center gap-2 mt-2 ${
                          mergeStatus === 'clean' 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : mergeStatus === 'conflict'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
                            : 'bg-slate-800 border-white/[0.08] text-slate-300'
                        }`}
                      >
                        {mergeStatus === 'clean' ? (
                          <>
                            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                            <span>Branches can be merged cleanly! Click <strong>Start Branch Merge</strong> to proceed locally.</span>
                          </>
                        ) : mergeStatus === 'conflict' ? (
                          <>
                            <AlertCircle size={14} className="text-rose-500 shrink-0" />
                            <span>Merge conflict detected in ({conflicts.length}) files. Click <strong>Start Branch Merge</strong> to resolve them with GitSense AI.</span>
                          </>
                        ) : mergeStatus === 'resolved' ? (
                          <>
                            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                            <span>All conflicts resolved! You are ready to push the resolution branch.</span>
                          </>
                        ) : null}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── SECTION B: CONFLICT RESOLUTION WORKFLOW ── */}
                {conflicts.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start text-left">
                    
                    {/* Left Column: Conflict Files List (4 cols) */}
                    <div className="lg:col-span-4 gitsense-card p-4.5 flex flex-col gap-3">
                      <span className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
                        CONFLICTING FILES ({conflicts.length})
                      </span>
                      
                      <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                        {conflicts.map((c, idx) => {
                          const isSelected = selectedFileIdx === idx;
                          const isResolved = resolutionProgress.includes(c.file);
                          
                          return (
                            <button
                              key={c.file}
                              onClick={() => {
                                setSelectedFileIdx(idx);
                                if (!aiResolutions[c.file]) {
                                  fetchAIResolution(c.file, c.conflictBlocks[0]);
                                }
                              }}
                              className={`w-full text-left p-3 rounded-xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                                isSelected 
                                  ? 'bg-[#7C5CFF]/15 border-[#7C5CFF]/30 text-[#F8FAFC]'
                                  : 'bg-slate-900/35 border-white/[0.04] text-slate-300 hover:bg-slate-900/60'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileIcon size={13} className={isSelected ? 'text-[#7C5CFF]' : 'text-slate-400'} />
                                <span className="text-xs font-semibold truncate block" title={c.file}>
                                  {c.file.split('/').pop()}
                                </span>
                              </div>
                              {isResolved ? (
                                <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-mono select-none shrink-0">RESOLVED</span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-mono select-none shrink-0 animate-pulse">CONFLICT</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Column: AI Resolution Editor (8 cols) */}
                    {selectedFile && (
                      <div className="lg:col-span-8 gitsense-card p-5.5 flex flex-col gap-4.5">
                        
                        <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
                          <div className="flex flex-col">
                            <span className="text-xs font-extrabold text-slate-100 truncate block">
                              Resolving: {selectedFile.file}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono truncate">
                              Path: /{selectedFile.file}
                            </span>
                          </div>
                          <button
                            onClick={() => fetchAIResolution(selectedFile.file, selectedFile.conflictBlocks[0])}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title="Regenerate AI resolution"
                          >
                            <RefreshCw size={12} className={aiResolutions[selectedFile.file]?.loading ? 'animate-spin' : ''} />
                          </button>
                        </div>

                        {/* Split Code View */}
                        <div className="flex flex-col gap-3">
                          <label className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
                            CONFLICT SECTIONS
                          </label>
                          <div className="bg-slate-950/60 border border-white/[0.06] rounded-xl p-3 font-mono text-[11px] text-slate-300 max-h-[140px] overflow-y-auto custom-scrollbar select-text whitespace-pre-wrap">
                            {selectedFile.conflictBlocks[0] || 'No conflict blocks detected.'}
                          </div>
                        </div>

                        {/* AI Resolution Recommendations */}
                        {aiResolutions[selectedFile.file] && (
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase flex items-center gap-1.5">
                                <Sparkles size={12} className="text-[#00D4FF] animate-pulse" />
                                AI-RECOMMENDED RESOLUTION
                              </label>
                              {aiResolutions[selectedFile.file].loading && (
                                <span className="text-[9px] text-[#00D4FF] flex items-center gap-1">
                                  <Loader2 size={10} className="animate-spin" /> Analyzing codebase...
                                </span>
                              )}
                            </div>

                            {aiResolutions[selectedFile.file].loading ? (
                              <div className="bg-slate-950/35 border border-dashed border-white/[0.05] rounded-xl py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                                <RefreshCw size={22} className="animate-spin text-[#7C5CFF]" />
                                <span>GitSense AI is analyzing codebase context for resolutions...</span>
                              </div>
                            ) : aiResolutions[selectedFile.file].error ? (
                              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs">
                                Failed to fetch AI Resolution: {aiResolutions[selectedFile.file].error}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-3.5">
                                {/* Explanation Card */}
                                <div className="bg-[#7C5CFF]/5 border border-[#7C5CFF]/15 p-3 rounded-xl text-[11px] text-slate-300 leading-relaxed">
                                  <strong>AI Rationale:</strong> {aiResolutions[selectedFile.file].explanation}
                                </div>

                                {/* Custom Editor Textarea */}
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[9px] font-bold text-slate-400">
                                    CODE EDITOR (Double-check and edit before applying)
                                  </label>
                                  <textarea
                                    value={customResolutions[selectedFile.file] || ''}
                                    onChange={(e) => setCustomResolutions(prev => ({ ...prev, [selectedFile.file]: e.target.value }))}
                                    rows={8}
                                    className="w-full bg-slate-950/90 border border-white/[0.08] hover:border-white/[0.15] focus:border-[#7C5CFF] rounded-xl p-3 text-[11px] text-slate-100 font-mono outline-none resize-none transition-colors"
                                  />
                                </div>

                                {/* Apply resolution button */}
                                <button
                                  onClick={() => applyFileResolution(selectedFile.file)}
                                  disabled={applyingResolution}
                                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-[#10B981] hover:scale-[1.01] transition-all text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/15"
                                >
                                  {applyingResolution ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  <span>Apply Conflict Resolution</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── SECTION C: PUSH & FINALIZE MERGE ── */}
                {(mergeStatus === 'resolved' || (mergeStatus === 'clean' && connectedRepo)) && (
                  <div className="gitsense-card p-6 flex flex-col gap-5 text-left border-emerald-500/30 bg-emerald-500/5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-emerald-500" />
                      <div className="flex flex-col">
                        <span className="font-heading font-bold text-sm text-slate-100">
                          Merge Ready to Finalize
                        </span>
                        <span className="text-[10px] text-slate-400 leading-normal">
                          All changes are staged locally. Choose how to push this to GitHub.
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 mt-1.5">
                      {/* Push Resolution Branch Only */}
                      <button
                        onClick={() => handlePushAndFinalize(false)}
                        disabled={isFinalizing}
                        className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-white/[0.08] text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        {isFinalizing && !finalizeSuccess ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} className="text-[#00D4FF]" />}
                        <span>Push Resolution Branch Only</span>
                      </button>

                      {/* Push & Merge into Target */}
                      <button
                        onClick={() => handlePushAndFinalize(true)}
                        disabled={isFinalizing}
                        className="px-4 py-2.5 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:shadow-[0_0_15px_rgba(124,92,255,0.25)]"
                      >
                        {isFinalizing && !finalizeSuccess ? <Loader2 size={12} className="animate-spin" /> : <ArrowRightCircle size={12} />}
                        <span>Push & Merge with `{targetBranch}`</span>
                      </button>
                    </div>

                    <AnimatePresence>
                      {finalizeSuccess && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400 mt-2 text-xs"
                        >
                          <Check size={18} className="text-emerald-400 shrink-0" />
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold">Successfully finalized merge on GitHub!</span>
                            <span className="text-[10px] text-slate-400 leading-normal">
                              {finalizeSuccess === 'merge-target' 
                                ? `The resolution branch ${resolutionBranchName} has been pushed and merged back into target branch ${targetBranch}.` 
                                : `The resolution branch ${resolutionBranchName} is now pushed to GitHub.`}
                              {' '}Open the <strong>Visualization Graph</strong> to trace your newly added commits!
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
