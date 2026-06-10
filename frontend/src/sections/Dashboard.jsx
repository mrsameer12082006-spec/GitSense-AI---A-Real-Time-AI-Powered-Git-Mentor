import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, ChevronDown, LogOut, Settings, User, Info, FileText, Sun, Moon, 
  GitBranch, Send, Paperclip, Mic, Activity, Users, CheckCircle2, AlertTriangle, 
  RefreshCw, Plus, HelpCircle, Play, ArrowRight, Lock, GitCommit, GitPullRequest, 
  Sparkles, Terminal, Check, Copy, X, ShieldAlert, Cpu, Eye, MessageSquare, Database,
  ChevronLeft, ChevronRight, Download, Link as LinkIcon, Trash2, Loader2, MicOff,
  ExternalLink, BookOpen, Code, RotateCw, Wand2
} from 'lucide-react';
import {
  githubImportOptions,
  getGreeting
} from '../data/mockDashboardData';
import IDEPanel from '../components/IDEPanel';

// ── API Helper ──
const API_BASE = '/api';
const getToken = () => localStorage.getItem('gitsense_token');
const apiFetch = async (path, options = {}) => {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
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

  // ── Auth & User State ──
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('gitsense_user');
      return saved ? JSON.parse(saved) : { name: 'User', email: '', avatarInitial: 'U' };
    } catch { return { name: 'User', email: '', avatarInitial: 'U' }; }
  });

  // ── Repository State ──
  const [connectedRepo, setConnectedRepo] = useState(undefined);
  const [repoInsights, setRepoInsights] = useState(null);
  const [isRepoLoading, setIsRepoLoading] = useState(false);

  // ── GitHub Account & Repository List State ──
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [githubRepos, setGithubRepos] = useState([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [githubError, setGithubError] = useState('');
  const [importingRepo, setImportingRepo] = useState(null);
  const [profileInput, setProfileInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [activeSection, setActiveSection] = useState(() => {
    const hash = window.location.hash;
    if (hash.includes('section=ide')) return 'ide';
    return 'chat';
  });

  const [externalCommand, setExternalCommand] = useState(null);

  const handleRunCommandInTerminal = (cmd) => {
    setExternalCommand(cmd);
    setActiveSection('ide');
  };

  // ── Sync activeSection with URL hash parameter ──
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.includes('section=ide')) {
        setActiveSection('ide');
      } else if (hash.includes('section=chat') || hash === '#dashboard') {
        setActiveSection('chat');
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // ── Repository Health & Autonomous Fix State ──
  const [issues, setIssues] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSteps, setScanSteps] = useState([]);
  const [expandedIssueIds, setExpandedIssueIds] = useState(new Set());
  const [timelineSteps, setTimelineSteps] = useState([]);
  const [activeFixingIssueId, setActiveFixingIssueId] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalFixData, setApprovalFixData] = useState(null);

  const [scanSummary, setScanSummary] = useState(null);
  const [scanCompleted, setScanCompleted] = useState(null);
  const [scanChecks, setScanChecks] = useState(null);
  const [rateLimitResetTime, setRateLimitResetTime] = useState(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [scanError, setScanError] = useState(null);
  const [repoPermissions, setRepoPermissions] = useState(null);
  const [hasWriteAccess, setHasWriteAccess] = useState(true);
  const [activeSSEFixId, setActiveSSEFixId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [tokenScopes, setTokenScopes] = useState('');
  const [sseProgressSteps, setSseProgressSteps] = useState([]);
  const [sseStatus, setSseStatus] = useState(null);
  const [ciDiagnostics, setCiDiagnostics] = useState({});
  const [activeDiagnosingJobId, setActiveDiagnosingJobId] = useState(null);
  const [issueConfirmFixData, setIssueConfirmFixData] = useState(null);

  useEffect(() => {
    if (!rateLimitResetTime) {
      setRateLimitCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const diff = Math.max(0, Math.floor((rateLimitResetTime - Date.now()) / 1000));
      setRateLimitCountdown(diff);
      if (diff === 0) {
        clearInterval(timer);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [rateLimitResetTime]);

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleScanRepo = async () => {
    if (!connectedRepo) return;
    setIsScanning(true);
    setScanCompleted(null);
    setRateLimitResetTime(null);
    setScanChecks(null);
    setScanError(null);
    
    setScanSteps([
      { label: 'Fetching repository metadata', status: 'active', key: 'metadata' },
      { label: 'Retrieving repository branches', status: 'pending', key: 'branches' },
      { label: 'Comparing branches against base', status: 'pending', key: 'branchComparison' },
      { label: 'Retrieving pull requests', status: 'pending', key: 'pullRequests' },
      { label: 'Verifying PR mergeability', status: 'pending', key: 'prDetails' },
      { label: 'Checking .gitignore rules', status: 'pending', key: 'gitignore' },
      { label: 'Scanning files for issues', status: 'pending', key: 'largeFiles' },
      { label: 'Verifying CI/CD status', status: 'pending', key: 'ciWorkflow' },
      { label: 'Generating AI explanations', status: 'pending', key: 'ai' }
    ]);

    // Animate steps placeholder sequentially
    let isRequestRunning = true;
    const runAnimation = async () => {
      for (let i = 0; i < 8; i++) {
        if (!isRequestRunning) break;
        await new Promise(r => setTimeout(r, 450));
        setScanSteps(prev => {
          return prev.map((s, idx) => {
            if (idx === i && s.status === 'active') return { ...s, status: 'success' };
            if (idx === i + 1 && s.status === 'pending') return { ...s, status: 'active' };
            return s;
          });
        });
      }
    };
    
    const animationPromise = runAnimation();

    try {
      const owner = connectedRepo.owner;
      const repo = connectedRepo.name;
      const token = currentUser?.githubToken || '';

      const res = await apiFetch(`/repo/scan`, {
        method: 'POST',
        body: JSON.stringify({ owner, repo, token })
      });

      if (!res.ok) {
        let errMsg = 'Failed to scan repository';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (_) {}
        setScanError(errMsg);
        throw new Error(errMsg);
      }

      const data = await res.json();
      isRequestRunning = false;
      
      setIssues(prev => {
        const fixedList = prev.filter(iss => iss.isFixed);
        const newIssues = data.issues || [];
        const activeIds = newIssues.map(ni => ni.id);
        const preservedFixed = fixedList.filter(fi => !activeIds.includes(fi.id));
        return [...newIssues, ...preservedFixed];
      });
      setRepoPermissions(data.permissions || { push: true, pull: true, admin: false });
      setHasWriteAccess(true);
      setScanSummary(data.summary || null);
      setScanCompleted(data.scanCompleted);
      setScanChecks(data.checks || null);
      
      if (data.scanCompleted === false && data.rateLimitResetTime) {
        setRateLimitResetTime(data.rateLimitResetTime);
      }
      
      // Update steps status instantly based on checks results
      if (data.checks) {
        setScanSteps(prev => prev.map(s => {
          if (s.key === 'ai') {
            return { ...s, status: data.scanCompleted ? 'success' : 'skipped' };
          }
          const checkStatus = data.checks[s.key];
          return {
            ...s,
            status: checkStatus === 'success' ? 'success' :
                    checkStatus === 'rate_limited' ? 'failed' :
                    checkStatus === 'skipped' ? 'skipped' : s.status
          };
        }));
      } else {
        setScanSteps(prev => prev.map(s => ({ ...s, status: 'success' })));
      }
      
    } catch (err) {
      isRequestRunning = false;
      console.error('[Scan] Failed to scan repository:', err);
      // Ensure we have set an error message in state
      setScanError(prev => prev || err.message || 'Failed to connect to the backend server.');
    } finally {
      await animationPromise;
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (connectedRepo) {
      // Fetch insights on mount
      apiFetch(`/repos/${connectedRepo.id}/insights`)
        .then(res => res.json())
        .then(data => { if (data.insights) setRepoInsights(data.insights); })
        .catch(() => {});
    } else {
      setIssues([]);
    }
  }, [connectedRepo, apiFetch]);

  useEffect(() => {
    if (connectedRepo && currentUser && localStorage.getItem('gitsense_reconnecting') === 'true') {
      localStorage.removeItem('gitsense_reconnecting');
      setIssues([]);
      handleScanRepo();
    }
  }, [connectedRepo, currentUser]);

  const handleReconnect = () => {
    localStorage.setItem('gitsense_reconnecting', 'true');
    const BACKEND_URL = '/api';
    window.location.href = `${BACKEND_URL}/auth/github?force_reauth=true`;
  };

  const fetchAuthState = async () => {
    setAuthLoading(true);
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (!response.ok) {
        setAuthLoading(false);
        if (response.status === 401) {
          setIsAuthenticated(false);
        }
        return;
      }

      const data = await response.json();
      if (data.isAuthenticated) {
        const u = data.user ? { 
          ...data.user, 
          githubToken: data.token, 
          githubScopes: data.scopes,
          avatarInitial: data.user.name?.charAt(0)?.toUpperCase() || 'U'
        } : null;
        setCurrentUser(u);
        if (u) {
          localStorage.setItem('gitsense_user', JSON.stringify(u));
        }
        setGithubToken(data.token || '');
        setHasWriteAccess(true);
        setTokenScopes(data.scopes || '');
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      setAuthLoading(false);
    } catch (err) {
      console.error('[fetchAuthState] Error:', err);
      setAuthLoading(false);
      setAuthError(err.message || 'Error fetching authentication state.');
    }
  };

  useEffect(() => {
    const hash = window.location.hash;
    let auth = null;
    let reason = null;

    if (hash.includes('?')) {
      const parts = hash.split('?');
      const queryString = parts[1];
      const params = new URLSearchParams(queryString);
      auth = params.get('auth');
      reason = params.get('reason');
    }

    if (auth === 'success') {
      window.history.replaceState(null, '', '#dashboard');
      fetchAuthState();
    } else if (auth === 'error') {
      window.history.replaceState(null, '', '#dashboard');
      setAuthError(`Authentication failed: ${reason || 'unknown error'}`);
      setAuthLoading(false);
    } else {
      fetchAuthState();
    }
  }, []);

  const executeSSEFix = (issue, action, extraParams = {}) => {
    if (!connectedRepo) return;
    
    setSseProgressSteps([]);
    setSseStatus('running');
    setActiveSSEFixId(issue.id);

    const queryParams = new URLSearchParams({
      owner: connectedRepo.owner,
      repo: connectedRepo.name,
      token: currentUser?.githubToken || '',
      issueId: issue.id,
      action: action,
      defaultBranch: connectedRepo.defaultBranch || 'main',
      ...extraParams
    });

    const sseUrl = `${API_BASE}/repo/fix?${queryParams.toString()}`;
    console.log('[SSE client] Connecting to:', sseUrl);

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[SSE client] Message received:', data);

        if (data.step === 'done') {
          setSseStatus(data.status); // 'complete' or 'failed'
          eventSource.close();
          
          // Trigger scan to re-verify issue state
          handleScanRepo();
        } else if (data.step === 'error') {
          setSseStatus('failed');
          setSseProgressSteps(prev => [...prev, { message: `❌ Error: ${data.message}`, status: 'failed' }]);
          eventSource.close();
        } else {
          setSseProgressSteps(prev => {
            const filtered = prev.filter(s => s.step !== data.step);
            return [...filtered, { step: data.step, message: data.message, status: data.status }];
          });
        }
      } catch (err) {
        console.error('[SSE client] Error parsing event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[SSE client] EventSource connection failed:', err);
      setSseStatus('failed');
      setSseProgressSteps(prev => [...prev, { message: '❌ Connection to the repair server failed.', status: 'failed' }]);
      eventSource.close();
    };
  };

  const executePOSTFix = async (issue, fixType, params = {}) => {
    if (!connectedRepo) return;
    
    setSseProgressSteps([]);
    setSseStatus('running');
    setActiveSSEFixId(issue.id);

    const getFixSteps = (id) => {
      if (id === 'missing-gitignore') {
        return [
          { key: 'detect_type', label: 'Detecting project type' },
          { key: 'build_content', label: 'Building gitignore content' },
          { key: 'create_file', label: 'Creating file on GitHub' },
          { key: 'verify_file', label: 'Verifying file exists' },
          { key: 'complete', label: 'Complete' }
        ];
      }
      if (id === 'stale-branches') {
        return [
          { key: 'confirm_exists', label: 'Confirming branch exists' },
          { key: 'delete_branch', label: 'Deleting remote branch' },
          { key: 'verify_deletion', label: 'Verifying deletion' },
          { key: 'complete', label: 'Complete' }
        ];
      }
      if (id === 'ci-pipeline-failure') {
        return [
          { key: 'trigger_rerun', label: 'Triggering job rerun' },
          { key: 'wait_start', label: 'Waiting for run to start' },
          { key: 'monitor_status', label: 'Monitoring run status' },
          { key: 'complete', label: 'Complete' }
        ];
      }
      return [
        { key: 'trigger', label: 'Triggering auto-fix' },
        { key: 'execute', label: 'Executing fix routines' },
        { key: 'verify', label: 'Verifying resolution' },
        { key: 'complete', label: 'Complete' }
      ];
    };

    const steps = getFixSteps(issue.id);
    
    // Set first step running
    setSseProgressSteps([{ step: steps[0].key, message: steps[0].label, status: 'running' }]);
    
    let currentIdx = 0;
    const intervalId = setInterval(() => {
      if (currentIdx < steps.length - 2) {
        setSseProgressSteps(prev => {
          const updated = prev.map(s => s.step === steps[currentIdx].key ? { ...s, status: 'complete' } : s);
          if (!updated.some(s => s.step === steps[currentIdx + 1].key)) {
            updated.push({ step: steps[currentIdx + 1].key, message: steps[currentIdx + 1].label, status: 'running' });
          }
          return updated;
        });
        currentIdx++;
      } else {
        clearInterval(intervalId);
      }
    }, 1200);

    try {
      const owner = connectedRepo.owner;
      const repo = connectedRepo.name;
      const token = currentUser?.githubToken || '';

      const response = await fetch(`${API_BASE}/repo/fix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          owner,
          repo,
          token,
          fixType,
          params
        })
      });

      const data = await response.json();
      clearInterval(intervalId);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to apply fix');
      }

      // Complete all steps
      const finalSteps = steps.map(fs => ({
        step: fs.key,
        message: fs.label,
        status: 'complete'
      }));
      setSseProgressSteps(finalSteps);
      setSseStatus('complete');

      let fixedUrl = data.verificationResult?.fileUrl || null;
      if (issue.id === 'missing-gitignore' && !fixedUrl) {
        fixedUrl = `https://github.com/${owner}/${repo}/blob/${connectedRepo.defaultBranch || 'main'}/.gitignore`;
      }

      setIssues(prev => prev.map(iss => {
        if (iss.id === issue.id) {
          return {
            ...iss,
            isFixed: true,
            fixedAt: new Date().toISOString(),
            fixedUrl,
            fixedDescription: data.verificationResult?.message || 'Fixed and verified successfully.'
          };
        }
        return iss;
      }));

      // Re-scan after fix to update state
      handleScanRepo();

    } catch (err) {
      clearInterval(intervalId);
      console.error('[POST Fix] Error executing fix:', err);
      setSseStatus('failed');
      setSseProgressSteps(prev => {
        const last = prev[prev.length - 1] || { step: 'error', message: 'Starting fix' };
        const updated = prev.slice(0, -1);
        return [...updated, { ...last, status: 'failed', message: `❌ Error: ${err.message}` }];
      });
    }
  };

  const diagnoseCIFailure = async (runId) => {
    if (!connectedRepo || !runId) return;
    setActiveDiagnosingJobId(runId);
    try {
      const queryParams = new URLSearchParams({
        owner: connectedRepo.owner,
        repo: connectedRepo.name,
        token: currentUser?.githubToken || '',
        runId: runId
      });
      const res = await apiFetch(`/repo/ci-diagnostics?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to retrieve log diagnostics');
      }
      const data = await res.json();
      setCiDiagnostics(prev => ({
        ...prev,
        [runId]: {
          snippets: data.snippets || [],
          jobName: data.jobName || 'failed job'
        }
      }));
    } catch (err) {
      console.error('[Diagnostics] Failed to fetch logs:', err);
      alert(`Error fetching job log diagnostics: ${err.message}`);
    } finally {
      setActiveDiagnosingJobId(null);
    }
  };

  const toggleIssueExpansion = (id) => {
    setExpandedIssueIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFixIssue = async (issue) => {
    if (!connectedRepo) return;
    setApprovalFixData(issue);
    setShowApprovalModal(true);
  };

  const handleConfirmFix = async () => {
    if (!connectedRepo || !approvalFixData) return;
    const issue = approvalFixData;
    setShowApprovalModal(false);
    setApprovalFixData(null);

    setTimelineSteps([
      { label: 'Preparing fix', status: 'success' },
      { label: 'Applying Git commands', status: 'active' },
      { label: 'Verifying repository clean', status: 'pending' }
    ]);
    setActiveFixingIssueId(issue.id);

    try {
      // Execute the fix plan via POST /api/fix/execute
      const res = await apiFetch('/fix/execute', {
        method: 'POST',
        body: JSON.stringify({
          owner: connectedRepo.owner,
          repo: connectedRepo.name,
          fixPlan: issue.fixPlan || {
            issue: issue.id,
            severity: issue.severity === 'critical' || issue.severity === 'error' ? 'high' : 'medium',
            actions: []
          }
        }),
      });
      const data = await res.json();

      setTimelineSteps([
        { label: 'Preparing fix', status: 'success' },
        { label: 'Applying Git commands', status: 'success' },
        { label: 'Verifying repository clean', status: 'active' }
      ]);
      await new Promise(resolve => setTimeout(resolve, 600));
      
      if (data.success) {
        // Targeted scan verification check for this specific issue type
        const verifyRes = await apiFetch('/repo/scan', {
          method: 'POST',
          body: JSON.stringify({
            owner: connectedRepo.owner,
            repo: connectedRepo.name,
            token: currentUser?.githubToken || '',
            issueType: issue.id
          })
        });

        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          // Check if the issue is no longer detected in the updated scanner results
          const isStillPresent = (verifyData.issues || []).some(i => i.id === issue.id);

          if (!isStillPresent) {
            setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, isFixed: true } : i));
            setMessages(prev => [...prev, {
              sender: 'ai',
              text: `✅ **Fixed**: I resolved **${issue.title}** successfully.\n\n* **Verification**: Checked repository state, the issue is no longer detected.`,
              insight: 'Repository state is clean.',
              recommendation: 'Continue developer workflows.'
            }]);
          } else {
            setMessages(prev => [...prev, {
              sender: 'ai',
              text: `❌ **Fix Failed**: The actions were applied but **${issue.title}** is still detected during verification scan.`,
              insight: 'Verification scan failed to clear the issue.',
              recommendation: 'Please review repository settings or logs.'
            }]);
          }
        } else {
          setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, isFixed: true } : i));
          setMessages(prev => [...prev, {
            sender: 'ai',
            text: `✅ **Fixed**: I resolved **${issue.title}** (Verification scan skipped due to network status).`,
            insight: 'API execution was successful.',
            recommendation: 'Refresh the dashboard manually.'
          }]);
        }
      } else {
        const errorMsg = data.errors && data.errors.length > 0 
          ? data.errors.map(e => e.error).join('; ') 
          : (data.error || 'GitHub API returned an error.');

        setMessages(prev => [...prev, {
          sender: 'ai',
          text: `❌ **Fix Failed**: Could not resolve **${issue.title}**.\n\n* **Error**: ${errorMsg}`,
          insight: 'GitHub API call returned an error.',
          recommendation: 'Verify repository write permissions and rate limits.'
        }]);
      }
    } catch (err) {
      console.error('[Fix] Error:', err);
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: `❌ **Fix Execution Error**: ${err.message}`,
        insight: 'Exception during fix transmission.',
        recommendation: 'Check server connection and logs.'
      }]);
    } finally {
      setActiveFixingIssueId(null);
      setTimeout(() => setTimelineSteps([]), 2000);
    }
  };

  // ── Chat History State ──
  const [chatHistory, setChatHistory] = useState({ today: [], week: [], month: [], older: [] });
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [historySearch, setHistorySearch] = useState('');

  // ── Modal States ──
  const [showPasteUrlModal, setShowPasteUrlModal] = useState(false);
  const [pasteUrlValue, setPasteUrlValue] = useState('');
  const [pasteUrlLoading, setPasteUrlLoading] = useState(false);
  const [pasteUrlError, setPasteUrlError] = useState('');
  const [showConnectSuccess, setShowConnectSuccess] = useState(false);

  // ── Voice Modal State ──
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef(null);
  const chatInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [pdfUploading, setPdfUploading] = useState(false);

  // ── Load user profile on mount ──
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
        alert('GitHub account disconnected.');
      }
    } catch (err) {
      alert('Failed to disconnect GitHub account.');
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch('/auth/me').then(r => r.json()).then(data => {
      if (data.user) {
        const u = { ...data.user, avatarInitial: data.user.name?.charAt(0)?.toUpperCase() || 'U' };
        setCurrentUser(u);
        localStorage.setItem('gitsense_user', JSON.stringify(u));
        const scopesList = u.githubScopes ? u.githubScopes.split(',').map(s => s.trim()) : [];
        setHasWriteAccess(true);
      }
    }).catch(() => {});
  }, []);

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

  // ── Load connected repo on mount ──
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setConnectedRepo(null);
      return;
    }
    apiFetch('/repos/current')
      .then(r => r.json())
      .then(data => {
        if (data.connected && data.repository) {
          setConnectedRepo(data.repository);
          apiFetch(`/repos/${data.repository.id}/insights`).then(r => r.json()).then(ins => {
            if (ins.insights) setRepoInsights(ins.insights);
          }).catch(() => {});
        } else {
          setConnectedRepo(null);
        }
      })
      .catch(() => {
        setConnectedRepo(null);
      });

    // Check GitHub Connection status on mount
    checkGithubStatus().then(connected => {
      if (connected) {
        fetchGithubRepos();
      }
    });
  }, [apiFetch, checkGithubStatus, fetchGithubRepos]);

  // ── Auto focus after repository connection ──
  useEffect(() => {
    if (connectedRepo) {
      chatInputRef.current?.focus();
    }
  }, [connectedRepo]);

  // ── Load chat history ──
  const loadChatHistory = useCallback(async () => {
    try {
      const r = await apiFetch(`/conversations${historySearch ? `?search=${encodeURIComponent(historySearch)}` : ''}`);
      const data = await r.json();
      if (data.conversations) setChatHistory(data.conversations);
    } catch {}
  }, [historySearch]);

  useEffect(() => { loadChatHistory(); }, [loadChatHistory]);

  // ── Refresh insights periodically ──
  useEffect(() => {
    if (!connectedRepo) return;
    const interval = setInterval(() => {
      apiFetch(`/repos/${connectedRepo.id}/insights`).then(r => r.json()).then(ins => {
        if (ins.insights) setRepoInsights(ins.insights);
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [connectedRepo]);

  // Derived values
  const isRepositoryConnected = !!connectedRepo;
  const repositoryInsights = repoInsights || { commits: 0, openPRs: 0, issues: 0, contributors: 0, securityStatus: 'N/A', latestCommits: [], activePRs: [], pipelines: [] };
  const sidebarEmptyStateText = 'No conversations yet. Start a new chat.';
  const chatInputPlaceholder = isRepositoryConnected ? 'Ask about your connected repository...' : 'Connect a repository to start chatting...';
  const welcomeSubtitle = isRepositoryConnected ? 'Ask me anything about your repository.' : 'Connect a GitHub repository to get started.';

  // Collapsible Sidebars State
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('gitsense_left_sidebar');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('gitsense_right_sidebar');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [activeSidebarTab, setActiveSidebarTab] = useState('insights'); // insights, activity

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

  // Ingestion State & Polling
  const [ingestionState, setIngestionState] = useState({
    status: 'none',
    progress: 0,
    currentStep: 'Not started',
    errorMessage: null,
    lastIngestedAt: null,
    chunkCount: 0
  });

  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);

  const fetchIngestionStatus = useCallback(async (repoId) => {
    if (!repoId) return;
    try {
      const res = await apiFetch(`/repos/${repoId}/ingestion-status`);
      const data = await res.json();
      setIngestionState({
        status: data.status || 'none',
        progress: data.progress || 0,
        currentStep: data.currentStep || 'Not started',
        errorMessage: data.errorMessage || null,
        lastIngestedAt: data.lastIngestedAt || null,
        chunkCount: data.chunkCount || 0
      });
      return data;
    } catch (err) {
      console.error('[Ingestion] Failed to fetch status:', err);
    }
  }, []);

  // Poll ingestion status when running
  useEffect(() => {
    if (!connectedRepo) return;
    
    fetchIngestionStatus(connectedRepo.id);

    let intervalId = setInterval(async () => {
      const statusData = await fetchIngestionStatus(connectedRepo.id);
      if (statusData && (statusData.status === 'completed' || statusData.status === 'failed')) {
        clearInterval(intervalId);
        handleScanRepo();
        apiFetch(`/repos/${connectedRepo.id}/insights`).then(r => r.json()).then(ins => {
          if (ins.insights) setRepoInsights(ins.insights);
        }).catch(() => {});
      }
    }, 2000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [connectedRepo, fetchIngestionStatus]);

  const handleSyncRepo = async () => {
    if (!connectedRepo) return;
    setIngestionState(prev => ({ ...prev, status: 'running', progress: 0, currentStep: 'Triggering sync...' }));
    try {
      await apiFetch(`/repos/${connectedRepo.id}/sync`, { method: 'POST' });
      fetchIngestionStatus(connectedRepo.id);
    } catch (err) {
      console.error('[Sync] Failed:', err);
    }
  };

  const getProactiveSuggestions = () => {
    const suggestions = [];

    if (issues && issues.length > 0) {
      issues.slice(0, 2).forEach(issue => {
        suggestions.push({
          id: `suggestion-issue-${issue.id}`,
          type: 'issue_detected',
          title: `Detected: ${issue.title}`,
          description: issue.whatIsTheIssue || 'An issue was detected in your workspace.',
          prompt: `Can you help me understand how to fix the issue: "${issue.title}"?`
        });
      });
    }

    if (connectedRepo) {
      suggestions.push({
        id: 'suggestion-churn',
        type: 'high_churn',
        title: 'High Churn Codebase hotspot',
        description: `File "backend/src/services/ai.js" has high commit activity recently. Check for stability.`,
        prompt: `Why has "backend/src/services/ai.js" seen so many updates recently? Please analyze the file history and suggest improvements.`
      });
    }

    if (repositoryInsights.issues > 0) {
      suggestions.push({
        id: 'suggestion-stale-issue',
        type: 'stale_issue',
        title: 'Stale Issue Observation',
        description: `Open issues exist in this repo with no linked pull request or active branches.`,
        prompt: `List the open issues in the repository and summarize their current state, advising how we can resolve them.`
      });
    }

    return suggestions.filter(s => !dismissedSuggestions.includes(s.id));
  };

  const handleSelectSuggestion = (suggestion) => {
    setInputVal(suggestion.prompt);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 50);
  };
  
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

  // Auto-resize chat input textarea as text size grows
  useEffect(() => {
    const textarea = chatInputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      if (inputVal) {
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    }
  }, [inputVal]);

  const submitUserMessage = async (text) => {
    if (!text.trim()) return;

    const userMsg = { sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    setIsAiTyping(true);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 30);

    try {
      const res = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          conversationId: activeConversationId,
          repositoryId: connectedRepo?.id,
        }),
      });

      if (!res.ok) {
        let errMsg = `Request failed with status ${res.status}`;
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      // Check if it is a streaming response
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        // Fallback to json if not event-stream
        const data = await res.json();
        if (data.response) {
          setMessages(prev => [...prev, data.response]);
        }
        if (data.conversationId) {
          setActiveConversationId(data.conversationId);
        }
        loadChatHistory();
        return;
      }

      // Read the stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let done = false;

      // Add a placeholder message for the streaming response
      const streamingMessageId = `ai-stream-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        { id: streamingMessageId, sender: 'ai', text: '', isStreaming: true }
      ]);
      setIsAiTyping(false); // Disable typing indicator since we have the message container now

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep last incomplete line

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;
            if (cleanLine.startsWith('data: ')) {
              const dataStr = cleanLine.substring(6);
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                if (parsed.token) {
                  setMessages(prev => {
                    return prev.map(msg => {
                      if (msg.id === streamingMessageId) {
                        return {
                          ...msg,
                          text: msg.text + parsed.token
                        };
                      }
                      return msg;
                    });
                  });
                } else if (parsed.done) {
                  // Final metadata response
                  setMessages(prev => {
                    return prev.map(msg => {
                      if (msg.id === streamingMessageId) {
                        return {
                          id: msg.id,
                          sender: 'ai',
                          text: parsed.response?.text || msg.text || '',
                          insight: parsed.response?.insight,
                          recommendation: parsed.response?.recommendation,
                          codeBlock: parsed.response?.codeBlock,
                          commandBlock: parsed.response?.commandBlock,
                          diff: parsed.response?.diff,
                          conflictResolution: parsed.response?.conflictResolution,
                          diagnosedIssue: parsed.response?.diagnosedIssue,
                        };
                      }
                      return msg;
                    });
                  });
                  if (parsed.conversationId) {
                    setActiveConversationId(parsed.conversationId);
                  }
                  // Refresh history and health status if we finished
                  loadChatHistory();
                  if (connectedRepo) {
                    handleScanRepo();
                  }
                }
              } catch (e) {
                // Ignore parsing errors on partial chunks
              }
            }
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: `⚠️ AI Chat Error: ${err.message}`,
        insight: 'Please verify the backend server is running and your API keys are configured in backend/.env',
      }]);
    } finally {
      setIsAiTyping(false);
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 30);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitUserMessage(inputVal);
    }
  };

  const toggleRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (isRecording) {
      // Stop recording
      recognitionRef.current?.stop();
      setIsRecording(false);
      setShowVoiceModal(false);
      return;
    }

    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Please use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    setIsRecording(true);
    setShowVoiceModal(true);
    setVoiceTranscript('');

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setVoiceTranscript(transcript);
      setInputVal(transcript);
    };

    recognition.onerror = (event) => {
      console.error('[Voice] Error:', event.error);
      setIsRecording(false);
      setShowVoiceModal(false);
      if (event.error === 'not-allowed') {
        alert('Microphone permission denied. Please allow microphone access in your browser settings.');
      } else if (event.error === 'audio-capture') {
        alert('No microphone was found. Please ensure a microphone is plugged in and enabled.');
      } else if (event.error === 'no-speech') {
        alert('No speech was detected. Please try speaking again.');
      } else {
        alert(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      setShowVoiceModal(false);
    };

    recognition.start();
  };

  const handleFileAttach = () => {
    if (attachedFile) {
      setAttachedFile(null);
    } else {
      setAttachedFile({ name: 'auth.js', size: '2.4 KB' });
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF document.');
      return;
    }

    setPdfUploading(true);
    setMessages(prev => [...prev, {
      sender: 'ai',
      text: `🔄 Indexing reference manual *${file.name}* into Knowledge Base... Please wait.`,
      insight: 'Extracting text and generating semantic chunks for RAG context.'
    }]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = getToken();
      const res = await fetch('/api/kb/upload', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload PDF.');
      }

      setMessages(prev => [...prev, {
        sender: 'ai',
        text: `✅ Successfully indexed **${file.name}** into local Knowledge Base!\n\n* **Chunks Generated**: ${data.chunks}\n* **Status**: Ready for repository-aware RAG queries.`,
        insight: 'Semantic retrieval is now active for this reference manual.'
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: `⚠️ PDF Indexing Error: ${err.message}`,
        insight: 'Ensure the file is a valid PDF and the backend server is running.'
      }]);
    } finally {
      setPdfUploading(false);
      e.target.value = ''; // Reset input
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
              onClick={() => { setActiveSection('chat'); window.location.hash = '#dashboard?section=chat'; }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border ${
                activeSection === 'chat' && window.location.hash !== '#visualizer-page'
                  ? 'bg-[#7C5CFF]/15 border-[#7C5CFF]/30 text-[#F8FAFC]'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
              }`}
            >
              <Sparkles size={16} className={activeSection === 'chat' && window.location.hash !== '#visualizer-page' ? 'text-[#7C5CFF]' : 'text-slate-400'} />
              <span>Git Assistant</span>
            </button>

            <button
              onClick={() => { setActiveSection('ide'); window.location.hash = '#dashboard?section=ide'; }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border ${
                activeSection === 'ide'
                  ? 'bg-[#7C5CFF]/15 border-[#7C5CFF]/30 text-[#F8FAFC]'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
              }`}
            >
              <Code size={16} className={activeSection === 'ide' ? 'text-[#7C5CFF]' : 'text-slate-400'} />
              <span>Code IDE</span>
            </button>

            <button
              onClick={() => window.location.hash = '#visualizer-page'}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50"
            >
              <Activity size={16} className="text-slate-400" />
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

          {/* Chat History Section */}
          <div className="px-3 py-2 border-t border-white/[0.05] mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Chat History</span>
              <button
                onClick={() => { setActiveConversationId(null); setMessages([]); }}
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
                <div key={key} className="flex flex-col gap-1">
                  <span className="text-[9px] font-heading font-bold tracking-wider text-slate-500 uppercase px-2 mb-0.5">{label}</span>
                  {items.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={async () => {
                        setActiveConversationId(conv.id);
                        try {
                          const r = await apiFetch(`/conversations/${conv.id}`);
                          const data = await r.json();
                          if (data.messages) {
                            setMessages(data.messages.map(m => ({
                              sender: m.role === 'user' ? 'user' : 'ai',
                              text: m.content,
                              ...(m.metadata || {}),
                            })));
                          }
                        } catch {}
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer truncate flex items-center gap-2 group ${
                        activeConversationId === conv.id
                          ? 'bg-slate-800/80 text-white border-l-2 border-[#7C5CFF]'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 border-l-2 border-transparent'
                      }`}
                    >
                      <MessageSquare size={11} className="opacity-50 flex-shrink-0 group-hover:text-[#00D4FF]" />
                      <span className="truncate flex-1">{conv.title}</span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await apiFetch(`/conversations/${conv.id}`, { method: 'DELETE' });
                          if (activeConversationId === conv.id) { setActiveConversationId(null); setMessages([]); }
                          loadChatHistory();
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 transition-all cursor-pointer"
                      >
                        <Trash2 size={10} />
                      </button>
                    </button>
                  ))}
                </div>
              );
            })}

            {Object.values(chatHistory).every(arr => arr.length === 0) && (
              <div className="text-slate-500 text-xs px-4 flex flex-col items-center gap-3 mt-8 text-center">
                <MessageSquare size={20} className="opacity-40" />
                <p>{sidebarEmptyStateText}</p>
              </div>
            )}
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
              <span>{isRepositoryConnected && connectedRepo ? `${connectedRepo.name} (${connectedRepo.defaultBranch})` : 'Connect / Import GitHub Repo'}</span>
              <ChevronDown size={12} className={`opacity-60 transition-transform ${isGithubDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isRepositoryConnected && ingestionState.lastIngestedAt && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#00E38C]/10 border border-[#00E38C]/20 text-[#00E38C] shadow-[0_0_8px_rgba(0,227,140,0.15)]" title="Vector DB is updated with latest repository codebase details">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E38C]" />
                Last synced: {new Date(ingestionState.lastIngestedAt).toLocaleDateString()} {new Date(ingestionState.lastIngestedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            )}

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
              {currentUser?.avatarInitial}
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
                      <span className="text-xs font-semibold text-slate-100">{currentUser?.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{currentUser?.email}</span>
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

          {/* IDE PANEL CONTAINER */}
          <div 
            style={{ display: activeSection === 'ide' ? 'flex' : 'none' }} 
            className="flex-1 flex overflow-hidden min-w-0"
          >
            <IDEPanel
              connectedRepo={connectedRepo}
              apiFetch={apiFetch}
              onAskAI={(filename, content) => {
                setActiveSection('chat');
                setInputVal(`Analyze this file: ${filename}\n\n\`\`\`\n${content}\n\`\`\``);
                setTimeout(() => chatInputRef.current?.focus(), 50);
              }}
              externalCommand={externalCommand}
              onClearExternalCommand={() => setExternalCommand(null)}
            />
          </div>

          {/* GIT ASSISTANT CHAT INTERFACE */}
          <div 
            style={{ display: activeSection === 'chat' ? 'flex' : 'none' }}
            className="flex-1 flex flex-col min-w-0 relative bg-[var(--bg-color)]"
          >
            
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
                    {getGreeting(currentUser?.name)}
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
                      {/* Avatar & Persona Badge */}
                      {msg.sender === 'ai' && (
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/[0.1] flex items-center justify-center text-slate-300">
                            <Sparkles size={14} className="text-[#7C5CFF]" />
                          </div>
                          {msg.personaLevel && (
                            <span 
                              className="text-[8px] font-mono font-bold bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#00D4FF] px-1 py-0.5 rounded scale-95 mt-1 select-none text-center" 
                              title={`Persona Level ${msg.personaLevel}: ${msg.personaLabel || 'Git Developer'}`}
                            >
                              Lvl {msg.personaLevel}
                            </span>
                          )}
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
                        <CommandCard 
                          command={msg.commandBlock} 
                          idx={idx} 
                          copiedIndex={copiedIndex}
                          copyToClipboard={copyToClipboard}
                          onRunCommand={handleRunCommandInTerminal}
                        />
                      )}

                      {/* Render Conflict Resolution if exists */}
                      {msg.conflictResolution && (
                        <ConflictResolverCard
                          conflict={msg.conflictResolution}
                          idx={idx}
                          connectedRepo={connectedRepo}
                          setMessages={setMessages}
                          apiFetch={apiFetch}
                          onRunCommand={handleRunCommandInTerminal}
                        />
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

                      {/* Proactive Diagnosed Issue Card */}
                      {msg.diagnosedIssue && (
                        <DiagnosedIssueCard
                          issue={msg.diagnosedIssue}
                          idx={idx}
                          copiedIndex={copiedIndex}
                          copyToClipboard={copyToClipboard}
                          onRunCommand={handleRunCommandInTerminal}
                        />
                      )}
                      </div>

                      {/* User Avatar */}
                      {msg.sender === 'user' && (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] flex items-center justify-center text-white text-xs font-heading font-bold flex-shrink-0">
                          {currentUser?.avatarInitial}
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

            {/* Repair Execution Timeline */}
            {timelineSteps.length > 0 && (
              <div className="px-6 py-3 border-t border-white/[0.06] bg-[#060913]/30">
                <div className="max-w-[800px] mx-auto">
                  <RepairTimeline steps={timelineSteps} />
                </div>
              </div>
            )}

            {/* Bottom Chat Input Bar */}
            <div className="p-4 border-t border-white/[0.06] bg-[#060913]/60 backdrop-blur-md flex-shrink-0">
              <div className="max-w-[800px] mx-auto flex flex-col gap-2">
                
                {/* Floating voice panel above the input bar */}
                <AnimatePresence>
                  {showVoiceModal && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mb-2 bg-slate-950/90 border border-rose-500/20 rounded-xl p-4 w-full flex flex-col gap-3 relative shadow-xl shadow-black/50 backdrop-blur-xl text-left animate-pulse"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 flex items-center justify-center animate-ping flex-shrink-0 ring-4 ring-rose-500/20" />
                          <span className="text-xs font-bold text-slate-200">Listening...</span>
                        </div>
                        <button
                          onClick={toggleRecording}
                          className="px-2.5 py-1 bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-lg text-[10px] font-bold hover:bg-rose-500/30 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <MicOff size={10} /> Stop Listening
                        </button>
                      </div>

                      {/* Waveform */}
                      <div className="flex items-center gap-[2.5px] h-6 my-1">
                        {audioWave.map((h, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: h * 0.7 }}
                            className="w-[2.5px] bg-rose-500 rounded-full"
                            style={{ minHeight: '2px', maxHeight: '20px' }}
                          />
                        ))}
                      </div>

                      {voiceTranscript ? (
                        <p className="text-xs text-slate-300 font-mono leading-relaxed bg-slate-900/50 border border-white/[0.04] p-2.5 rounded-lg max-h-32 overflow-y-auto">
                          {voiceTranscript}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 italic">Say something... your voice transcript will appear here in real-time.</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

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

                {/* Ingestion status indicator above chat input */}
                {isRepositoryConnected && ingestionState.status && (ingestionState.status === 'running' || ingestionState.status === 'failed') && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-500 ${
                    ingestionState.status === 'running'
                      ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                      : ingestionState.status === 'failed'
                      ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  }`}>
                    {ingestionState.status === 'running' ? (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span>📖 Reading repository... {ingestionState.progress > 0 ? `(${ingestionState.progress}%)` : ''}</span>
                        {ingestionState.currentStep && (
                          <span className="text-amber-500/70 text-[10px] ml-1 truncate max-w-[200px]">{ingestionState.currentStep}</span>
                        )}
                      </>
                    ) : ingestionState.status === 'failed' ? (
                      <>
                        <span>⚠️ Ingestion failed</span>
                        {ingestionState.errorMessage && (
                          <span className="text-rose-500/70 text-[10px] ml-1 truncate max-w-[200px]">{ingestionState.errorMessage}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                        <span>✅ Ready — repository fully loaded</span>
                        {ingestionState.chunkCount > 0 && (
                          <span className="text-emerald-500/60 text-[10px] ml-1">({ingestionState.chunkCount} chunks indexed)</span>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Input container */}
                <div className="relative flex items-center bg-slate-900/90 border border-white/[0.08] hover:border-white/[0.15] focus-within:border-[#7C5CFF]/60 rounded-xl px-3 py-2.5 transition-all">
                  
                  {/* Attach File Button */}
                  <button
                    onClick={() => {
                      setShowPasteUrlModal(true);
                      setPasteUrlValue('');
                      setPasteUrlError('');
                    }}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Paste Repository URL"
                  >
                    <Paperclip size={16} />
                  </button>

                  {/* Upload Reference PDF Button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pdfUploading}
                    className={`p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer ${pdfUploading ? 'animate-pulse text-[#7C5CFF]' : ''}`}
                    title="Upload Git Reference PDF Manual"
                  >
                    <BookOpen size={16} />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePdfUpload}
                    accept=".pdf"
                    className="hidden"
                  />

                  {/* Chat Text Area Input */}
                  <textarea
                    ref={chatInputRef}
                    rows={1}
                    placeholder={isRecording ? 'Listening for prompt...' : 'Ask about your connected repository...'}
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent border-none outline-none px-3 py-1 text-sm text-slate-100 placeholder-slate-500 resize-none min-h-[28px] h-auto max-h-32 overflow-y-auto select-text"
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
                      className={`p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer ${
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
                      disabled={!inputVal.trim()}
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
        <div className="sidebar-inner w-[300px] h-full p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {/* Header with Collapse Button */}
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
            <span className="text-xs font-bold font-heading text-slate-400 tracking-wider uppercase flex items-center gap-2">
              <Database size={13} className="text-[#7C5CFF]" /> Repository Details
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
                      // Also refetch health data
                      handleScanRepo();
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
                <>


                  {/* Token Scope Warning Banner */}
                  {!hasWriteAccess && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl flex flex-col gap-2 text-left mb-3">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-400 text-[11px]">
                        <ShieldAlert size={14} className="shrink-0" />
                        <span>Limited GitHub Permissions</span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-normal">
                        Your GitHub connection has limited scopes. To run automatic issue fixes directly via the dashboard, click below to authorize full repository access.
                      </p>
                      <button
                        onClick={handleReconnect}
                        className="w-full py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded text-[9px] cursor-pointer transition-colors text-center"
                      >
                        Reconnect With Full Access
                      </button>
                    </div>
                  )}

                  {/* Repository Health Scanner */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-heading font-bold text-xs tracking-wider text-slate-400 uppercase flex items-center gap-2">
                        <ShieldAlert size={13} className="text-[#7C5CFF]" /> Health Scanner
                      </h4>
                      <button
                        onClick={handleScanRepo}
                        disabled={isScanning}
                        className="px-3 py-1 bg-[#7C5CFF]/20 hover:bg-[#7C5CFF]/30 border border-[#7C5CFF]/30 text-[#7C5CFF] text-[10px] font-bold rounded cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        {isScanning ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                        Scan Repo
                      </button>
                    </div>
                    
                    <div className="bg-slate-950/60 border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-4">
                      {isScanning ? (
                        <div className="flex flex-col gap-3 text-left">
                          <div className="flex items-center gap-2 text-[#00D4FF] mb-2">
                            <Activity size={16} className="animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-widest animate-pulse">Running Deep Scan...</span>
                          </div>
                          {scanSteps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-[10px]">
                              {step.status === 'success' ? <CheckCircle2 size={12} className="text-[#00E38C]" /> :
                               step.status === 'active' ? <Loader2 size={12} className="text-amber-400 animate-spin" /> :
                               step.status === 'failed' ? <AlertTriangle size={12} className="text-rose-400" /> :
                               step.status === 'skipped' ? <div className="w-3 h-3 rounded-full border border-slate-600 flex items-center justify-center text-[8px] text-slate-500 font-bold">-</div> :
                               <div className="w-3 h-3 rounded-full border border-slate-700" />}
                              <span className={step.status === 'success' ? 'text-slate-400' : step.status === 'active' ? 'text-amber-400 font-semibold' : 'text-slate-600'}>
                                {step.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : scanError ? (
                        <div className="flex flex-col gap-3 text-left">
                          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2">
                            <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Scan Error</span>
                              <p className="text-[11px] text-slate-300 leading-normal">
                                {scanError}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleScanRepo}
                            className="w-full py-1.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:opacity-90 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw size={10} />
                            Retry Scan
                          </button>
                        </div>
                      ) : scanCompleted === false ? (
                        <div className="flex flex-col gap-3 text-left">
                          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Rate Limit Warning</span>
                              <p className="text-[10px] text-slate-400 leading-normal">
                                GitHub API rate limit reached. Some checks were skipped. Results may be incomplete.
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5 bg-slate-900/60 p-3 rounded-xl border border-white/[0.04] text-[10px]">
                            <span className="text-slate-500 font-bold uppercase tracking-wider">Checks Run</span>
                            {scanSteps.map(step => {
                              const status = scanChecks ? scanChecks[step.key] : step.status;
                              return (
                                <div key={step.key} className="flex items-center justify-between text-[10px]">
                                  <span className="text-slate-400">{step.label}</span>
                                  <div className="flex items-center gap-1.5 font-mono text-[9px]">
                                    {status === 'success' && <span className="text-[#00E38C]">PASSED</span>}
                                    {status === 'rate_limited' && <span className="text-rose-400">LIMIT</span>}
                                    {status === 'skipped' && <span className="text-slate-600 font-bold">SKIP</span>}
                                    {status === 'failed' && <span className="text-rose-500">FAILED</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex flex-col gap-2 mt-2">
                            <div className="text-[10px] text-slate-500 text-center font-mono">
                              Rate limit resets in: <span className="text-amber-400 font-bold">{formatCountdown(rateLimitCountdown)}</span>
                            </div>
                            <button
                              onClick={handleScanRepo}
                              disabled={rateLimitCountdown > 0 || isScanning}
                              className="w-full py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RefreshCw size={10} className={isScanning ? 'animate-spin' : ''} />
                              Resume Scan
                            </button>
                          </div>

                          {issues.length > 0 && (
                            <div className="flex flex-col gap-2 border-t border-white/[0.05] pt-3 mt-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Partial Scan Issues ({issues.length})</span>
                              {issues.map(issue => (
                                <div key={issue.id} className="bg-slate-900 border border-white/[0.05] rounded-xl overflow-hidden text-left flex flex-col">
                                  <button
                                    onClick={() => toggleIssueExpansion(issue.id)}
                                    className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors cursor-pointer text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${issue.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                        {issue.severity}
                                      </span>
                                      <span className="text-[11px] font-semibold text-slate-200">{issue.title}</span>
                                    </div>
                                    <ChevronDown size={14} className={`text-slate-500 transition-transform ${expandedIssueIds.has(issue.id) ? 'rotate-180' : ''}`} />
                                  </button>
                                  {expandedIssueIds.has(issue.id) && (
                                    <IssueDetails
                                      issue={issue}
                                      connectedRepo={connectedRepo}
                                      repoPermissions={repoPermissions}
                                      activeSSEFixId={activeSSEFixId}
                                      sseProgressSteps={sseProgressSteps}
                                      sseStatus={sseStatus}
                                      ciDiagnostics={ciDiagnostics}
                                      activeDiagnosingJobId={activeDiagnosingJobId}
                                      executeSSEFix={executeSSEFix}
                                      executePOSTFix={executePOSTFix}
                                      diagnoseCIFailure={diagnoseCIFailure}
                                      handleScanRepo={handleScanRepo}
                                      issueConfirmFixData={issueConfirmFixData}
                                      setIssueConfirmFixData={setIssueConfirmFixData}
                                      currentUser={currentUser}
                                      hasWriteAccess={hasWriteAccess}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : issues.filter(i => !i.isFixed).length > 0 ? (
                        <div className="flex flex-col gap-3">
                          <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5 text-left">
                            <AlertTriangle size={14} /> {issues.filter(i => !i.isFixed).length} Issues Detected
                          </div>
                          <div className="flex flex-col gap-2">
                            {issues.map(issue => (
                              <div 
                                key={issue.id} 
                                className={`bg-slate-900 border ${
                                  issue.isFixed 
                                    ? 'border-emerald-500/30 border-l-4 border-l-emerald-500' 
                                    : issue.severity === 'critical'
                                      ? 'border-white/[0.05] border-l-4 border-l-rose-500'
                                      : 'border-white/[0.05] border-l-4 border-l-amber-500'
                                } rounded-xl overflow-hidden text-left flex flex-col transition-all ${issue.isFixed ? 'opacity-85' : ''}`}
                              >
                                {/* Header (Clickable) */}
                                <button
                                  onClick={() => toggleIssueExpansion(issue.id)}
                                  className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors cursor-pointer text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    {issue.isFixed ? (
                                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                                    ) : (
                                      <AlertTriangle size={14} className={issue.severity === 'critical' ? 'text-rose-400 shrink-0' : 'text-amber-400 shrink-0'} />
                                    )}
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                      issue.isFixed 
                                        ? 'bg-[#00E38C]/20 text-[#00E38C]' 
                                        : issue.severity === 'critical' 
                                          ? 'bg-rose-500/20 text-rose-400' 
                                          : 'bg-amber-500/20 text-amber-400'
                                    }`}>
                                      {issue.isFixed ? 'FIXED' : issue.severity}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-200">{issue.title}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <ChevronDown size={14} className={`text-slate-500 transition-transform ${expandedIssueIds.has(issue.id) ? 'rotate-180' : ''}`} />
                                  </div>
                                </button>
                                
                                {/* Expanded Content */}
                                {expandedIssueIds.has(issue.id) && (
                                  <IssueDetails
                                    issue={issue}
                                    connectedRepo={connectedRepo}
                                    repoPermissions={repoPermissions}
                                    activeSSEFixId={activeSSEFixId}
                                    sseProgressSteps={sseProgressSteps}
                                    sseStatus={sseStatus}
                                    ciDiagnostics={ciDiagnostics}
                                    activeDiagnosingJobId={activeDiagnosingJobId}
                                    executeSSEFix={executeSSEFix}
                                    executePOSTFix={executePOSTFix}
                                    diagnoseCIFailure={diagnoseCIFailure}
                                    handleScanRepo={handleScanRepo}
                                    issueConfirmFixData={issueConfirmFixData}
                                    setIssueConfirmFixData={setIssueConfirmFixData}
                                    currentUser={currentUser}
                                    hasWriteAccess={hasWriteAccess}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 px-4 gap-3 text-center bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-2xl shadow-lg shadow-emerald-500/5">
                          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-1 animate-pulse">
                            <CheckCircle2 size={24} className="text-[#00E38C]" />
                          </div>
                          <span className="text-sm font-bold text-emerald-400 font-sans">All Clear! Repository is Healthy</span>
                          <p className="text-[11px] text-slate-400 max-w-[220px] leading-relaxed">
                            No active issues detected. All scanned checks passed successfully.
                          </p>
                          {scanSummary ? (
                            <div className="flex flex-col gap-1 mt-1 text-[10px] text-slate-500 font-mono">
                              <div>Branches Checked: {scanSummary.branchesChecked}</div>
                              <div>PRs Checked: {scanSummary.prsChecked}</div>
                              <div>Files Scanned: {scanSummary.filesScanned}</div>
                              <div className="mt-1 text-[9px] opacity-75">
                                Timestamp: {new Date(scanSummary.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 text-center max-w-[200px]">No issues detected in the latest scan.</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>



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
                </>
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
                    Start Chatting
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



      {/* ── DANGEROUS FIX APPROVAL MODAL ── */}
      <AnimatePresence>
        {showApprovalModal && approvalFixData && (
          <>
            <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50" onClick={() => setShowApprovalModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
            >
              <div className="bg-slate-950 border border-[#7C5CFF]/30 rounded-3xl p-6 w-full max-w-md flex flex-col gap-5 text-left shadow-2xl shadow-purple-950/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#7C5CFF]/10 border border-[#7C5CFF]/20 flex items-center justify-center text-[#00D4FF]">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-heading text-slate-100">Review Automated Fix Plan</h3>
                    <p className="text-[10px] text-slate-500 font-mono tracking-wide uppercase mt-0.5">Approval Required Before Execution</p>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-white/[0.04] p-4 rounded-2xl flex flex-col gap-3 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase font-mono tracking-wider">Issue Detected:</span>
                    <span className="text-slate-200 font-semibold text-[13px]">{approvalFixData.title}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/[0.03] pt-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase font-mono tracking-wider">Risk Level Badge:</span>
                    {(() => {
                      const severity = approvalFixData.fixPlan?.severity || approvalFixData.severity || 'low';
                      let badgeStyle = 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
                      if (severity === 'medium') badgeStyle = 'bg-amber-500/10 border-amber-500/25 text-amber-400';
                      if (severity === 'high' || severity === 'critical') badgeStyle = 'bg-rose-500/10 border-rose-500/25 text-rose-400';
                      return (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border uppercase tracking-wider ${badgeStyle}`}>
                          {severity}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex flex-col gap-2 border-t border-white/[0.03] pt-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase font-mono tracking-wider">Files & Branches to Change:</span>
                    <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                      {approvalFixData.fixPlan?.actions && approvalFixData.fixPlan.actions.length > 0 ? (
                        approvalFixData.fixPlan.actions.map((act, idx) => (
                          <div key={idx} className="flex flex-col gap-1 bg-slate-950/60 p-2.5 rounded-xl border border-white/[0.03]">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-mono text-[8px] text-[#00D4FF] bg-[#00D4FF]/10 px-1 py-0.5 border border-[#00D4FF]/20 rounded font-bold uppercase shrink-0">
                                {act.type.replace('_', ' ')}
                              </span>
                              <span className="text-slate-300 font-mono text-[10px] truncate flex-1 text-right">
                                {act.path || act.branch || 'Repository Settings'}
                              </span>
                            </div>
                            {act.message && (
                              <div className="text-[9px] text-slate-500 font-mono leading-normal border-t border-white/[0.02] pt-1 mt-1 truncate">
                                💬 "{act.message}"
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500 italic text-[10px]">No automated mutations parsed. This action might use default manual scripts.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 border-t border-white/[0.05] pt-4">
                  <button
                    onClick={() => setShowApprovalModal(false)}
                    className="flex-1 py-2.5 bg-slate-900 border border-white/[0.06] hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer text-center"
                  >
                    Cancel / Abort
                  </button>
                  <button
                    onClick={handleConfirmFix}
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] hover:opacity-90 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer text-center shadow-lg shadow-purple-950/20"
                  >
                    Apply Fix Plan 🚀
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}

// ── Git Command Database & Intelligence ──
const GIT_COMMANDS_DB = {
  'git pull origin main': {
    purpose: 'Downloads latest changes from the remote repository and merges them into main.',
    breakdown: [
      { token: 'git', desc: 'Version control system executable.' },
      { token: 'pull', desc: 'Fetch + merge changes from a remote branch.' },
      { token: 'origin', desc: 'Default name for your remote repository.' },
      { token: 'main', desc: 'Target branch to pull changes into.' }
    ],
    risk: 'Low-Medium. May create merge conflicts if your local changes overlap with remote changes.',
    level: 'Medium',
    when: 'Before starting new work or before pushing your own local commits.',
    result: 'Your local main branch is updated with the remote commits.'
  },
  'git push origin main': {
    purpose: 'Uploads your local commits to the remote repository main branch.',
    breakdown: [
      { token: 'git', desc: 'Version control system executable.' },
      { token: 'push', desc: 'Upload local commits to remote.' },
      { token: 'origin', desc: 'Target remote repository.' },
      { token: 'main', desc: 'Target remote branch.' }
    ],
    risk: 'Low. Will fail if the remote branch contains commits you do not have locally.',
    level: 'Low',
    when: 'After committing your changes and verifying they work.',
    result: 'Remote repository main branch is updated with your commits.'
  },
  'git push origin main --force': {
    purpose: 'Overwrites the remote main branch with your local commits, ignoring remote updates.',
    breakdown: [
      { token: 'git', desc: 'Version control system executable.' },
      { token: 'push', desc: 'Upload local commits to remote.' },
      { token: 'origin', desc: 'Target remote repository.' },
      { token: 'main', desc: 'Target remote branch.' },
      { token: '--force', desc: 'Force overwrite remote history. Danger!' }
    ],
    risk: 'Critical. Can overwrite other developer\'s commits and lose history permanently.',
    level: 'High',
    when: 'Only when you need to overwrite history (e.g. after rebasing your own feature branch). Never on shared branches like main.',
    result: 'Remote branch is forcefully aligned with your local history.'
  },
  'git stash': {
    purpose: 'Temporarily shelves (stashes) changes you\'ve made to your working copy so you can work on something else.',
    breakdown: [
      { token: 'git', desc: 'Version control system executable.' },
      { token: 'stash', desc: 'Shelve changes in a dirty working directory.' }
    ],
    risk: 'None. Your changes are saved safely in a stack and can be popped later.',
    level: 'Low',
    when: 'When you have uncommitted changes but need to switch branches or pull main changes.',
    result: 'Your working directory is cleaned, and changes are stored.'
  },
  'git stash pop': {
    purpose: 'Applies your stashed changes back to your working directory and removes them from the stash list.',
    breakdown: [
      { token: 'git', desc: 'Version control system executable.' },
      { token: 'stash', desc: 'Access the stash utility.' },
      { token: 'pop', desc: 'Apply and remove the top stash entry.' }
    ],
    risk: 'Low-Medium. May cause conflicts if the branch you are on has changed since you stashed.',
    level: 'Medium',
    when: 'After pulling changes or returning to your feature branch to resume work.',
    result: 'Your shelved changes are re-applied to your files.'
  },
  'git checkout -b': {
    purpose: 'Creates a new branch and switches to it immediately.',
    breakdown: [
      { token: 'git', desc: 'Version control system executable.' },
      { token: 'checkout', desc: 'Switch branches or restore files.' },
      { token: '-b', desc: 'Option to create a new branch with the specified name.' }
    ],
    risk: 'None.',
    level: 'Low',
    when: 'When you are about to start working on a new feature or bugfix.',
    result: 'You are switched to a new branch.'
  },
  'git merge': {
    purpose: 'Merges commits from another branch into your current active branch.',
    breakdown: [
      { token: 'git', desc: 'Version control system executable.' },
      { token: 'merge', desc: 'Join two or more development histories.' }
    ],
    risk: 'Medium. Can lead to merge conflicts if changes overlap.',
    level: 'Medium',
    when: 'When you want to integrate completed work from a feature branch or pull in main updates.',
    result: 'Commits from the specified branch are merged into your current branch.'
  },
  'git rebase': {
    purpose: 'Re-applies commits from your branch on top of another base branch.',
    breakdown: [
      { token: 'git', desc: 'Version control system executable.' },
      { token: 'rebase', desc: 'Forward-port local commits to the updated upstream head.' }
    ],
    risk: 'High. Rewrites commit history. Can cause major issues if done on public branches.',
    level: 'High',
    when: 'To keep a clean linear history in your feature branch before merging.',
    result: 'Your local commits are re-applied on top of the target branch.'
  }
};

const parseGitCommand = (word) => {
  const cleanWord = word.trim().replace(/^['"`]+|['"`]+$/g, '');
  const matched = GIT_COMMANDS_DB[cleanWord];
  if (matched) return matched;
  
  if (cleanWord.startsWith('git ')) {
    const parts = cleanWord.split(' ');
    const breakdown = parts.map(token => {
      let desc = 'Argument or target reference.';
      if (token === 'git') desc = 'Version control system executable.';
      else if (token === 'pull') desc = 'Fetch and integrate remote changes.';
      else if (token === 'push') desc = 'Upload local commits to remote repository.';
      else if (token === 'checkout') desc = 'Switch branch or restore files.';
      else if (token === 'add') desc = 'Stage file changes for next commit.';
      else if (token === 'commit') desc = 'Record staged changes into repository history.';
      else if (token === 'stash') desc = 'Save local changes to stash stack.';
      else if (token === 'branch') desc = 'Manage branches.';
      else if (token === 'merge') desc = 'Join two or more development histories.';
      else if (token === 'rebase') desc = 'Re-apply commits on top of another base.';
      else if (token === 'origin') desc = 'Default remote name.';
      else if (token === 'main' || token === 'master') desc = 'Primary development branch.';
      else if (token === '-d' || token === '-D') desc = 'Flag to delete branch.';
      else if (token === '-b') desc = 'Flag to create new branch.';
      else if (token.startsWith('--')) desc = 'Command line option / flag.';
      return { token, desc };
    });
    return {
      purpose: `Execute Git ${parts[1] || 'command'} operation.`,
      breakdown,
      risk: parts[1] === 'push' && cleanWord.includes('--force') ? 'Critical: Rewrites remote history.' : 'Low to Medium depending on local edits.',
      level: cleanWord.includes('--force') || cleanWord.includes('rebase') ? 'High' : 'Low',
      when: 'To perform standard version control tasks.',
      result: 'Updates local or remote repository state.'
    };
  }
  return null;
};

// ── Command Card Component ──
function CommandCard({ command, idx, copiedIndex, copyToClipboard, onRunCommand }) {
  const info = parseGitCommand(command);
  const [isHovered, setIsHovered] = useState(false);

  if (!info) {
    return (
      <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.08] bg-[#060913]">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-white/[0.06] text-[10px] font-mono text-slate-400">
          <span>Terminal</span>
          <div className="flex items-center gap-2">
            {onRunCommand && (
              <button
                onClick={() => onRunCommand(command)}
                className="hover:text-[#00D4FF] cursor-pointer flex items-center gap-1 font-bold text-xs"
              >
                <Play size={10} /> Run
              </button>
            )}
            <button onClick={() => copyToClipboard(command, `cmd-${idx}`)} className="hover:text-white cursor-pointer flex items-center gap-1">
              {copiedIndex === `cmd-${idx}` ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <pre className="p-3 text-[11px] font-mono text-left bg-[#010409] text-slate-300"><code>{command}</code></pre>
      </div>
    );
  }

  const riskColor = info.level === 'High' ? 'text-rose-400 bg-rose-500/10' : info.level === 'Medium' ? 'text-amber-400 bg-amber-500/10' : 'text-[#00E38C] bg-[#00E38C]/10';

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#7C5CFF]/30 bg-slate-950/80 transition-all duration-300 relative group text-left">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#00D4FF]" />
          <span className="text-xs font-mono font-bold text-slate-200">Interactive Command Card</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${riskColor}`}>
            Risk: {info.level}
          </span>
          {onRunCommand && (
            <button
              onClick={() => onRunCommand(command)}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-[#00D4FF] transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold border border-white/[0.06] hover:border-[#00D4FF]/30 ml-2"
              title="Execute in IDE Terminal"
            >
              <Play size={10} />
              <span>Run</span>
            </button>
          )}
          <button
            onClick={() => copyToClipboard(command, `cmd-${idx}`)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Copy Command"
          >
            {copiedIndex === `cmd-${idx}` ? <Check size={12} className="text-[#00E38C]" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div 
          className="p-3 bg-[#010409] border border-white/[0.04] rounded-xl font-mono text-xs text-[#00D4FF] relative select-all cursor-help"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {command}
          
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute left-0 top-[110%] mt-2 w-full max-w-[320px] bg-slate-950 border border-white/[0.1] rounded-xl shadow-2xl p-4 z-30 pointer-events-none text-left flex flex-col gap-3 backdrop-blur-xl"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">Purpose</span>
                  <p className="text-xs text-slate-200 font-sans leading-relaxed">{info.purpose}</p>
                </div>

                <div className="flex flex-col gap-1.5 border-t border-white/[0.05] pt-2">
                  <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">Breakdown</span>
                  <div className="flex flex-col gap-1 font-mono text-[10px] text-slate-400">
                    {info.breakdown.map((item, bIdx) => (
                      <div key={bIdx} className="flex gap-2">
                        <span className="text-[#7C5CFF] font-semibold">{item.token}</span>
                        <span className="text-slate-500">—</span>
                        <span className="text-slate-300 font-sans">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1 border-t border-white/[0.05] pt-2">
                  <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">Risk Level</span>
                  <p className="text-xs text-rose-400 font-sans leading-relaxed">{info.risk}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-2 gap-3 text-left border-t border-white/[0.05] pt-3 text-[11px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">When To Use</span>
            <span className="text-slate-300 font-medium leading-relaxed">{info.when}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">Expected Result</span>
            <span className="text-slate-300 font-medium leading-relaxed">{info.result}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Guided Conflict Resolver Component ──
function ConflictResolverCard({ conflict, idx, connectedRepo, setMessages, apiFetch, onRunCommand }) {
  const [resolvedCode, setResolvedCode] = useState(conflict.recommendedResolution || '');
  const [isResolved, setIsResolved] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);

  const handleApplyResolution = async (branchOption) => {
    setSelectedBranch(branchOption);
    let code = '';
    if (branchOption === 'A') {
      const lines = conflict.conflictLines || '';
      const match = lines.match(/<<<<<<<[\s\S]*?\n([\s\S]*?)=======/);
      code = match ? match[1].trim() : 'Branch A content';
    } else if (branchOption === 'B') {
      const lines = conflict.conflictLines || '';
      const match = lines.match(/=======[\s\S]*?\n([\s\S]*?)>>>>>>>/);
      code = match ? match[1].trim() : 'Branch B content';
    } else {
      code = conflict.recommendedResolution;
    }
    
    setResolvedCode(code);
    setIsResolved(true);

    if (connectedRepo) {
      try {
        // Fetch current file content from the local clone to resolve conflict markers safely
        let resolvedFileContent = code;
        try {
          const fileRes = await apiFetch(`/repos/${connectedRepo.id}/contents/file?path=${encodeURIComponent(conflict.conflictFile)}`);
          if (fileRes.ok) {
            const fileData = await fileRes.json();
            const currentContent = fileData.content || '';
            if (currentContent.includes(conflict.conflictLines)) {
              resolvedFileContent = currentContent.replace(conflict.conflictLines, code);
            } else {
              // Try replacing normalized version (CRLF vs LF)
              const normContent = currentContent.replace(/\r\n/g, '\n');
              const normConflict = conflict.conflictLines.replace(/\r\n/g, '\n');
              if (normContent.includes(normConflict)) {
                resolvedFileContent = normContent.replace(normConflict, code);
              }
            }
          }
        } catch (fileErr) {
          console.warn('Failed to load file for inline conflict replacement, falling back to writing code block:', fileErr);
        }

        // Save the resolved content to the local clone
        await apiFetch(`/workspace/${connectedRepo.id}/file`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: conflict.conflictFile,
            content: resolvedFileContent,
            commitMessage: `Resolve merge conflict in ${conflict.conflictFile} via GitSense AI`
          })
        });

        // Trigger staging and commit commands in the terminal
        if (onRunCommand) {
          const runCmd = `git add "${conflict.conflictFile}" && git commit -m "Resolve merge conflict in ${conflict.conflictFile}"`;
          onRunCommand(runCmd);
        }
      } catch (err) {
        console.error('Failed to resolve conflict:', err);
      }
    }

    setMessages(prev => [...prev, {
      sender: 'ai',
      text: `🔧 **Guided Conflict Resolved**: I resolved conflict in **${conflict.conflictFile}** by accepting **${branchOption === 'recommended' ? 'AI Recommendation' : `Branch ${branchOption}`}**.\n\n* **File**: \`${conflict.conflictFile}\`\n* **Status**: Merge conflict resolved successfully.`,
      insight: `Successfully merged target logic from ${conflict.branchB} into ${conflict.branchA}.`,
      recommendation: 'Check out local references and pull changes.'
    }]);
  };

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-amber-500/20 hover:border-amber-500/40 bg-[#0c0d12] transition-all duration-300 text-left">
      <div className="flex items-center justify-between px-4 py-3 bg-amber-500/5 border-b border-amber-500/10">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400 animate-pulse" />
          <span className="text-xs font-bold text-slate-200">Merge Conflict Detected in <code className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-amber-300">{conflict.conflictFile}</code></span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 text-[11px]">
          <div className="flex flex-col gap-0.5 bg-slate-900/60 p-2.5 rounded-xl border border-white/[0.03]">
            <span className="text-[9px] text-slate-500 font-semibold uppercase">Branch A (Current HEAD)</span>
            <span className="text-slate-200 font-bold font-mono">{conflict.branchA || 'main'}</span>
          </div>
          <div className="flex flex-col gap-0.5 bg-slate-900/60 p-2.5 rounded-xl border border-white/[0.03]">
            <span className="text-[9px] text-slate-500 font-semibold uppercase">Branch B (Incoming)</span>
            <span className="text-slate-200 font-bold font-mono">{conflict.branchB || 'feature/login'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">Conflict Code Block</span>
          <pre className="p-3 text-[11px] font-mono overflow-x-auto leading-relaxed bg-[#030712] text-slate-300 rounded-xl border border-white/[0.05]">
            {conflict.conflictLines}
          </pre>
        </div>

        <div className="bg-[#7C5CFF]/5 border border-[#7C5CFF]/15 p-3 rounded-xl flex flex-col gap-1.5 text-[11px]">
          <span className="font-bold text-slate-200 flex items-center gap-1.5 uppercase text-[9px] tracking-wider">
            <Sparkles size={11} className="text-[#00D4FF]" /> AI Recommended Resolution
          </span>
          <p className="text-slate-300 leading-relaxed font-sans">{conflict.explanation}</p>
          <pre className="p-2.5 text-[10px] font-mono overflow-x-auto leading-relaxed bg-[#010409] text-[#00E38C] rounded-lg mt-1 border border-[#00E38C]/10 select-all">
            {conflict.recommendedResolution}
          </pre>
        </div>

        {!isResolved ? (
          <div className="flex flex-col sm:flex-row gap-2 border-t border-white/[0.05] pt-3">
            <button
              onClick={() => handleApplyResolution('A')}
              className="flex-1 py-2 px-3 bg-slate-900 border border-white/[0.08] hover:border-slate-700 text-xs font-semibold text-slate-200 rounded-xl transition-all cursor-pointer text-center"
            >
              Accept {conflict.branchA || 'Branch A'}
            </button>
            <button
              onClick={() => handleApplyResolution('B')}
              className="flex-1 py-2 px-3 bg-slate-900 border border-white/[0.08] hover:border-slate-700 text-xs font-semibold text-slate-200 rounded-xl transition-all cursor-pointer text-center"
            >
              Accept {conflict.branchB || 'Branch B'}
            </button>
            <button
              onClick={() => handleApplyResolution('recommended')}
              className="flex-1 py-2 px-3 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white hover:shadow-lg hover:shadow-[#7C5CFF]/20 text-xs font-bold rounded-xl transition-all cursor-pointer text-center"
            >
              Accept Recommendation
            </button>
          </div>
        ) : (
          <div className="border-t border-white/[0.05] pt-3 flex flex-col gap-2">
            <div className="bg-[#00E38C]/10 border border-[#00E38C]/20 text-[#00E38C] rounded-xl p-3 flex items-center gap-2.5 text-xs">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>Conflict resolved using <strong>{selectedBranch === 'recommended' ? 'AI Recommendation' : `Branch ${selectedBranch}`}</strong>. Code changes merged successfully.</span>
            </div>
            <pre className="p-3 text-[11px] font-mono overflow-x-auto leading-relaxed bg-[#030712] text-slate-400 rounded-xl border border-white/[0.05]">
              {resolvedCode}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Repair Timeline Component ──
function RepairTimeline({ steps }) {
  if (!steps || steps.length === 0) return null;

  const successCount = steps.filter(s => s.status === 'success').length;
  const progressPercent = successCount === 4 ? '100%' :
                          successCount === 3 ? '100%' :
                          successCount === 2 ? '66%' :
                          successCount === 1 ? '33%' : '0%';

  return (
    <div className="bg-slate-950/85 border border-[#7C5CFF]/20 rounded-2xl p-4 flex flex-col gap-3 text-left">
      <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <Activity size={12} className="text-[#7C5CFF] animate-pulse" /> Repair Execution Timeline
      </span>
      <div className="flex items-center justify-between gap-2 mt-1 relative">
        <div className="absolute left-[10%] right-[10%] top-[9px] h-[2px] bg-slate-900 z-0">
          <div 
            className="h-full bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] transition-all duration-1000"
            style={{ width: progressPercent }}
          />
        </div>

        {steps.map((step, sIdx) => {
          const isSuccess = step.status === 'success';
          const isActive = step.status === 'active';
          const circleColor = isSuccess ? 'bg-[#00E38C] text-slate-950' : isActive ? 'bg-[#7C5CFF] text-white animate-pulse' : 'bg-slate-900 text-slate-500';
          const textColor = isSuccess ? 'text-slate-300' : isActive ? 'text-white font-semibold' : 'text-slate-500';

          return (
            <div key={sIdx} className="flex flex-col items-center gap-1.5 flex-1 z-10 relative">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${circleColor}`}>
                {isSuccess ? '✓' : sIdx + 1}
              </div>
              <span className={`text-[10px] font-sans text-center truncate w-full ${textColor}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Proactive Diagnosed Issue Card Component ──
function DiagnosedIssueCard({ issue, idx, copiedIndex, copyToClipboard, onRunCommand }) {
  const [isFixed, setIsFixed] = useState(false);

  return (
    <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.02] p-4 text-left w-full max-w-[90%]">
      {!isFixed ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 items-start">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 flex-shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-slate-100">{issue.title}</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{issue.description}</p>
            </div>
          </div>
          <button
            onClick={() => setIsFixed(true)}
            className="w-full py-2 px-3 rounded-xl bg-[#00E38C] hover:bg-[#00c57a] text-slate-950 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#00E38C]/10"
          >
            Yes, Fix It
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 items-start border-b border-white/[0.05] pb-3">
            <div className="p-2 rounded-xl bg-[#00E38C]/10 text-[#00E38C] flex-shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-slate-100">Fix Plan Revealed</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Please execute the recommended fix commands in your terminal.</p>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#030712]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-b border-white/[0.06] text-[10px] font-mono text-slate-400">
              <span>Terminal Command</span>
              <div className="flex items-center gap-3">
                {onRunCommand && (
                  <button
                    onClick={() => onRunCommand(issue.command)}
                    className="hover:text-[#00D4FF] cursor-pointer flex items-center gap-1 font-bold text-xs"
                  >
                    <Play size={10} /> Run
                  </button>
                )}
                <button
                  onClick={() => copyToClipboard(issue.command, `issue-cmd-${idx}`)}
                  className="hover:text-white cursor-pointer flex items-center gap-1"
                >
                  {copiedIndex === `issue-cmd-${idx}` ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <pre className="p-3 text-[11px] font-mono text-[#00D4FF] bg-[#010409] select-all overflow-x-auto">
              <code>{issue.command}</code>
            </pre>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/40 border border-white/[0.04] text-[11px] text-slate-400 italic">
            Please run the commands above in your local terminal. Do not share credentials or sensitive tokens.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stale Branch Card Item Component ──
function StaleBranchCardItem({ s, idx, connectedRepo, currentUser, hasWriteAccess, handleScanRepo }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixStep, setFixStep] = useState('');
  const [issueFixed, setIssueFixed] = useState(false);
  const [fixMessage, setFixMessage] = useState('');
  const [fixError, setFixError] = useState(null);

  const repoOwner = connectedRepo?.owner || '';
  const repoName = connectedRepo?.name || '';
  const githubToken = currentUser?.githubToken || '';
  const issue = { branchName: s.branchName };

  const handleFixStaleBranch = async () => {
    console.log('handleFixStaleBranch values:', repoOwner, repoName, githubToken, issue.branchName);
    setFixLoading(true);
    setFixStep('Verifying branch exists...');
    
    try {
      const response = await fetch('/api/repo/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repoOwner,
          repo: repoName,
          token: githubToken,
          fixType: 'delete-branch',
          params: { branchName: issue.branchName }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setFixStep('Branch deleted successfully');
        setIssueFixed(true);
        setFixMessage(`Branch "${issue.branchName}" has been permanently deleted from GitHub.`);
        setTimeout(() => {
          handleScanRepo();
        }, 1500);
      } else {
        setFixError(result.error);
      }
    } catch (err) {
      setFixError('Network error — could not reach the fix server. Try again.');
    } finally {
      setFixLoading(false);
    }
  };

  if (issueFixed) {
    return (
      <div className="bg-slate-950 p-3 rounded-xl border border-emerald-500/20 flex flex-col gap-1.5 text-[10px]">
        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
          <CheckCircle2 size={12} />
          <span>Branch Deleted Successfully</span>
        </div>
        <p className="text-slate-300 font-sans leading-normal">{fixMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 p-3 rounded-xl border border-white/[0.05] flex flex-col gap-2 text-[10px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-200">{s.branchName}</span>
        <span className="text-slate-500 font-mono text-[9px]">updated: {new Date(s.lastCommitDate).toLocaleDateString()}</span>
      </div>
      <p className="text-slate-400 text-[10px]">Unmerged commits by: <strong>{s.authorName}</strong></p>

      {fixError && (
        <div className="bg-rose-500/5 border border-rose-500/20 p-2.5 rounded-lg flex flex-col gap-2 mt-1">
          <span className="text-rose-400 font-bold text-[9px] uppercase tracking-wider">Error Occurred</span>
          <p className="text-slate-300 font-sans leading-normal">{fixError}</p>
          <div className="flex gap-2">
            <button
              onClick={handleFixStaleBranch}
              className="px-2.5 py-1 bg-[#7C5CFF] hover:bg-[#6c4be0] text-white rounded font-bold text-[9px] cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={() => setFixError(null)}
              className="px-2.5 py-1 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded font-semibold text-[9px] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {confirmDelete ? (
        <div className="bg-rose-500/5 border border-rose-500/20 p-2.5 rounded-lg flex flex-col gap-2 mt-1">
          <span className="text-rose-400 font-bold text-[9px] uppercase tracking-wider">Warning: Permanent Deletion</span>
          <p className="text-slate-400 text-[10px] leading-normal font-sans">
            This will permanently delete branch <strong>{s.branchName}</strong> from the remote GitHub repository. This cannot be undone. Are you sure?
          </p>
          <div className="flex gap-2">
            {fixLoading ? (
              <button
                disabled
                className="px-2.5 py-1 bg-rose-500/50 text-white rounded font-bold text-[9px] cursor-not-allowed flex items-center gap-1.5"
              >
                <Loader2 size={10} className="animate-spin" /> Deleting Branch
              </button>
            ) : (
              <button
                onClick={handleFixStaleBranch}
                className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded font-bold text-[9px] cursor-pointer"
              >
                Yes Fix It
              </button>
            )}
            <button
              disabled={fixLoading}
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded font-semibold text-[9px] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        !fixError && (
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={!hasWriteAccess}
              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-400 rounded text-[9px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={!hasWriteAccess ? "Requires repository write permission scopes to auto-fix" : ""}
            >
              Delete This Branch
            </button>
            <a
              href={`https://github.com/${repoOwner}/${repoName}/tree/${s.branchName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded text-[9px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              View Branch First <ExternalLink size={10} />
            </a>
          </div>
        )
      )}
    </div>
  );
}

// ── Custom Issue Details Panel Component ──
function IssueDetails({
  issue,
  connectedRepo,
  repoPermissions,
  activeSSEFixId,
  sseProgressSteps,
  sseStatus,
  ciDiagnostics,
  activeDiagnosingJobId,
  executeSSEFix,
  executePOSTFix,
  diagnoseCIFailure,
  handleScanRepo,
  issueConfirmFixData,
  setIssueConfirmFixData,
  currentUser,
  hasWriteAccess
}) {
  const owner = connectedRepo?.owner || '';
  const repo = connectedRepo?.name || '';
  const defaultBranch = connectedRepo?.defaultBranch || 'main';

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmStaleBranch, setConfirmStaleBranch] = useState(null);
  const [confirmCollisionIdx, setConfirmCollisionIdx] = useState(null);
  const [confirmDivergedBranch, setConfirmDivergedBranch] = useState(null);
  const [confirmConflictPR, setConfirmConflictPR] = useState(null);
  const [copiedTextKey, setCopiedTextKey] = useState(null);

  // Automated Branch Sync States
  const [syncingBranch, setSyncingBranch] = useState(null);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState(null);
  const [syncErrors, setSyncErrors] = useState({});
  const [mergeabilityMap, setMergeabilityMap] = useState({});
  const [conflictModal, setConflictModal] = useState(null);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState(null);

  useEffect(() => {
    if (issue.id === 'branch-divergence' && issue.rawState?.diverged?.length > 0) {
      const fetchMergeability = async () => {
        const map = {};
        for (const d of issue.rawState.diverged) {
          try {
            const res = await apiFetch(`/fix/check-mergeability?owner=${owner}&repo=${repo}&branch=${d.branchName}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success) {
                map[d.branchName] = {
                  hasPR: data.hasPR,
                  prNumber: data.prNumber,
                  prUrl: data.prUrl,
                  mergeable: data.mergeable,
                  mergeable_state: data.mergeable_state,
                  conflict_files: data.conflict_files
                };
              } else {
                map[d.branchName] = { error: true, mergeable_state: 'error' };
              }
            } else {
              map[d.branchName] = { error: true, mergeable_state: 'error' };
            }
          } catch (e) {
            console.error('Failed to check mergeability for', d.branchName, e);
            map[d.branchName] = { error: true, mergeable_state: 'error' };
          }
        }
        setMergeabilityMap(map);
      };
      fetchMergeability();
    }
  }, [issue, owner, repo]);

  // Polling for automated merge status
  useEffect(() => {
    if (!conflictModal?.jobId || conflictModal?.mergeStatus === 'completed' || conflictModal?.mergeStatus === 'failed') {
      return;
    }

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/auto-fix/status/${conflictModal.jobId}`);
        if (!res.ok) throw new Error('Failed to fetch status');
        const data = await res.json();
        
        if (isMounted && data.success && data.job) {
          const status = data.job.status;
          const progress = data.job.progress;
          const error = data.job.error;
          const result = data.job.result;

          setConflictModal(prev => {
            if (!prev || prev.jobId !== conflictModal.jobId) return prev;
            return {
              ...prev,
              mergeStatus: status,
              mergeProgress: progress,
              error: status === 'failed' ? error : prev.error,
              mergeResult: result
            };
          });

          if (status === 'completed' || status === 'failed') {
            clearInterval(interval);
            if (handleScanRepo) handleScanRepo();
          }
        }
      } catch (err) {
        console.error('[Merge Polling Error]', err);
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [conflictModal?.jobId, conflictModal?.mergeStatus]);

  const handleSyncBranchAutomated = async (branchName) => {
    setSyncingBranch(branchName);
    setSyncErrors(prev => ({ ...prev, [branchName]: null }));
    setSyncSuccessMessage(null);
    try {
      const res = await apiFetch('/fix/sync-branch', {
        method: 'POST',
        body: JSON.stringify({ owner, repo, branch: branchName, base: defaultBranch })
      });

      const data = await res.json();
      if (res.status === 200) {
        setSyncSuccessMessage(`Branch ${branchName} successfully synced with ${defaultBranch}!`);
        if (handleScanRepo) handleScanRepo();
      } else if (res.status === 409) {
        setConflictModal({
          branchName,
          files: data.files || [],
          explanation: null,
          resolutions: null,
          loadingAnalysis: false,
          loadingApply: false,
          prCreated: null,
          error: null
        });
      } else {
        setSyncErrors(prev => ({ ...prev, [branchName]: data.error || 'Failed to sync branch.' }));
      }
    } catch (err) {
      setSyncErrors(prev => ({ ...prev, [branchName]: err.message || 'An error occurred during branch sync.' }));
    } finally {
      setSyncingBranch(null);
    }
  };

  const handleAnalyzeConflict = async () => {
    if (!conflictModal) return;
    setConflictModal(prev => ({ ...prev, loadingAnalysis: true, error: null }));
    try {
      const res = await apiFetch('/fix/analyze-conflict', {
        method: 'POST',
        body: JSON.stringify({
          owner,
          repo,
          branch: conflictModal.branchName,
          base: defaultBranch,
          files: conflictModal.files
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConflictModal(prev => ({
          ...prev,
          explanation: data.explanation,
          resolutions: data.resolutions,
          loadingAnalysis: false
        }));
        if (data.resolutions && data.resolutions.length > 0) {
          setSelectedPreviewFile(data.resolutions[0].file);
        }
      } else {
        setConflictModal(prev => ({
          ...prev,
          loadingAnalysis: false,
          error: data.error || 'Failed to analyze conflict.'
        }));
      }
    } catch (err) {
      setConflictModal(prev => ({
        ...prev,
        loadingAnalysis: false,
        error: err.message || 'Failed to analyze conflict.'
      }));
    }
  };

  const handleApplyResolution = async () => {
    if (!conflictModal || !conflictModal.resolutions) return;
    setConflictModal(prev => ({ ...prev, loadingApply: true, error: null }));
    try {
      const res = await apiFetch('/fix/apply-resolution', {
        method: 'POST',
        body: JSON.stringify({
          owner,
          repo,
          branch: conflictModal.branchName,
          base: defaultBranch,
          resolutions: conflictModal.resolutions
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConflictModal(prev => ({
          ...prev,
          loadingApply: false,
          prCreated: data.pullRequest,
          jobId: data.jobId,
          mergeStatus: 'processing',
          mergeProgress: 'Resolving conflicts & merging...'
        }));
        if (handleScanRepo) handleScanRepo();
      } else {
        setConflictModal(prev => ({
          ...prev,
          loadingApply: false,
          error: data.error || 'Failed to apply resolution.'
        }));
      }
    } catch (err) {
      setConflictModal(prev => ({
        ...prev,
        loadingApply: false,
        error: err.message || 'Failed to apply resolution.'
      }));
    }
  };


  const copyLocalText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedTextKey(key);
    setTimeout(() => setCopiedTextKey(null), 2000);
  };

  const hasRepoScope = true;
  const isReadOnly = false;

  const isFixingThis = activeSSEFixId === issue.id;

  const getFixSteps = () => {
    if (issue.id === 'missing-gitignore') {
      return [
        { key: 'detect_type', label: 'Detecting project type' },
        { key: 'build_content', label: 'Building gitignore content' },
        { key: 'create_file', label: 'Creating file on GitHub' },
        { key: 'verify_file', label: 'Verifying file exists' },
        { key: 'complete', label: 'Complete' }
      ];
    }
    if (issue.id === 'stale-branches') {
      return [
        { key: 'confirm_exists', label: 'Confirming branch exists' },
        { key: 'delete_branch', label: 'Deleting remote branch' },
        { key: 'verify_deletion', label: 'Verifying deletion' },
        { key: 'complete', label: 'Complete' }
      ];
    }
    if (issue.id === 'ci-pipeline-failure') {
      const isCompleteSuccess = sseStatus === 'complete';
      const isCompleteFailed = sseStatus === 'failed';
      let finalLabel = 'Complete';
      if (isCompleteSuccess) finalLabel = 'Run passed';
      else if (isCompleteFailed) finalLabel = 'Run failed again';

      return [
        { key: 'trigger_rerun', label: 'Triggering job rerun' },
        { key: 'wait_start', label: 'Waiting for run to start' },
        { key: 'monitor_status', label: 'Monitoring run status' },
        { key: 'complete', label: finalLabel }
      ];
    }
    return [
      { key: 'trigger', label: 'Triggering auto-fix' },
      { key: 'execute', label: 'Executing fix routines' },
      { key: 'verify', label: 'Verifying resolution' },
      { key: 'complete', label: 'Complete' }
    ];
  };

  const fixSteps = getFixSteps();

  const getStepState = (stepKey, index) => {
    const matched = sseProgressSteps.find(s => s.step === stepKey);
    if (matched) {
      if (matched.status === 'complete' || matched.status === 'success') {
        return 'completed';
      }
      if (matched.status === 'failed') {
        return 'failed';
      }
      return 'running';
    }
    
    const completedKeys = sseProgressSteps
      .filter(s => s.status === 'complete' || s.status === 'success')
      .map(s => s.step);
      
    const isFirstUncompleted = fixSteps.findIndex(s => !completedKeys.includes(s.key)) === index;
    
    if (isFirstUncompleted && sseStatus === 'running') {
      return 'running';
    }
    
    return 'pending';
  };

  const completedCount = fixSteps.filter((s, idx) => getStepState(s.key, idx) === 'completed').length;
  const progressPercentage = sseStatus === 'complete' ? 100 : (completedCount / fixSteps.length) * 100;

  const renderProgressSection = () => {
    return (
      <div className="bg-slate-950 p-3 rounded-xl border border-white/[0.05] flex flex-col gap-3 text-[11px] mt-2">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
          <span className="flex items-center gap-1.5 font-sans">
            <Activity size={12} className="text-purple-400 animate-spin" />
            Executing Repair Flow...
          </span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
        
        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500 ease-out" 
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        <div className="flex flex-col gap-2 mt-1">
          {fixSteps.map((s, idx) => {
            const state = getStepState(s.key, idx);
            return (
              <div key={s.key} className="flex items-center gap-2">
                {state === 'completed' ? (
                  <CheckCircle2 size={12} className="text-[#00E38C] shrink-0" />
                ) : state === 'failed' ? (
                  <X size={12} className="text-rose-400 shrink-0" />
                ) : state === 'running' ? (
                  <Loader2 size={12} className="text-purple-400 animate-spin shrink-0" />
                ) : (
                  <div className="w-2 h-2 bg-slate-700 rounded-full shrink-0 ml-0.5 mr-0.5" />
                )}
                <span className={`text-[10px] ${
                  state === 'completed' ? 'text-slate-500 line-through font-mono' :
                  state === 'running' ? 'text-purple-400 font-bold' :
                  state === 'failed' ? 'text-rose-400 font-bold' :
                  'text-slate-400'
                }`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {sseStatus === 'complete' && (
          <div className="p-2.5 bg-[#00E38C]/10 border border-[#00E38C]/20 text-[#00E38C] rounded-xl text-[10px] font-semibold flex items-center gap-2">
            <CheckCircle2 size={14} /> Fix verified successfully!
          </div>
        )}
        {sseStatus === 'failed' && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-[10px] font-semibold flex flex-col gap-1 text-left">
            <div className="flex items-center gap-2">
              <X size={14} /> Verification failed. Issue still exists.
            </div>
            {sseProgressSteps.find(s => s.status === 'failed')?.message && (
              <p className="text-[9px] text-slate-400 mt-1 font-mono">
                {sseProgressSteps.find(s => s.status === 'failed')?.message}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 pt-0 border-t border-white/[0.05] flex flex-col gap-4 mt-2 text-left">
      {issue.isFixed && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-[10px] flex flex-col gap-1.5 leading-normal">
          <div className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 size={14} />
            <span>Issue Resolved Successfully!</span>
          </div>
          <p className="text-slate-300">
            {issue.fixedDescription || `This issue was auto-fixed and verified successfully.`}
          </p>
          <span className="text-[9px] text-slate-400 font-mono">
            Fixed at: {issue.fixedAt ? new Date(issue.fixedAt).toLocaleString() : new Date().toLocaleString()}
          </span>
          {issue.fixedUrl && (
            <a 
              href={issue.fixedUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[#00D4FF] hover:underline flex items-center gap-1 font-semibold mt-1"
            >
              View changes on GitHub <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}

      {!issue.isFixed && (
        <>
          <div className="flex flex-col gap-1">
            <h5 className="text-[9px] font-bold text-[#00D4FF] uppercase tracking-wider">What is the issue?</h5>
            <p className="text-[10px] text-slate-300 leading-relaxed">{issue.whatIsTheIssue || issue.description}</p>
          </div>
          <div className="flex flex-col gap-1">
            <h5 className="text-[9px] font-bold text-[#7C5CFF] uppercase tracking-wider">How this happened</h5>
            <p className="text-[10px] text-slate-300 leading-relaxed">{issue.howThisHappened}</p>
          </div>

          {!hasRepoScope && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[10px] leading-normal flex items-start gap-1.5 mb-1">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>Automatic fixes require write permissions. Please reconnect your account with full repository access (using the banner in the sidebar).</span>
            </div>
          )}
          {isReadOnly && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-[10px] leading-normal flex items-start gap-1.5 mb-1">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>You have read-only access to this repository. You cannot apply fixes directly. You can still copy the manual commands below.</span>
            </div>
          )}

          {issue.id === 'missing-gitignore' && (
            <div className="flex flex-col gap-3">
              {isFixingThis ? (
                renderProgressSection()
              ) : showConfirm ? (
                <div className="bg-slate-950 p-3 rounded-xl border border-white/[0.05] flex flex-col gap-3 text-[11px]">
                  <span className="font-bold text-amber-400">Confirm Action: Create .gitignore File</span>
                  
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Commit Target Branch</span>
                    <strong className="text-slate-300 font-mono text-[10px]">{defaultBranch}</strong>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">File Content Preview</span>
                    <pre className="p-2.5 bg-slate-900 rounded text-[9px] font-mono text-slate-400 leading-relaxed overflow-x-auto select-all max-h-32 overflow-y-auto">
{`node_modules/
.env
.env.local
.env.production
.env.development
dist/
build/
.DS_Store`}
                    </pre>
                  </div>

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => {
                        setShowConfirm(false);
                        executePOSTFix(issue, 'gitignore');
                      }}
                      className="px-3 py-1.5 bg-[#00E38C] hover:bg-[#00c57a] text-slate-950 font-bold rounded text-[10px] cursor-pointer"
                    >
                      Yes, Create It
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="px-3 py-1.5 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={isReadOnly}
                  className="w-full py-1.5 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] hover:opacity-90 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isReadOnly ? "Requires repository write permission scopes to auto-fix" : ""}
                >
                  <Wand2 size={12} /> Create .gitignore File
                </button>
              )}
            </div>
          )}

          {issue.id === 'pr-merge-conflicts' && (
            <div className="flex flex-col gap-3">
              {(issue.rawState?.conflicts || []).map((c, idx) => {
                const isConfirming = confirmConflictPR === c.prNumber;
                const cmdString = `# Step 1 — fetch latest changes
git fetch origin

# Step 2 — switch to conflicting branch
git checkout ${c.headBranch}

# Step 3 — merge target branch to see conflicts locally
git merge origin/${c.baseBranch}

# Step 4 — open conflicting files and resolve manually
# Conflicting files in this PR:
${c.conflictingFiles?.map(f => `# - ${f}`).join('\n')}

# Step 5 — commit and push fixes
git add .
git commit -m "fix: resolve merge conflicts with ${c.baseBranch}"
git push origin ${c.headBranch}`;

                return (
                  <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-white/[0.05] flex flex-col gap-2">
                    <span className="font-bold text-rose-400 text-[10px]">Conflict in PR #{c.prNumber}: {c.title}</span>
                    <p className="text-[10px] text-slate-400 leading-normal font-sans">
                      GitHub reports this PR has unresolved conflicts in: <strong>{c.conflictingFiles?.join(', ')}</strong>
                    </p>

                    {isConfirming ? (
                      <div className="flex flex-col gap-3 bg-[#030712] p-3 rounded-xl border border-white/[0.08] mt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Terminal Commands</span>
                          <button
                            onClick={() => copyLocalText(cmdString, `pr-conflict-cmd-${c.prNumber}`)}
                            className="text-[#00D4FF] hover:underline text-[9px] font-semibold cursor-pointer"
                          >
                            {copiedTextKey === `pr-conflict-cmd-${c.prNumber}` ? 'Copied!' : 'Copy Commands'}
                          </button>
                        </div>
                        <pre className="p-2.5 bg-[#010409] rounded text-[9px] font-mono text-[#00D4FF] leading-relaxed overflow-x-auto select-all max-h-48 overflow-y-auto">
                          <code>{cmdString}</code>
                        </pre>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              handleScanRepo();
                            }}
                            className="px-3 py-1.5 bg-[#00E38C] hover:bg-[#00c57a] text-slate-950 rounded font-bold text-[9px] cursor-pointer"
                          >
                            Verify After Running
                          </button>
                          <button
                            onClick={() => setConfirmConflictPR(null)}
                            className="px-3 py-1.5 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded font-semibold text-[9px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmConflictPR(c.prNumber)}
                        className="px-3 py-1.5 bg-[#7C5CFF]/20 hover:bg-[#7C5CFF]/30 border border-[#7C5CFF]/30 text-[#00D4FF] rounded text-[10px] font-bold cursor-pointer w-fit"
                      >
                        Resolve Conflict...
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {issue.id === 'branch-divergence' && (
            <div className="flex flex-col gap-3">
              {(issue.rawState?.diverged || []).map((d, idx) => {
                const isConfirming = confirmDivergedBranch === d.branchName;
                const cmdString = `# Sync branch '${d.branchName}' with default branch
git checkout ${d.branchName}
git fetch origin
git merge origin/${defaultBranch}

# If conflicts appear during merge:
# Resolve conflict blocks, then stage and commit:
git add .
git commit -m "chore: sync ${d.branchName} with ${defaultBranch}"
git push origin ${d.branchName}`;

                const mergeability = mergeabilityMap[d.branchName];
                const isSyncing = syncingBranch === d.branchName;
                const hasMergeState = !!mergeability;

                return (
                  <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-white/[0.05] flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-100 text-[11px] flex items-center gap-1.5">
                          <GitBranch size={12} className="text-[#7C5CFF]" />
                          {d.branchName}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {d.behindBy} commits behind <span className="font-mono text-slate-300">{defaultBranch}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasMergeState ? (
                          (() => {
                            const state = mergeability.mergeable_state;
                            if (state === 'clean' || state === 'draft') {
                              return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#00E38C]/10 text-[#00E38C] border border-[#00E38C]/20 uppercase font-mono">Mergeable</span>;
                            } else if (state === 'dirty' || state === 'conflict' || mergeability.mergeable === false) {
                              return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#FF4F5E]/10 text-[#FF4F5E] border border-[#FF4F5E]/20 uppercase font-mono">Conflicts</span>;
                            } else if (state === 'error') {
                              return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase font-mono">Failed</span>;
                            } else {
                              return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase font-mono">{state || 'Blocked'}</span>;
                            }
                          })()
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-900 text-slate-400 border border-white/[0.05] uppercase font-mono flex items-center gap-1">
                            <Loader2 size={10} className="animate-spin" /> Checking
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Inline Success / Error message for this branch */}
                    {syncSuccessMessage && syncSuccessMessage.includes(d.branchName) && (
                      <div className="bg-[#00E38C]/10 border border-[#00E38C]/20 text-[#00E38C] text-[10px] p-2 rounded-lg font-medium">
                        ✓ {syncSuccessMessage}
                      </div>
                    )}
                    {syncErrors[d.branchName] && (
                      <div className="bg-rose-500/10 border border-rose-500/20 text-[#FF4F5E] text-[10px] p-2 rounded-lg font-medium">
                        ⚠ {syncErrors[d.branchName]}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={isSyncing}
                        onClick={() => handleSyncBranchAutomated(d.branchName)}
                        className="px-3 py-1.5 bg-[#7C5CFF] hover:bg-[#6c4be0] disabled:bg-slate-800 disabled:text-slate-500 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1.5 transition-all"
                      >
                        {isSyncing ? (
                          <>
                            <Loader2 size={11} className="animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Wand2 size={11} />
                            Sync Automatically
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setConfirmDivergedBranch(isConfirming ? null : d.branchName)}
                        className="px-3 py-1.5 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded text-[10px] font-semibold cursor-pointer"
                      >
                        {isConfirming ? 'Hide Manual Steps' : 'Manual Steps'}
                      </button>
                    </div>

                    {isConfirming && (
                      <div className="flex flex-col gap-3 bg-[#030712] p-3 rounded-xl border border-white/[0.08] mt-1 text-[10px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Terminal Commands</span>
                          <button
                            onClick={() => copyLocalText(cmdString, `sync-branch-cmd-${d.branchName}`)}
                            className="text-[#00D4FF] hover:underline text-[9px] font-semibold cursor-pointer"
                          >
                            {copiedTextKey === `sync-branch-cmd-${d.branchName}` ? 'Copied!' : 'Copy Commands'}
                          </button>
                        </div>
                        <pre className="p-2.5 bg-[#010409] rounded text-[9px] font-mono text-[#00D4FF] leading-relaxed overflow-x-auto select-all">
                          <code>{cmdString}</code>
                        </pre>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleScanRepo()}
                            className="px-3 py-1.5 bg-[#00E38C] hover:bg-[#00c57a] text-slate-950 rounded font-bold text-[9px] cursor-pointer"
                          >
                            Verify After Running
                          </button>
                          <button
                            onClick={() => setConfirmDivergedBranch(null)}
                            className="px-3 py-1.5 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded font-semibold text-[9px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {issue.id === 'stale-branches' && (
            <div className="flex flex-col gap-3">
              {(issue.rawState?.stale || []).map((s, idx) => (
                <StaleBranchCardItem
                  key={idx}
                  s={s}
                  idx={idx}
                  connectedRepo={connectedRepo}
                  currentUser={currentUser}
                  hasWriteAccess={hasWriteAccess}
                  handleScanRepo={handleScanRepo}
                />
              ))}
            </div>
          )}

          {issue.id === 'large-files-tracked' && (
            <div className="flex flex-col gap-3">
              {(issue.rawState?.largeFiles || []).map((f, idx) => {
                const cmdString = `# Step 1 — untrack file from git index without deleting it locally
git rm --cached ${f.path}

# Step 2 — ignore it to prevent committing it again
echo "${f.path.split('/').pop()}" >> .gitignore

# Step 3 — commit the index change
git add .gitignore
git commit -m "fix: untrack large file ${f.path.split('/').pop()} from index"
git push origin ${defaultBranch}

# (Optional) Step 4 — rewrite history to purge files from old commits:
# WARNING: rewrites history, requires teammates to re-clone!
git filter-branch --force --index-filter \\
  'git rm --cached --ignore-unmatch ${f.path}' \\
  --prune-empty --tag-name-filter cat -- --all`;

                return (
                  <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-white/[0.05] flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-200 font-mono truncate mr-2">{f.path}</span>
                      <span className="text-rose-400 font-bold">{(f.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal font-sans">
                      To properly untrack and remove this file from your Git history (reducing repository size), execute the following commands in your local machine terminal:
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Terminal Commands</span>
                      <button
                        onClick={() => copyLocalText(cmdString, `large-file-cmd-${idx}`)}
                        className="text-[#00D4FF] hover:underline text-[9px] font-semibold cursor-pointer"
                      >
                        {copiedTextKey === `large-file-cmd-${idx}` ? 'Copied!' : 'Copy Commands'}
                      </button>
                    </div>
                    <pre className="p-2.5 bg-[#010409] rounded text-[9px] font-mono text-[#00D4FF] leading-relaxed overflow-x-auto select-all max-h-48 overflow-y-auto">
                      <code>{cmdString}</code>
                    </pre>
                  </div>
                );
              })}
              <button
                onClick={handleScanRepo}
                className="w-full py-1.5 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-[#00D4FF] text-[10px] font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer"
              >
                I Have Done This — Verify Now
              </button>
            </div>
          )}

          {issue.id === 'cross-branch-collisions' && (
            <div className="flex flex-col gap-3">
              {(issue.rawState?.collisions || []).map((c, idx) => {
                const prsStr = c.prNumbers.join(' and PR #');
                const isConfirming = confirmCollisionIdx === idx;
                const isThisCollisionFixing = isFixingThis;

                return (
                  <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-white/[0.05] flex flex-col gap-2 text-[10px]">
                    <span className="font-bold text-amber-400 font-sans">Overlapping File: {c.filePath}</span>
                    <p className="text-slate-400 font-sans">
                      This file is concurrently modified in open PR #{prsStr}. Merging one will conflict the other.
                    </p>
                    <div className="bg-slate-900 p-2.5 rounded border border-white/[0.03] text-[9px]">
                      <strong>Recommended merge plan:</strong> Merge the older PR first, then rebase the remaining branch:
                      <pre className="text-emerald-400 font-mono mt-1 overflow-x-auto select-all">
{`git checkout SECOND_PR_BRANCH_NAME
git fetch origin
git rebase origin/${defaultBranch}
# Fix conflicting blocks in: ${c.filePath}
git push origin SECOND_PR_BRANCH_NAME --force-with-lease`}
                      </pre>
                    </div>

                    {isThisCollisionFixing ? (
                      renderProgressSection()
                    ) : isConfirming ? (
                      <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-lg flex flex-col gap-2 mt-1">
                        <span className="text-amber-400 font-bold text-[9px] uppercase tracking-wider font-mono">Confirm GitHub Comment Posting</span>
                        <p className="text-slate-400 text-[10px] leading-normal font-sans">
                          This will post a real warning comment on PR #{c.prNumbers[0]} and PR #{c.prNumbers[1]} naming both pull requests and suggesting coordination. Continue?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setConfirmCollisionIdx(null);
                              executePOSTFix(issue, 'post-pr-comment', { 
                                prNumber1: c.prNumbers[0], 
                                prNumber2: c.prNumbers[1], 
                                collidingFiles: [c.filePath]
                              });
                            }}
                            className="px-2.5 py-1 bg-[#00E38C] text-slate-950 rounded font-bold text-[9px] cursor-pointer"
                          >
                            Yes, Post Coordination Comments
                          </button>
                          <button
                            onClick={() => setConfirmCollisionIdx(idx)}
                            className="px-2.5 py-1 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded font-semibold text-[9px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCollisionIdx(idx)}
                        disabled={isReadOnly}
                        className="px-2.5 py-1 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] hover:opacity-90 text-white rounded text-[9px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isReadOnly ? "Requires repository write permission scopes to auto-fix" : ""}
                      >
                        Post Coordination Comment on Both PRs
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {issue.id === 'ci-pipeline-failure' && (
            <div className="flex flex-col gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-white/[0.05] flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-slate-200">Failed Job: {issue.rawState?.failedJob}</span>
                  <span className="text-rose-400 font-bold font-mono text-[9px]">conclusion: {issue.rawState?.conclusion}</span>
                </div>
                <p className="text-[10px] text-slate-400">Failed step target: <strong>{issue.rawState?.failedStep}</strong></p>
              </div>

              {ciDiagnostics[issue.rawState?.runId] ? (
                <div className="bg-[#030712] rounded-xl border border-white/[0.05] p-3 flex flex-col gap-2 text-left">
                  <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1 font-mono">
                    <ShieldAlert size={12} /> Failure Log Diagnostic Window ({ciDiagnostics[issue.rawState?.runId].jobName})
                  </span>
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scrollbar border border-white/[0.04] p-2 bg-black/40 rounded-lg font-mono text-[9px] leading-relaxed text-slate-300">
                    {ciDiagnostics[issue.rawState?.runId].snippets?.length > 0 ? (
                      ciDiagnostics[issue.rawState?.runId].snippets.map((snip, idx) => (
                        <div key={idx} className="border-b border-white/[0.03] pb-2 last:border-b-0">
                          <div className="text-slate-500 font-bold text-[8px] mb-1">Lines {snip.startLine} - {snip.endLine}:</div>
                          <pre className="whitespace-pre-wrap text-[#ffd166] select-all bg-black/20 p-1 rounded font-mono">{snip.content}</pre>
                        </div>
                      ))
                    ) : (
                      <span className="italic text-slate-500 text-[10px] font-sans">No failed log markers matched standard filters (ERROR/FAILED/AssertionError).</span>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => diagnoseCIFailure(issue.rawState?.runId)}
                  disabled={activeDiagnosingJobId === issue.rawState?.runId}
                  className="w-full py-1.5 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-[#00D4FF] text-[10px] font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {activeDiagnosingJobId === issue.rawState?.runId ? (
                    <><Loader2 size={12} className="animate-spin" /> Diagnosing Logs...</>
                  ) : (
                    <><Code size={12} /> Diagnose CI Failure</>
                  )}
                </button>
              )}

              {isFixingThis ? (
                renderProgressSection()
              ) : showConfirm ? (
                <div className="bg-slate-950 p-3 rounded-xl border border-white/[0.05] flex flex-col gap-3 text-[11px]">
                  <span className="font-bold text-amber-400 font-mono">Confirm Re-run Workflow Jobs</span>
                  <p className="text-slate-400 leading-relaxed font-sans">
                    This will request a re-run of only the failed jobs in this Action run via the GitHub API and poll execution progress in real-time. Continue?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowConfirm(false);
                        executePOSTFix(issue, 'rerun-ci', { runId: issue.rawState?.runId });
                      }}
                      className="px-3 py-1.5 bg-[#00E38C] text-slate-950 font-bold rounded text-[10px] cursor-pointer"
                    >
                      Confirm Yes, Re-run Jobs
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="px-3 py-1.5 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={isReadOnly}
                  className="w-full py-1.5 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] hover:opacity-90 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isReadOnly ? "Requires repository write permission scopes to auto-fix" : ""}
                >
                  <Wand2 size={12} /> Re-run Failed Jobs
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Branch Conflict Resolution Modal */}
      <AnimatePresence>
        {conflictModal && (
          <>
            {/* Modal backdrop */}
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]" 
              onClick={() => setConflictModal(null)} 
            />
            
            {/* Modal container */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4 md:p-6"
            >
              <div className="bg-slate-950 border border-[#7C5CFF]/30 rounded-3xl p-6 w-full max-w-4xl max-h-[85vh] flex flex-col gap-5 text-left shadow-2xl overflow-hidden shadow-purple-950/20">
                
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FF4F5E]/10 border border-[#FF4F5E]/20 flex items-center justify-center text-[#FF4F5E]">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold font-heading text-slate-100 flex items-center gap-2">
                        Resolve Branch Merge Conflicts
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono tracking-wide uppercase mt-0.5">
                        Branch: <span className="text-[#00D4FF] font-semibold">{conflictModal.branchName}</span> → Base: <span className="text-slate-300 font-semibold">{defaultBranch}</span>
                      </p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setConflictModal(null)}
                    className="p-1.5 hover:bg-slate-900 border border-transparent hover:border-white/[0.08] rounded-xl text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Content body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-4 text-xs">
                  {/* PR Created Status / Success State */}
                  {conflictModal.jobId ? (
                    <div className="flex flex-col items-center justify-center text-center py-8 px-4 bg-slate-900/40 border border-white/[0.05] rounded-3xl gap-4 w-full">
                      {conflictModal.mergeStatus === 'processing' && (
                        <>
                          <div className="w-12 h-12 rounded-full bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 flex items-center justify-center text-[#7C5CFF]">
                            <Loader2 size={24} className="animate-spin text-[#00D4FF]" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <h4 className="text-sm font-bold text-slate-100">Resolving Conflicts & Merging...</h4>
                            <p className="text-slate-400 max-w-md text-[11px] leading-relaxed">
                              {conflictModal.mergeProgress || 'Analyzing branch delta and preparing changes...'}
                            </p>
                          </div>
                        </>
                      )}

                      {conflictModal.mergeStatus === 'completed' && (
                        <>
                          <div className="w-12 h-12 rounded-full bg-[#00E38C]/15 border border-[#00E38C]/30 flex items-center justify-center text-[#00E38C]">
                            <CheckCircle2 size={24} className="text-[#00E38C] animate-pulse" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <h4 className="text-sm font-bold text-slate-100">Merged successfully</h4>
                            <p className="text-slate-400 max-w-md text-[11px] leading-relaxed">
                              GitSense AI successfully resolved conflicts and squash-merged the PR back into the target branch.
                            </p>
                            {conflictModal.mergeResult?.conflictsResolved?.length > 0 && (
                              <div className="mt-2 text-[10px] text-slate-500 font-mono">
                                Resolved files: {conflictModal.mergeResult.conflictsResolved.join(', ')}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {conflictModal.mergeStatus === 'failed' && (
                        <>
                          <div className="w-12 h-12 rounded-full bg-[#FF4F5E]/15 border border-[#FF4F5E]/30 flex items-center justify-center text-[#FF4F5E]">
                            <AlertTriangle size={24} className="text-[#FF4F5E]" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <h4 className="text-sm font-bold text-slate-100">Manual review needed</h4>
                            <p className="text-[#FF4F5E] max-w-md text-[11px] leading-relaxed font-semibold">
                              {conflictModal.error || 'Conflict resolution could not be safely automated.'}
                            </p>
                            <p className="text-slate-400 max-w-md text-[10px] leading-relaxed mt-1">
                              Please resolve conflicts manually on GitHub or in your local workspace.
                            </p>
                          </div>
                          {conflictModal.prCreated && (
                            <a 
                              href={conflictModal.prCreated.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 px-4 py-2 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 hover:opacity-90 shadow-lg shadow-purple-950/20"
                            >
                              <GitPullRequest size={13} />
                              View PR on GitHub #{conflictModal.prCreated.number}
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  ) : conflictModal.prCreated ? (
                    <div className="flex flex-col items-center justify-center text-center py-8 px-4 bg-[#00E38C]/5 border border-[#00E38C]/10 rounded-2xl gap-3">
                      <div className="w-12 h-12 rounded-full bg-[#00E38C]/10 border border-[#00E38C]/20 flex items-center justify-center text-[#00E38C]">
                        <CheckCircle2 size={24} className="animate-bounce" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-bold text-slate-100">Conflict Resolutions Committed!</h4>
                        <p className="text-slate-400 max-w-md text-[11px] leading-relaxed">
                          Conflicts have been resolved by GitSense AI, committed to the fresh branch <span className="font-mono text-[#00D4FF] bg-[#00D4FF]/10 px-1 py-0.5 rounded text-[10px]">{conflictModal.branchName}-resolved</span>, and a Pull Request pointing back to your feature branch has been created.
                        </p>
                      </div>
                      
                      <a 
                        href={conflictModal.prCreated.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 px-4 py-2 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 hover:opacity-90 shadow-lg shadow-purple-950/20"
                      >
                        <GitPullRequest size={13} />
                        View Pull Request #{conflictModal.prCreated.number}
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  ) : (
                    <>
                      {/* Conflict Files list & details */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-h-[350px]">
                        
                        {/* Left column: Conflict Files list & actions */}
                        <div className="md:col-span-1 border border-white/[0.05] bg-slate-900/30 rounded-2xl p-4 flex flex-col gap-4">
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase font-mono tracking-wider">Conflicted Files ({conflictModal.files.length})</span>
                            <div className="flex flex-col gap-1.5 mt-2 max-h-48 overflow-y-auto custom-scrollbar">
                              {conflictModal.files.map((file, idx) => (
                                <div 
                                  key={idx} 
                                  onClick={() => {
                                    if (conflictModal.resolutions) {
                                      setSelectedPreviewFile(file);
                                    }
                                  }}
                                  className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-[11px] font-mono cursor-pointer ${
                                    conflictModal.resolutions
                                      ? selectedPreviewFile === file 
                                        ? 'bg-[#7C5CFF]/15 border-[#7C5CFF]/30 text-[#00D4FF]' 
                                        : 'bg-slate-950 border-white/[0.04] text-slate-300 hover:bg-slate-900'
                                      : 'bg-slate-950/60 border-[#FF4F5E]/20 text-[#FF4F5E] cursor-default'
                                  }`}
                                >
                                  <FileText size={12} className="shrink-0" />
                                  <span className="truncate flex-1">{file.split('/').pop()}</span>
                                  {conflictModal.resolutions && (
                                    <span className="text-[8px] bg-[#00E38C]/15 text-[#00E38C] px-1 py-0.5 rounded font-sans uppercase shrink-0 font-bold">Resolved</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Analysis Action */}
                          {!conflictModal.resolutions && (
                            <div className="flex-1 flex flex-col justify-end">
                              {conflictModal.loadingAnalysis ? (
                                <div className="flex flex-col items-center justify-center py-6 gap-2 bg-slate-950 rounded-xl border border-white/[0.04]">
                                  <Loader2 size={24} className="animate-spin text-[#7C5CFF]" />
                                  <span className="text-[10px] text-slate-400 font-medium">Resolving conflicts with AI...</span>
                                </div>
                              ) : (
                                <button
                                  onClick={handleAnalyzeConflict}
                                  className="w-full py-2 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] hover:opacity-95 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-purple-950/20"
                                >
                                  <Cpu size={13} />
                                  Resolve Conflicts with AI
                                </button>
                              )}
                            </div>
                          )}

                          {/* Info description */}
                          {conflictModal.resolutions && !conflictModal.loadingApply && (
                            <div className="flex-1 flex flex-col justify-end gap-3">
                              <div className="bg-slate-950 p-2.5 border border-white/[0.04] rounded-xl text-[10px] text-slate-400 leading-normal">
                                💡 Select files from the list above to preview how the AI has merged overlapping code.
                              </div>
                              <button
                                onClick={handleApplyResolution}
                                className="w-full py-2 bg-[#00E38C] hover:bg-[#00c57a] text-slate-950 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer font-heading"
                              >
                                <Check size={13} />
                                Apply & Create Sync PR
                              </button>
                            </div>
                          )}

                          {conflictModal.loadingApply && (
                            <div className="flex-1 flex flex-col justify-end">
                              <div className="flex flex-col items-center justify-center py-6 gap-2 bg-slate-950 rounded-xl border border-white/[0.04]">
                                <Loader2 size={24} className="animate-spin text-[#00E38C]" />
                                <span className="text-[10px] text-slate-400 font-medium">Creating sync branch & PR...</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right column: Explanations and file preview */}
                        <div className="md:col-span-2 border border-white/[0.05] bg-slate-900/30 rounded-2xl p-4 flex flex-col gap-4 overflow-hidden h-full min-h-[350px]">
                          {conflictModal.error && (
                            <div className="bg-rose-500/10 border border-rose-500/25 text-[#FF4F5E] p-3 rounded-xl flex items-center gap-2">
                              <AlertTriangle size={14} className="shrink-0" />
                              <span>{conflictModal.error}</span>
                            </div>
                          )}

                          {!conflictModal.resolutions && !conflictModal.loadingAnalysis && (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 gap-2">
                              <Cpu size={32} className="text-slate-600 mb-1" />
                              <h4 className="font-bold text-slate-300 text-xs">AI Conflict Diagnosis Ready</h4>
                              <p className="max-w-xs text-[10px] leading-relaxed">
                                Click the button on the left to analyze files on both branches. TruGen AI will automatically reconcile base improvements with your feature implementations.
                              </p>
                            </div>
                          )}

                          {conflictModal.loadingAnalysis && (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 gap-3">
                              <div className="relative w-12 h-12 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#7C5CFF]/30 animate-spin duration-3000" />
                                <Cpu size={24} className="text-[#00D4FF] animate-pulse" />
                              </div>
                              <h4 className="font-bold text-slate-300 text-xs">Generating Resolution Blueprint</h4>
                              <p className="max-w-xs text-[10px] leading-relaxed">
                                Reconciling line divergence, syntax trees, and commit histories. This might take up to a minute...
                              </p>
                            </div>
                          )}

                          {conflictModal.resolutions && (
                            <div className="flex-1 flex flex-col gap-3 overflow-hidden h-full">
                              
                              {/* AI Explanation of resolution */}
                              <div className="bg-slate-950/80 p-3 rounded-xl border border-white/[0.04] text-[10.5px] leading-relaxed text-slate-300">
                                <span className="font-bold text-[#7C5CFF] uppercase font-mono text-[8.5px] tracking-wider block mb-1">AI Resolution Summary</span>
                                {conflictModal.explanation || 'No explanation provided.'}
                              </div>

                              {/* Preview Code area */}
                              <div className="flex-1 flex flex-col border border-white/[0.05] rounded-xl overflow-hidden bg-slate-950 font-mono text-[10px] h-full">
                                <div className="bg-slate-900 px-3 py-2 border-b border-white/[0.04] flex items-center justify-between text-slate-400">
                                  <span className="font-semibold text-slate-300">{selectedPreviewFile}</span>
                                  <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-sans uppercase">Resolved Preview</span>
                                </div>
                                <div className="flex-1 overflow-auto custom-scrollbar p-3 text-slate-300 whitespace-pre-wrap select-all font-mono leading-relaxed max-h-[200px]">
                                  <code>
                                    {conflictModal.resolutions.find(r => r.file === selectedPreviewFile)?.content || ''}
                                  </code>
                                </div>
                              </div>

                            </div>
                          )}
                        </div>

                      </div>
                    </>
                  )}
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-end gap-2 border-t border-white/[0.05] pt-4">
                  <button
                    onClick={() => setConflictModal(null)}
                    className="px-4 py-2 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 rounded-xl font-semibold text-[11px] cursor-pointer"
                  >
                    Close Window
                  </button>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

