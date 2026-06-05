import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, ChevronDown, LogOut, Settings, User, Info, FileText, Sun, Moon, 
  GitBranch, Send, Paperclip, Mic, Activity, Users, CheckCircle2, AlertTriangle, 
  RefreshCw, Plus, HelpCircle, Play, ArrowRight, Lock, GitCommit, GitPullRequest, 
  Sparkles, Terminal, Check, Copy, X, ShieldAlert, Cpu, Eye, MessageSquare, Database,
  ChevronLeft, ChevronRight, Download, Link as LinkIcon, Trash2, Loader2, MicOff,
  ExternalLink, BookOpen, Code, RotateCw
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
  const [connectedRepo, setConnectedRepo] = useState(null);
  const [repoInsights, setRepoInsights] = useState(null);
  const [isRepoLoading, setIsRepoLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('chat'); // chat, ide

  // ── Repository Health & Autonomous Fix State ──
  const [repoHealth, setRepoHealth] = useState(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [timelineSteps, setTimelineSteps] = useState([]);
  const [activeFixingIssueId, setActiveFixingIssueId] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalFixData, setApprovalFixData] = useState(null);

  const fetchHealthData = useCallback(async (repoId) => {
    if (!repoId) return;
    setIsHealthLoading(true);
    try {
      const res = await apiFetch(`/repos/${repoId}/health`);
      const data = await res.json();
      if (data.health) {
        setRepoHealth(data.health);
      }
    } catch (err) {
      console.error('[Health] Failed to fetch repo health:', err);
    } finally {
      setIsHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connectedRepo) {
      fetchHealthData(connectedRepo.id);
    } else {
      setRepoHealth(null);
    }
  }, [connectedRepo, fetchHealthData]);

  const handleFixIssue = async (issue) => {
    if (!connectedRepo) return;
    
    if (!issue.safeToFix) {
      setApprovalFixData(issue);
      setShowApprovalModal(true);
      return;
    }

    setTimelineSteps([
      { label: 'Problem Detected', status: 'success' },
      { label: 'Cause Found', status: 'active' },
      { label: 'Fix Applied', status: 'pending' },
      { label: 'Repository Clean', status: 'pending' }
    ]);
    setActiveFixingIssueId(issue.id);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      setTimelineSteps([
        { label: 'Problem Detected', status: 'success' },
        { label: 'Cause Found', status: 'success' },
        { label: 'Fix Applied', status: 'active' },
        { label: 'Repository Clean', status: 'pending' }
      ]);

      const res = await apiFetch(`/repos/${connectedRepo.id}/fix`, {
        method: 'POST',
        body: JSON.stringify({ issueId: issue.id, action: issue.fixAction }),
      });
      const data = await res.json();

      await new Promise(resolve => setTimeout(resolve, 800));
      setTimelineSteps([
        { label: 'Problem Detected', status: 'success' },
        { label: 'Cause Found', status: 'success' },
        { label: 'Fix Applied', status: 'success' },
        { label: 'Repository Clean', status: 'active' }
      ]);

      await new Promise(resolve => setTimeout(resolve, 600));
      await fetchHealthData(connectedRepo.id);
      
      apiFetch(`/repos/${connectedRepo.id}/insights`).then(r => r.json()).then(ins => {
        if (ins.insights) setRepoInsights(ins.insights);
      }).catch(() => {});

      setMessages(prev => [...prev, {
        sender: 'ai',
        text: `🔧 **Autonomous Doctor Intervention**: I successfully resolved **${issue.title}**.\n\n* **Action**: ${data.activity || 'Applied safe fix workflow.'}\n* **Score Impact**: Health restored.`,
        insight: 'Pruned redundant branch pointers and workspace clean. Ready for linear merges.',
        recommendation: 'Verify active checkout.'
      }]);

    } catch (err) {
      console.error('[Fix] Error:', err);
    } finally {
      setActiveFixingIssueId(null);
      setTimeout(() => setTimelineSteps([]), 2000);
    }
  };

  const handleConfirmFix = async () => {
    if (!connectedRepo || !approvalFixData) return;
    const issue = approvalFixData;
    setShowApprovalModal(false);
    setApprovalFixData(null);

    setTimelineSteps([
      { label: 'Problem Detected', status: 'success' },
      { label: 'Cause Found', status: 'success' },
      { label: 'Fix Applied', status: 'active' },
      { label: 'Repository Clean', status: 'pending' }
    ]);
    setActiveFixingIssueId(issue.id);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      const res = await apiFetch(`/repos/${connectedRepo.id}/confirm-fix`, {
        method: 'POST',
        body: JSON.stringify({ issueId: issue.id, action: issue.fixAction }),
      });
      const data = await res.json();

      setTimelineSteps([
        { label: 'Problem Detected', status: 'success' },
        { label: 'Cause Found', status: 'success' },
        { label: 'Fix Applied', status: 'success' },
        { label: 'Repository Clean', status: 'active' }
      ]);
      await new Promise(resolve => setTimeout(resolve, 600));
      await fetchHealthData(connectedRepo.id);

      apiFetch(`/repos/${connectedRepo.id}/insights`).then(r => r.json()).then(ins => {
        if (ins.insights) setRepoInsights(ins.insights);
      }).catch(() => {});

      setMessages(prev => [...prev, {
        sender: 'ai',
        text: `✅ **Dangerous Action Executed Safely**: I resolved **${issue.title}**.\n\n* **Action**: ${data.activity || 'Completed branch manipulation.'}\n* **Impact**: Verified history safety.`,
        insight: 'Branch references are now clean.',
        recommendation: 'Continue linear integration workflows.'
      }]);

    } catch (err) {
      console.error('[ConfirmFix] Error:', err);
    } finally {
      setActiveFixingIssueId(null);
      setTimeout(() => setTimelineSteps([]), 2000);
    }
  };

  const handleSimulateIssue = async (type) => {
    if (!connectedRepo) return;
    try {
      const res = await apiFetch(`/repos/${connectedRepo.id}/simulate-issue`, {
        method: 'POST',
        body: JSON.stringify({ type })
      });
      const data = await res.json();
      if (data.success) {
        await fetchHealthData(connectedRepo.id);
        
        apiFetch(`/repos/${connectedRepo.id}/insights`).then(r => r.json()).then(ins => {
          if (ins.insights) setRepoInsights(ins.insights);
        }).catch(() => {});

        let msgText = '';
        if (type === 'uncommitted') {
          msgText = '⚠️ Simulated **Uncommitted Changes** in local workspace. Pull and checkout operations will warn you of overwrites.';
        } else if (type === 'detached_head') {
          msgText = '🔴 Simulated **Detached HEAD State** (commit history will not update branch HEAD).';
        } else {
          msgText = '✅ Restored simulated workspace to clean, fully synchronized state.';
        }

        setMessages(prev => [...prev, {
          sender: 'ai',
          text: msgText,
          insight: 'Workspace status synchronized.'
        }]);
      }
    } catch (err) {
      console.error('[Simulate] Error:', err);
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
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch('/auth/me').then(r => r.json()).then(data => {
      if (data.user) {
        const u = { ...data.user, avatarInitial: data.user.name?.charAt(0)?.toUpperCase() || 'U' };
        setCurrentUser(u);
        localStorage.setItem('gitsense_user', JSON.stringify(u));
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
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  // ── Load connected repo on mount ──
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch('/repos/current').then(r => r.json()).then(data => {
      if (data.connected && data.repository) {
        setConnectedRepo(data.repository);
        // Fetch insights
        apiFetch(`/repos/${data.repository.id}/insights`).then(r => r.json()).then(ins => {
          if (ins.insights) setRepoInsights(ins.insights);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

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
      let aiMsgIndex = -1;
      setMessages(prev => {
        aiMsgIndex = prev.length;
        return [...prev, { sender: 'ai', text: '', isStreaming: true }];
      });
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
                if (parsed.token) {
                  setMessages(prev => {
                    const nextMsgs = [...prev];
                    if (nextMsgs[aiMsgIndex]) {
                      nextMsgs[aiMsgIndex] = {
                        ...nextMsgs[aiMsgIndex],
                        text: nextMsgs[aiMsgIndex].text + parsed.token
                      };
                    }
                    return nextMsgs;
                  });
                } else if (parsed.done) {
                  // Final metadata response
                  setMessages(prev => {
                    const nextMsgs = [...prev];
                    if (nextMsgs[aiMsgIndex]) {
                      nextMsgs[aiMsgIndex] = {
                        sender: 'ai',
                        text: parsed.response.text,
                        insight: parsed.response.insight,
                        recommendation: parsed.response.recommendation,
                        codeBlock: parsed.response.codeBlock,
                        commandBlock: parsed.response.commandBlock,
                        diff: parsed.response.diff,
                        conflictResolution: parsed.response.conflictResolution,
                        diagnosedIssue: parsed.response.diagnosedIssue,
                      };
                    }
                    return nextMsgs;
                  });
                  if (parsed.conversationId) {
                    setActiveConversationId(parsed.conversationId);
                  }
                  // Refresh history and health status if we finished
                  loadChatHistory();
                  if (connectedRepo) {
                    fetchHealthData(connectedRepo.id);
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
              onClick={() => { setActiveSection('chat'); window.location.hash = '#dashboard'; }}
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
              onClick={() => { setActiveSection('ide'); }}
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
                            // GitHub OAuth flow
                            apiFetch('/auth/github').then(r => r.json()).then(data => {
                              if (data.url) window.open(data.url, '_blank', 'width=600,height=700');
                              else alert('GitHub OAuth not configured. Add GITHUB_CLIENT_ID to backend/.env');
                            }).catch(() => alert('Backend not running. Start with: cd backend && npm run dev'));
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

          {activeSection === 'ide' ? (
            <IDEPanel
              connectedRepo={connectedRepo}
              apiFetch={apiFetch}
              onAskAI={(filename, content) => {
                setActiveSection('chat');
                setInputVal(`Analyze this file: ${filename}\n\n\`\`\`\n${content}\n\`\`\``);
                setTimeout(() => chatInputRef.current?.focus(), 50);
              }}
            />
          ) : (
            /* GIT ASSISTANT CHAT INTERFACE */
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
                        <CommandCard 
                          command={msg.commandBlock} 
                          idx={idx} 
                          copiedIndex={copiedIndex}
                          copyToClipboard={copyToClipboard}
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
                        />
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
                    className="flex-1 bg-transparent border-none outline-none px-3 py-1 text-sm text-slate-100 placeholder-slate-500 resize-none h-7 max-h-32 overflow-y-auto select-text"
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
        )}

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
                      fetchHealthData(connectedRepo.id);
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
              {/* Repository Health Score Circle Donut */}
              <div className="flex flex-col gap-3">
                <h4 className="font-heading font-bold text-xs tracking-wider text-slate-400 uppercase flex items-center gap-2">
                  <ShieldAlert size={13} className="text-[#7C5CFF]" /> Repository Health
                </h4>
                
                <div className="bg-slate-950/60 border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-4">
                  <div className="flex items-center gap-5">
                    {/* Circle Donut */}
                    <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke={
                          (repoHealth?.score ?? 100) >= 90 ? '#00E38C' :
                          (repoHealth?.score ?? 100) >= 70 ? '#FFB800' : '#EF4444'
                        } strokeWidth="3"
                          strokeDasharray={`${repoHealth?.score ?? 100} 100`}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <span className="absolute font-heading font-bold text-[10px] text-slate-100">{(repoHealth?.score ?? 100)}%</span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {(repoHealth?.score ?? 100) === 100 ? '✅ Clean Repository' : '⚠️ Requires Attention'}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">
                        {repoHealth?.issues?.length || 0} issues detected in current workspace.
                      </span>
                    </div>
                  </div>

                  {/* Issues List */}
                  {repoHealth?.issues && repoHealth.issues.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.05]">
                      {repoHealth.issues.map((issue) => (
                        <div key={issue.id} className="bg-slate-900/40 border border-white/[0.04] p-2.5 rounded-xl flex flex-col gap-2 text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">{issue.title}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              issue.severity === 'high' ? 'bg-rose-500/10 text-rose-400' :
                              issue.severity === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                              'bg-slate-850 text-slate-400'
                            }`}>
                              {issue.severity}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed">{issue.description}</p>
                          
                          <button
                            onClick={() => handleFixIssue(issue)}
                            disabled={activeFixingIssueId !== null}
                            className="w-full py-1.5 bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 hover:bg-[#7C5CFF]/25 text-[#F8FAFC] text-[10px] font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {activeFixingIssueId === issue.id ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <span>{issue.safeToFix ? 'Fix Issue' : 'Resolve Conflict'}</span>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Doctor Sandbox Controls */}
              <div className="flex flex-col gap-3">
                <h4 className="font-heading font-bold text-xs tracking-wider text-slate-500 uppercase flex items-center gap-2 text-left">
                  <Settings size={13} className="text-slate-500" /> Doctor Sandbox
                </h4>
                <div className="bg-slate-950/60 border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-2 text-left">
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-1">
                    Simulate workspace problems to test the Autonomous Doctor health diagnostics and mentoring.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => handleSimulateIssue('uncommitted')}
                      className="w-full py-1.5 bg-slate-900 border border-white/[0.05] hover:border-[#7C5CFF]/40 text-slate-300 text-[10px] font-semibold rounded-lg transition-all cursor-pointer text-left px-3 flex justify-between items-center"
                    >
                      <span>Simulate Uncommitted Changes</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    </button>
                    <button
                      onClick={() => handleSimulateIssue('detached_head')}
                      className="w-full py-1.5 bg-slate-900 border border-white/[0.05] hover:border-[#7C5CFF]/40 text-slate-300 text-[10px] font-semibold rounded-lg transition-all cursor-pointer text-left px-3 flex justify-between items-center"
                    >
                      <span>Simulate Detached HEAD</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    </button>
                    <button
                      onClick={() => handleSimulateIssue('clean')}
                      className="w-full py-1.5 bg-slate-900 border border-white/[0.05] hover:border-[#00E38C]/40 text-slate-300 text-[10px] font-semibold rounded-lg transition-all cursor-pointer text-left px-3 flex justify-between items-center"
                    >
                      <span>Restore Clean Repository</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00E38C]" />
                    </button>
                  </div>
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
              <div className="bg-slate-950 border border-rose-500/30 rounded-3xl p-6 w-full max-w-md flex flex-col gap-5 text-left shadow-2xl shadow-rose-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-heading text-slate-100">Confirm Git Operation</h3>
                    <p className="text-[10px] text-slate-500 font-mono tracking-wide uppercase mt-0.5">Dangerous Action Approval Required</p>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-white/[0.04] p-4 rounded-2xl flex flex-col gap-2 text-xs">
                  <span className="font-semibold text-slate-300">Operation:</span>
                  <pre className="p-2.5 bg-slate-950 rounded-xl text-rose-400 font-mono text-xs border border-rose-500/10 overflow-x-auto whitespace-pre-wrap">
                    {approvalFixData.command}
                  </pre>
                  
                  <span className="font-semibold text-slate-300 mt-2">Potential Impact:</span>
                  <p className="text-slate-400 leading-relaxed">
                    {approvalFixData.fixAction === 'resolve_conflict' 
                      ? 'This will merge code blocks from the source branch into your target branch. It may rewrite local changes and create automatic resolution markers if not fully synced.'
                      : 'This will checkout a branch and abandon any un-named commits made while in detached HEAD state unless they are cherry-picked first.'}
                  </p>
                </div>

                <p className="text-[11px] text-rose-400/80 leading-relaxed bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl">
                  ⚠️ <strong>Caution:</strong> Antigravity will protect your repository by default. Force pushing or rebasing shared branches is not recommended.
                </p>

                <div className="flex gap-3 border-t border-white/[0.05] pt-4">
                  <button
                    onClick={() => setShowApprovalModal(false)}
                    className="flex-1 py-2.5 bg-slate-900 border border-white/[0.06] hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer text-center"
                  >
                    Cancel / Abort
                  </button>
                  <button
                    onClick={handleConfirmFix}
                    className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer text-center shadow-lg shadow-rose-950/30"
                  >
                    Confirm & Execute
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
function CommandCard({ command, idx, copiedIndex, copyToClipboard }) {
  const info = parseGitCommand(command);
  const [isHovered, setIsHovered] = useState(false);

  if (!info) {
    return (
      <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.08] bg-[#060913]">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-white/[0.06] text-[10px] font-mono text-slate-400">
          <span>Terminal</span>
          <button onClick={() => copyToClipboard(command, `cmd-${idx}`)} className="hover:text-white cursor-pointer flex items-center gap-1">
            {copiedIndex === `cmd-${idx}` ? 'Copied!' : 'Copy'}
          </button>
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
function ConflictResolverCard({ conflict, idx, connectedRepo, setMessages, apiFetch }) {
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
        await apiFetch(`/repos/${connectedRepo.id}/fix`, {
          method: 'POST',
          body: JSON.stringify({ issueId: `conflict-pr-resolved`, action: 'resolve_conflict' })
        });
      } catch (err) {}
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
function DiagnosedIssueCard({ issue, idx, copiedIndex, copyToClipboard }) {
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
              <button
                onClick={() => copyToClipboard(issue.command, `issue-cmd-${idx}`)}
                className="hover:text-white cursor-pointer flex items-center gap-1"
              >
                {copiedIndex === `issue-cmd-${idx}` ? 'Copied!' : 'Copy'}
              </button>
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
