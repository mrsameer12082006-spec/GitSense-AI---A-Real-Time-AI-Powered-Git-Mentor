import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, ChevronDown, LogOut, Settings, User, Info, FileText, Sun, Moon, 
  GitBranch, Send, Paperclip, Mic, Activity, Users, CheckCircle2, AlertTriangle, 
  RefreshCw, Plus, HelpCircle, Play, ArrowRight, Lock, GitCommit, GitPullRequest, 
  Sparkles, Terminal, Check, Copy, X, ShieldAlert, Cpu, Eye, MessageSquare, Database
} from 'lucide-react';
import GitGraph from '../components/GitGraph';

// Mock chat history conversations
const MOCK_CONVERSATIONS = {
  conv1: {
    id: 'conv1',
    title: 'Resolving merge conflict in auth.js',
    category: 'Today',
    repo: 'gitsense-dashboard',
    branch: 'feature/login',
    messages: [
      { sender: 'user', text: 'Why is my branch conflicting with main on config.js?' },
      { 
        sender: 'ai', 
        text: 'I detected a conflict in `config.js` between your local branch `feature/login` and `origin/main` at line 14. Here is the conflict details:',
        isConflictDetail: true,
        diff: `<<<<<<< HEAD
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-local-only';
const tokenTimeout = '24h';
=======
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET must be defined in environment");
}
const tokenTimeout = '12h';
>>>>>>> origin/main`,
        insight: 'Origin/main added safety checks to crash early if JWT_SECRET is missing, and reduced timeout to 12h. Your branch added a fallback default and kept 24h.',
        recommendation: 'Use the safety checks from main, but ensure your local development environment has a .env file configured to avoid crashes during dev.'
      },
      { sender: 'user', text: 'How do I resolve this safely?' },
      {
        sender: 'ai',
        text: 'To resolve this safely, follow these steps in your terminal:',
        commandBlock: `git checkout feature/login
git fetch origin
git merge origin/main
# Open config.js and resolve conflicts manually
# Then run:
git add config.js
git commit -m "chore: resolve conflicts with main in config.js"`
      }
    ]
  },
  conv2: {
    id: 'conv2',
    title: 'Explaining CORS whitelist changes',
    category: 'Previous 7 Days',
    repo: 'gitsense-core',
    branch: 'main',
    messages: [
      { sender: 'user', text: 'Explain the recent CORS whitelist commit' },
      {
        sender: 'ai',
        text: 'The last commit `fb7299a` on `main` updated the CORS configuration. Here is a breakdown of what changed:',
        codeBlock: `// config/cors.js
const whitelist = [
  'https://gitsense.ai',
  'https://app.gitsense.ai',
  // Added staging environment to whitelist
  'https://staging.gitsense.ai'
];

if (process.env.NODE_ENV === 'development') {
  whitelist.push('http://localhost:5173');
}`,
        insight: 'This commit extends the whitelist to support staging verification. It prevents CORS blocking on test environments.'
      }
    ]
  },
  conv3: {
    id: 'conv3',
    title: 'Reviewing express server base',
    category: 'Previous 30 Days',
    repo: 'gitsense-cli',
    branch: 'main',
    messages: [
      { sender: 'user', text: 'Is there any issue with our express initialization?' },
      {
        sender: 'ai',
        text: 'After scanning `server.js`, I found 1 minor architectural recommendation:',
        insight: 'The database connection is established synchronously during server start. If the database is slow, client requests will queue up.',
        recommendation: 'Initialize the database before starting the Express server listener, wrapping it in an async IIFE.',
        codeBlock: `const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
};
startServer();`
      }
    ]
  }
};

// Suggested prompts
const SUGGESTED_PROMPTS = [
  { text: 'Can I merge this branch?', detail: 'Checks merge readiness and safety.' },
  { text: 'Explain this code change', detail: 'Explains diff of last commits.' },
  { text: 'Show diff with main', detail: 'Shows direct comparisons of file state.' },
  { text: 'Why is CI failing?', detail: 'Inspects failing pipeline logs.' }
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('ai-assistant'); // ai-assistant, git-mentor, visualizer
  const [selectedRepo, setSelectedRepo] = useState('gitsense-dashboard');
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false);
  const [isAvatarDropdownOpen, setIsAvatarDropdownOpen] = useState(false);
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('');
  const [chatHistory, setChatHistory] = useState(MOCK_CONVERSATIONS);
  const [selectedConvId, setSelectedConvId] = useState(null); // null means empty state / active draft
  
  // Current active conversation messages
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  
  // Custom states
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioWave, setAudioWave] = useState([10, 15, 8, 24, 18, 12, 30, 20, 14, 25, 9, 16]);
  const [attachedFile, setAttachedFile] = useState(null);
  
  // Visualizer page state
  const [graphState, setGraphState] = useState('normal'); // normal, diverged, conflict
  const [selectedNodeDetails, setSelectedNodeDetails] = useState(null);

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

  // Handle suggested prompt click
  const handleSuggestedPrompt = (promptText) => {
    submitUserMessage(promptText);
  };

  const submitUserMessage = (text) => {
    if (!text.trim()) return;

    // Create user message
    const userMsg = { sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    setIsAiTyping(true);

    // Simulate AI response stream
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
        aiMsg.text = `Understood. I have scanned the repository files in \`${selectedRepo}\` on branch \`${selectedRepo === 'gitsense-dashboard' ? 'feature/login' : 'main'}\` and found no immediate blockages. What specific aspect of your git state or workspace would you like me to inspect?`;
      }

      setMessages(prev => [...prev, aiMsg]);
      setIsAiTyping(false);

      // Add to conversation history if it's a new draft
      if (!selectedConvId) {
        const newId = 'conv_new_' + Date.now();
        const newConv = {
          id: newId,
          title: text.length > 32 ? text.substring(0, 32) + '...' : text,
          category: 'Today',
          repo: selectedRepo,
          branch: selectedRepo === 'gitsense-dashboard' ? 'feature/login' : 'main',
          messages: [...messages, userMsg, aiMsg]
        };
        setChatHistory(prev => ({
          [newId]: newConv,
          ...prev
        }));
        setSelectedConvId(newId);
      }
    }, 1500);
  };

  // Copy helper
  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Load conversation from history
  const loadConversation = (convId) => {
    setSelectedConvId(convId);
    setMessages(chatHistory[convId].messages);
    setActiveTab('ai-assistant');
  };

  const startNewChat = () => {
    setSelectedConvId(null);
    setMessages([]);
  };

  // Filter history based on search
  const filteredHistory = Object.values(chatHistory).filter(conv => 
    conv.title.toLowerCase().includes(searchHistoryQuery.toLowerCase()) ||
    conv.repo.toLowerCase().includes(searchHistoryQuery.toLowerCase())
  );

  // Group history
  const historyGroups = {
    'Today': filteredHistory.filter(c => c.category === 'Today'),
    'Previous 7 Days': filteredHistory.filter(c => c.category === 'Previous 7 Days'),
    'Previous 30 Days': filteredHistory.filter(c => c.category === 'Previous 30 Days'),
  };

  // Repository data selector updates
  const repos = {
    'gitsense-dashboard': {
      branch: 'feature/login',
      ahead: '2 commits ahead',
      health: '94% safe',
      commits: '482',
      prs: '3',
      issues: '12',
      contributors: '8',
      latestCommits: [
        { hash: '92cd99b', message: 'fix: login router logic', author: 'Manik', time: '2m ago' },
        { hash: 'a12bc8f', message: 'feat: auth middleware base', author: 'Ayesh', time: '5m ago' },
        { hash: '7c3b28d', message: 'docs: update readme guidelines', author: 'Sameer', time: '15m ago' }
      ],
      activePrs: [
        { id: '#12', title: 'Add dashboard layout routing', status: 'In Review', author: 'Sameer' },
        { id: '#11', title: 'Setup auth token persistence', status: 'Approved', author: 'Manik' }
      ]
    },
    'gitsense-core': {
      branch: 'main',
      ahead: '0 ahead (Synced)',
      health: '100% stable',
      commits: '1,208',
      prs: '1',
      issues: '4',
      contributors: '5',
      latestCommits: [
        { hash: 'e39da01', message: 'init: setup express server', author: 'Sameer', time: '1h ago' },
        { hash: 'fb7299a', message: 'feat: add database schema', author: 'Kartik', time: '2h ago' }
      ],
      activePrs: [
        { id: '#8', title: 'Refactor client socket logic', status: 'Changes Requested', author: 'Ayesh' }
      ]
    },
    'gitsense-cli': {
      branch: 'main',
      ahead: '1 commit behind',
      health: '88% review needed',
      commits: '94',
      prs: '0',
      issues: '2',
      contributors: '3',
      latestCommits: [
        { hash: 'c90b021', message: 'feat: add rate limiting', author: 'Origin', time: '10m ago' },
        { hash: 'd71a990', message: 'fix: cors whitelist update', author: 'Origin', time: '25m ago' }
      ],
      activePrs: []
    }
  };

  const activeRepoData = repos[selectedRepo] || repos['gitsense-dashboard'];

  // Handle keypress inside chat input
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      submitUserMessage(inputVal);
    }
  };

  // Simulated Voice Input Action
  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setInputVal('Can I merge this branch?');
    } else {
      setIsRecording(true);
    }
  };

  // Simulating File Upload
  const handleFileAttach = () => {
    if (attachedFile) {
      setAttachedFile(null);
    } else {
      setAttachedFile({ name: 'auth.js', size: '2.4 KB' });
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0B1020] text-[#F8FAFC] flex overflow-hidden font-sans relative">
      
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 glow-blur glow-purple w-[400px] h-[400px] opacity-15 pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 glow-blur glow-cyan w-[400px] h-[400px] opacity-15 pointer-events-none" />

      {/* ── LEFT SIDEBAR (Fixed: 260px) ── */}
      <aside className="w-[260px] border-r border-white/[0.06] bg-[#060913]/90 flex flex-col z-20 select-none flex-shrink-0">
        
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
            onClick={startNewChat}
            className="p-1.5 rounded-lg bg-slate-900 border border-white/[0.08] hover:border-[#7C5CFF]/50 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Start New Chat"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <div className="p-3 flex flex-col gap-1">
          <button
            onClick={() => setActiveTab('ai-assistant')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'ai-assistant'
                ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#F8FAFC]'
                : 'border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Sparkles size={16} className={activeTab === 'ai-assistant' ? 'text-[#7C5CFF]' : 'text-slate-400'} />
            <span>AI Assistant</span>
          </button>

          <button
            onClick={() => setActiveTab('git-mentor')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'git-mentor'
                ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#F8FAFC]'
                : 'border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Cpu size={16} className={activeTab === 'git-mentor' ? 'text-[#7C5CFF]' : 'text-slate-400'} />
            <span>Git Mentor</span>
          </button>

          <button
            onClick={() => setActiveTab('visualizer')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'visualizer'
                ? 'bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#F8FAFC]'
                : 'border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Activity size={16} className={activeTab === 'visualizer' ? 'text-[#7C5CFF]' : 'text-slate-400'} />
            <span>Visualization Graph</span>
          </button>
        </div>

        {/* Search Chat History */}
        <div className="px-3 py-2">
          <div className="relative">
            <span className="absolute left-2.5 top-2 text-slate-500">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchHistoryQuery}
              onChange={(e) => setSearchHistoryQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-white/[0.06] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#7C5CFF]/50 focus:ring-1 focus:ring-[#7C5CFF]/50 transition-all"
            />
          </div>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-4 custom-scrollbar">
          {Object.entries(historyGroups).map(([groupTitle, groupItems]) => {
            if (groupItems.length === 0) return null;
            return (
              <div key={groupTitle} className="flex flex-col gap-1">
                <span className="text-[10px] font-heading font-bold tracking-wider text-slate-500 uppercase px-2 mb-1">
                  {groupTitle}
                </span>
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadConversation(item.id)}
                    className={`w-full text-left px-2 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer truncate flex items-center gap-2 group ${
                      selectedConvId === item.id
                        ? 'bg-slate-800/80 text-white border-l-2 border-[#7C5CFF]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 border-l-2 border-transparent'
                    }`}
                  >
                    <MessageSquare size={12} className="opacity-60 flex-shrink-0 group-hover:text-[#00D4FF]" />
                    <span className="truncate">{item.title}</span>
                  </button>
                ))}
              </div>
            );
          })}

          {filteredHistory.length === 0 && (
            <div className="text-center py-6 text-slate-600 text-xs">
              No conversations found.
            </div>
          )}
        </div>

        {/* Sidebar Footer Area */}
        <div className="p-3 border-t border-white/[0.06] bg-slate-950/40 flex flex-col gap-2">
          <button 
            onClick={() => alert("Loading all conversations is currently in sandbox preview.")}
            className="w-full text-center py-1.5 rounded-lg border border-white/[0.06] bg-slate-900 hover:bg-slate-800 text-[11px] font-medium text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            View All History
          </button>
        </div>

      </aside>

      {/* ── MAIN WORKSPACE CONTAINER ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── TOP HEADER ── */}
        <header className="h-[60px] border-b border-white/[0.06] bg-[#060913]/70 backdrop-blur-md flex items-center justify-between px-6 z-10 flex-shrink-0 select-none">
          
          {/* Left: Repository Connection Info */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 transition-all cursor-pointer"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#00E38C] animate-pulse" />
                <span className="font-mono text-[11px]">{selectedRepo}</span>
                <ChevronDown size={12} className={`opacity-60 transition-transform ${isRepoDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Repo Selector Dropdown */}
              <AnimatePresence>
                {isRepoDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsRepoDropdownOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute left-0 mt-2 w-[220px] bg-slate-950/95 border border-white/[0.1] rounded-xl shadow-2xl backdrop-blur-xl z-50 p-1"
                    >
                      {Object.keys(repos).map((repoName) => (
                        <button
                          key={repoName}
                          onClick={() => {
                            setSelectedRepo(repoName);
                            setIsRepoDropdownOpen(false);
                            startNewChat();
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                            selectedRepo === repoName 
                              ? 'bg-[#7C5CFF]/15 text-[#7C5CFF]' 
                              : 'text-slate-400 hover:text-white hover:bg-slate-900'
                          }`}
                        >
                          <span className="font-mono">{repoName}</span>
                          {selectedRepo === repoName && <CheckCircle2 size={12} />}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <span className="text-[10px] text-slate-500 font-mono hidden md:inline truncate max-w-[180px]">
              github.com/manikchauhan/{selectedRepo}
            </span>
          </div>

          {/* Center: Repository status pills */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-950/60 border border-white/[0.04] p-1.5 rounded-full">
            <div className="flex items-center gap-1 bg-slate-900 px-3 py-1 rounded-full text-[11px] font-medium border border-white/[0.04]">
              <GitBranch size={11} className="text-[#7C5CFF]" />
              <span className="text-slate-300 font-mono">{activeRepoData.branch}</span>
            </div>
            
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-slate-400">
              <RefreshCw size={10} className="animate-spin-slow text-slate-500" />
              <span className="font-mono text-[10px]">{activeRepoData.ahead}</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-[#00E38C]/10 border border-[#00E38C]/20 text-[#00E38C]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00E38C]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{activeRepoData.health}</span>
            </div>
          </div>

          {/* Right: User Avatar & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsAvatarDropdownOpen(!isAvatarDropdownOpen)}
              className="w-8 h-8 rounded-full border border-white/[0.08] bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] flex items-center justify-center text-white text-xs font-heading font-bold hover:scale-105 transition-all cursor-pointer shadow-[0_0_10px_rgba(124,92,255,0.2)]"
            >
              M
            </button>

            {/* Profile Dropdown */}
            <AnimatePresence>
              {isAvatarDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAvatarDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-[220px] bg-slate-950/95 border border-white/[0.08] rounded-xl shadow-2xl backdrop-blur-xl z-50 p-2 overflow-hidden"
                  >
                    {/* Header info */}
                    <div className="px-3 py-2.5 border-b border-white/[0.06] mb-1 flex flex-col">
                      <span className="text-xs font-semibold text-slate-100">Manik Chauhan</span>
                      <span className="text-[10px] text-slate-500 font-mono">manik@gitsense.ai</span>
                    </div>

                    {[
                      { icon: <User size={13} />, label: 'Profile', onClick: () => alert('Profile modal (Preview)') },
                      { icon: <Settings size={13} />, label: 'Settings', onClick: () => alert('Settings menu (Preview)') },
                      { icon: <Info size={13} />, label: 'About Us', onClick: () => alert('GitSense AI v1.0.4. Built for developer productivity.') },
                      { icon: <FileText size={13} />, label: 'Terms & Conditions', onClick: () => alert('GitSense Sandbox Agreement.') },
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
                        <div className="w-7 h-4 rounded-full bg-[#7C5CFF]/30 p-0.5 flex items-center justify-end cursor-pointer">
                          <div className="w-3 h-3 rounded-full bg-[#7C5CFF]" />
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

          {/* TAB 1: AI ASSISTANT CHAT INTERFACE */}
          {activeTab === 'ai-assistant' && (
            <div className="flex-1 flex flex-col min-w-0 relative bg-[#0B1020]">
              
              {/* Chat Messages List */}
              <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 custom-scrollbar">
                
                {messages.length === 0 ? (
                  /* Empty state view */
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
                    
                    <h3 className="text-2xl font-bold font-heading text-slate-100 mb-2">
                      Ask me anything about your repository.
                    </h3>
                    <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                      I can help explain code patterns, verify merge readiness, track pipeline issues, and suggest terminal commands.
                    </p>

                    {/* Suggested prompts cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full text-left">
                      {SUGGESTED_PROMPTS.map((prompt, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSuggestedPrompt(prompt.text)}
                          className="gitsense-card p-4 hover:border-[#7C5CFF]/50 flex flex-col text-left transition-all cursor-pointer relative group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">
                              {prompt.text}
                            </span>
                            <ArrowRight size={12} className="text-slate-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                          </div>
                          <span className="text-[11px] text-slate-500 line-clamp-1">
                            {prompt.detail}
                          </span>
                        </button>
                      ))}
                    </div>
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
                                  className="hover:text-white transition-colors"
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
                                  className="hover:text-white transition-colors"
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
                                  className="hover:text-white transition-colors"
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

                          {/* Render Conflict Detail Overlay if exists */}
                          {msg.isConflictDetail && (
                            <div className="mt-3 p-3 bg-rose-500/5 border border-rose-500/20 rounded-xl flex flex-col gap-2">
                              <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                                <AlertTriangle size={13} /> Conflict detected in config.js
                              </span>
                              <pre className="p-2.5 bg-slate-950 border border-white/[0.05] rounded-lg text-[10px] font-mono text-slate-400 overflow-x-auto">
                                {msg.diff}
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
                            M
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
                      placeholder={isRecording ? 'Listening for prompt...' : 'Ask about branch health, git history, or conflict resolution...'}
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isRecording}
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
                        disabled={!inputVal.trim() && !isRecording}
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

          {/* TAB 2: GIT MENTOR SCREEN */}
          {activeTab === 'git-mentor' && (
            <div className="flex-1 overflow-y-auto px-6 py-6 bg-[#0B1020] custom-scrollbar">
              <div className="max-w-[900px] mx-auto flex flex-col gap-6">
                
                {/* Mentor Header */}
                <div className="flex flex-col gap-2">
                  <div className="badge self-start bg-[#7C5CFF]/10 border-[#7C5CFF]/30 text-[#7C5CFF] flex items-center gap-1.5">
                    <Cpu size={12} /> REAL-TIME WORKFLOW MENTOR
                  </div>
                  <h3 className="text-2xl font-bold font-heading text-slate-100">
                    Git Workflow Best Practices
                  </h3>
                  <p className="text-slate-400 text-sm">
                    Select a workflow scenario to see GitSense AI recommendations and safety audits.
                  </p>
                </div>

                {/* Grid of helper boxes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                  
                  {/* Card: Branch Divergence */}
                  <div className="gitsense-card p-6 flex flex-col gap-4 text-left">
                    <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
                      <GitBranch size={16} className="text-[#00D4FF]" />
                      <span className="font-heading font-bold text-sm text-slate-200">Rebasing Feature Branches</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Rebasing keeps history linear, but rewriting shared commits will corrupt history. Follow this workflow for local branches:
                    </p>
                    <div className="bg-slate-950 border border-white/[0.05] p-3 rounded-lg font-mono text-[10px] text-[#00D4FF]">
                      <span className="text-slate-500"># Fetch latest master</span><br/>
                      git checkout main<br/>
                      git pull origin main<br/>
                      <span className="text-slate-500"># Rebase your changes</span><br/>
                      git checkout feature/login<br/>
                      git rebase main
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-white/[0.03]">
                      <span>Safety Rating:</span>
                      <span className="text-[#00E38C] font-semibold">100% Safe (Local only)</span>
                    </div>
                  </div>

                  {/* Card: Resolving Head Divergences */}
                  <div className="gitsense-card p-6 flex flex-col gap-4 text-left">
                    <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
                      <AlertTriangle size={16} className="text-rose-400" />
                      <span className="font-heading font-bold text-sm text-slate-200">Handling Remote Conflicts</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      When both branches make edits on identical code lines, standard pulls fail. Merge via a temporary merge commit:
                    </p>
                    <div className="bg-slate-950 border border-white/[0.05] p-3 rounded-lg font-mono text-[10px] text-rose-400">
                      <span className="text-slate-500"># Pull remote main into main</span><br/>
                      git checkout main<br/>
                      git pull origin main<br/>
                      <span className="text-slate-500"># Checkout and merge main</span><br/>
                      git checkout feature/login<br/>
                      git merge main
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-white/[0.03]">
                      <span>Safety Rating:</span>
                      <span className="text-rose-400 font-semibold">Conflict Risk Present</span>
                    </div>
                  </div>

                </div>

                {/* Section: Merge Conflict Interactive Preview Simulation */}
                <div className="gitsense-card p-6 text-left flex flex-col gap-4 mt-2">
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={16} className="text-[#7C5CFF]" />
                      <span className="font-heading font-bold text-sm text-slate-200">Interactive Conflict Sandbox</span>
                    </div>
                    <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                      Simulation Active
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Below is an active merge conflict detected on `config/db.js`. GitSense recommends accepting the incoming schema verification logic to prevent startup failures.
                  </p>

                  <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-slate-950">
                    {/* Header */}
                    <div className="flex items-center justify-between bg-slate-900 px-4 py-2 border-b border-white/[0.06] text-xs font-mono text-slate-400">
                      <span>config/db.js</span>
                      <span className="text-[10px] text-slate-500">2 conflicts pending</span>
                    </div>

                    {/* Conflict body */}
                    <div className="p-4 font-mono text-xs flex flex-col gap-1.5 leading-relaxed bg-[#030712]">
                      <div className="bg-blue-500/10 border-l-2 border-blue-500 p-2 text-slate-400">
                        <div className="text-[9px] font-bold text-blue-400 mb-1">CURRENT CHANGE (YOUR BRANCH)</div>
                        <span>const dbOptions = &#123; useNewUrlParser: true, useUnifiedTopology: true &#125;;</span>
                      </div>
                      <div className="text-slate-600 text-center py-1">=======</div>
                      <div className="bg-emerald-500/10 border-l-2 border-emerald-500 p-2 text-slate-400">
                        <div className="text-[9px] font-bold text-[#00E38C] mb-1">INCOMING CHANGE (ORIGIN/MAIN)</div>
                        <span>const dbOptions = &#123; useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 5000 &#125;;</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => alert("Simulated: Accepted Current Change")}
                      className="px-4 py-2 bg-slate-900 border border-white/[0.08] hover:border-slate-500 rounded-lg text-xs font-medium text-slate-200 transition-all cursor-pointer"
                    >
                      Accept Current (Local)
                    </button>
                    <button
                      onClick={() => alert("Simulated: Accepted Incoming Change. Conflict resolved successfully.")}
                      className="px-4 py-2 bg-[#7C5CFF] hover:bg-[#8C6DFF] rounded-lg text-xs font-semibold text-white transition-all cursor-pointer"
                    >
                      Accept Incoming (Recommended)
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 3: VISUALIZATION GRAPH */}
          {activeTab === 'visualizer' && (
            <div className="flex-1 overflow-y-auto px-6 py-6 bg-[#0B1020] custom-scrollbar flex flex-col gap-6">
              
              {/* Visualizer header controls */}
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
                            <FileText size={10} className="text-slate-500" />
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
          )}

        </div>

      </div>

      {/* ── RIGHT SIDEBAR (Fixed: 300px) ── */}
      <aside className="w-[300px] border-l border-white/[0.06] bg-[#060913]/90 p-4 flex flex-col gap-6 overflow-y-auto z-20 select-none flex-shrink-0 hidden xl:flex">
        
        {/* Repo Summary Card */}
        <div className="flex flex-col gap-3">
          <h4 className="font-heading font-bold text-xs tracking-wider text-slate-400 uppercase flex items-center gap-2">
            <Database size={13} className="text-[#7C5CFF]" /> Repository Summary
          </h4>

          <div className="bg-slate-950/60 border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-500 font-semibold">Commits</span>
                <span className="font-heading font-bold text-lg text-slate-100">{activeRepoData.commits}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-500 font-semibold">Open PRs</span>
                <span className="font-heading font-bold text-lg text-[#00D4FF]">{activeRepoData.prs}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-500 font-semibold">Issues</span>
                <span className="font-heading font-bold text-lg text-rose-400">{activeRepoData.issues}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-500 font-semibold">Contributors</span>
                <span className="font-heading font-bold text-lg text-slate-100">{activeRepoData.contributors}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.05] flex items-center justify-between text-xs">
              <span className="text-slate-500">Security Scans:</span>
              <span className="text-[#00E38C] font-semibold flex items-center gap-1">
                <CheckCircle2 size={12} /> Clean
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
                {activeRepoData.latestCommits.map((commit, idx) => (
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
            {activeRepoData.activePrs.length > 0 && (
              <div className="flex flex-col gap-2.5 mt-2">
                <span className="text-[10px] font-heading font-bold text-slate-500 uppercase tracking-wider">
                  Active Pull Requests
                </span>
                <div className="flex flex-col gap-2">
                  {activeRepoData.activePrs.map((pr, idx) => (
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
            <div className="flex flex-col gap-2.5 mt-2">
              <span className="text-[10px] font-heading font-bold text-slate-500 uppercase tracking-wider">
                CI/CD Pipelines
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-lg border border-white/[0.03] text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#00E38C]" />
                    <span className="font-semibold text-slate-300">Build #10843</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Passed</span>
                </div>
                <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-lg border border-white/[0.03] text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-400" />
                    <span className="font-semibold text-slate-300">Test Suite #10842</span>
                  </div>
                  <span className="text-[10px] text-rose-400 font-semibold">Failed</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </aside>

    </div>
  );
}
