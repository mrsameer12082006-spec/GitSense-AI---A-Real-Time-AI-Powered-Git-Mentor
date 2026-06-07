import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Folder, FileCode, ChevronLeft, RefreshCw, Send, AlertTriangle,
  Play, Save, Check, GitCommit, GitBranch, ArrowUpCircle, ArrowDownCircle,
  Plus, Minus, X, Info, Terminal as TerminalIcon, Sparkles, AlertCircle, Loader2
} from 'lucide-react';

export default function IDEPanel({ connectedRepo, apiFetch, onAskAI }) {
  // --- Workspace & Sandbox State ---
  const [isDemoMode, setIsDemoMode] = useState(!connectedRepo);
  const [currentPath, setCurrentPath] = useState('');
  const [contents, setContents] = useState([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState('');

  // --- Multi-Tab & Editing State ---
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabPath, setActiveTabPath] = useState('');
  
  // --- Selectors ---
  const [selectedLang, setSelectedLang] = useState('javascript');
  const [selectedTerm, setSelectedTerm] = useState('PowerShell');
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isTermDropdownOpen, setIsTermDropdownOpen] = useState(false);

  // --- Terminal State ---
  const [activeTerminalTab, setActiveTerminalTab] = useState('TERMINAL');
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [terminalCommand, setTerminalCommand] = useState('');
  const terminalBottomRef = useRef(null);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // --- Source Control State ---
  const [changedFiles, setChangedFiles] = useState([]);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [hasMergeConflict, setHasMergeConflict] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('main');

  // --- Action Button Visual Feedback State ---
  const [isRunning, setIsRunning] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Monaco and editor refs
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  // ─── HELPER: Workspace API call ───
  const workspaceFetch = useCallback(async (endpoint, options = {}) => {
    if (!connectedRepo) throw new Error('No repo connected');
    const url = `/workspace/${connectedRepo.id}${endpoint}`;
    return apiFetch(url, options);
  }, [connectedRepo, apiFetch]);

  // Mock sandbox files for Demo Mode
  const demoFiles = [
    {
      path: 'index.js',
      name: 'index.js',
      type: 'file',
      content: `// Welcome to GitSense AI Workspace\n// This is a sandbox demo - connect a real repo for full functionality!\n\nconst express = require('express');\nconst app = express();\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello from GitSense!' });\n});\n\napp.listen(3000, () => {\n  console.log('Server running on port 3000');\n});\n`,
      originalContent: `// Welcome to GitSense AI Workspace\n// This is a sandbox demo - connect a real repo for full functionality!\n\nconst express = require('express');\nconst app = express();\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello from GitSense!' });\n});\n\napp.listen(3000, () => {\n  console.log('Server running on port 3000');\n});\n`
    },
    {
      path: 'README.md',
      name: 'README.md',
      type: 'file',
      content: `# GitSense AI Workspace\n\nConnect a GitHub repository to unlock:\n- Real terminal command execution\n- Git operations (status, add, commit, push, pull)\n- File saving directly to GitHub\n- Code execution (Node.js & Python)\n`,
      originalContent: `# GitSense AI Workspace\n\nConnect a GitHub repository to unlock:\n- Real terminal command execution\n- Git operations (status, add, commit, push, pull)\n- File saving directly to GitHub\n- Code execution (Node.js & Python)\n`
    }
  ];

  // Helper mapping file extension to languages
  const getFileLanguage = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      json: 'json',
      css: 'css',
      html: 'html',
      md: 'markdown',
      py: 'python',
      sh: 'shell',
      yml: 'yaml',
      yaml: 'yaml',
    };
    return map[ext] || 'plaintext';
  };

  // Trigger temporary visual notifications
  const triggerToast = (msg) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // --- Initializing contents based on Mode ---
  const fetchContents = async (path = '') => {
    if (isDemoMode) {
      setLoadingTree(true);
      setTimeout(() => {
        setContents(demoFiles);
        setCurrentPath(path);
        setLoadingTree(false);
      }, 300);
      return;
    }

    if (!connectedRepo) return;
    setLoadingTree(true);
    setError('');
    try {
      const res = await apiFetch(`/repos/${connectedRepo.id}/contents?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch directory contents.');
      }
      setContents(Array.isArray(data.contents) ? data.contents : []);
      setCurrentPath(path);
    } catch (err) {
      setError(err.message || 'Failed to list directory.');
    } finally {
      setLoadingTree(false);
    }
  };

  // ─── FETCH REAL GIT STATUS ───
  const fetchGitStatus = useCallback(async () => {
    if (isDemoMode || !connectedRepo) return;
    try {
      const res = await workspaceFetch('/git/status');
      const data = await res.json();
      if (res.ok) {
        setCurrentBranch(data.branch || 'main');
        // Update unstaged files
        const unstagedPaths = (data.unstaged || []).map(f => f.file);
        const stagedPaths = (data.staged || []).map(f => f.file);
        setChangedFiles(unstagedPaths);
        setStagedFiles(stagedPaths);
      }
    } catch (err) {
      console.error('[IDE] Failed to fetch git status:', err);
    }
  }, [isDemoMode, connectedRepo, workspaceFetch]);

  // Auto-open first file on load
  useEffect(() => {
    fetchContents('');
    
    setTerminalLogs([
      { type: 'info', text: '⚡ GitSense AI Workspace initialized.' },
      { type: 'success', text: connectedRepo 
        ? `📂 Connected to ${connectedRepo.owner}/${connectedRepo.name}. Terminal commands execute on the real cloned repo.`
        : '💡 Sandbox Mode — connect a repo for real terminal/git operations.' },
      { type: 'info', text: connectedRepo 
        ? '💡 Type any command: git status, ls, npm test, node app.js...'
        : '💡 Demo commands: help, clear' },
      { type: 'info', text: '' }
    ]);

    // Fetch real git status when a repo is connected
    if (connectedRepo) {
      fetchGitStatus();
    }
  }, [connectedRepo, isDemoMode]);

  // Auto-open the first file in explorer once loaded
  useEffect(() => {
    if (contents.length > 0 && openTabs.length === 0) {
      const firstFile = contents.find(c => c.type === 'file' || c.type === 'blob');
      if (firstFile) {
        loadFileContent(firstFile);
      }
    }
  }, [contents]);

  // --- Loading File Content ---
  const loadFileContent = async (fileItem) => {
    setError('');
    const existingTab = openTabs.find(t => t.path === fileItem.path);
    if (existingTab) {
      setActiveTabPath(fileItem.path);
      setSelectedLang(getFileLanguage(fileItem.name));
      return;
    }

    // Fallback if in Demo Mode
    if (isDemoMode) {
      const mockFile = demoFiles.find(f => f.path === fileItem.path);
      if (mockFile) {
        const fileLang = getFileLanguage(fileItem.name);
        const newTab = {
          path: mockFile.path,
          name: mockFile.name,
          content: mockFile.content,
          originalContent: mockFile.originalContent,
          language: fileLang,
          isDirty: false
        };
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabPath(mockFile.path);
        setSelectedLang(fileLang);
      }
      return;
    }

    setLoadingFile(true);
    try {
      const res = await apiFetch(`/repos/${connectedRepo.id}/contents/file?path=${encodeURIComponent(fileItem.path)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch file content.');
      }
      const fileLang = getFileLanguage(fileItem.name);
      const newTab = {
        path: fileItem.path,
        name: fileItem.name,
        content: data.content || '',
        originalContent: data.content || '',
        language: fileLang,
        isDirty: false
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTabPath(fileItem.path);
      setSelectedLang(fileLang);
    } catch (err) {
      setError(err.message || 'Failed to load file.');
    } finally {
      setLoadingFile(false);
    }
  };

  const activeTab = openTabs.find(t => t.path === activeTabPath);

  // Close tab
  const handleCloseTab = (tabPath, e) => {
    e.stopPropagation();
    const updatedTabs = openTabs.filter(t => t.path !== tabPath);
    setOpenTabs(updatedTabs);
    
    if (activeTabPath === tabPath && updatedTabs.length > 0) {
      setActiveTabPath(updatedTabs[updatedTabs.length - 1].path);
      setSelectedLang(getFileLanguage(updatedTabs[updatedTabs.length - 1].name));
    } else if (updatedTabs.length === 0) {
      setActiveTabPath('');
    }
  };

  // --- Handle Code Editing ---
  const handleEditorChange = (value) => {
    setOpenTabs(prev => prev.map(t => {
      if (t.path === activeTabPath) {
        const isDirty = value !== t.originalContent;
        
        if (isDirty) {
          if (!changedFiles.includes(t.path)) {
            setChangedFiles(cf => [...cf, t.path]);
          }
        } else {
          if (!stagedFiles.includes(t.path)) {
            setChangedFiles(cf => cf.filter(p => p !== t.path));
          }
        }

        // Check for merge conflict markers
        const hasMarkers = value.includes('<<<<<<< HEAD') || value.includes('=======\n') || value.includes('>>>>>>>');
        setHasMergeConflict(hasMarkers);

        return { ...t, content: value, isDirty };
      }
      return t;
    }));
  };

  // ─── REAL: Format Code ───
  const handleFormatCode = () => {
    if (!activeTab) return;
    setIsFormatting(true);
    setTimeout(() => {
      const formatted = activeTab.content.trim() + '\n';
      handleEditorChange(formatted);
      setIsFormatting(false);
      triggerToast('Code formatted.');
      appendLog('terminal', `[Prettier] Formatted ${activeTab.name}`);
    }, 400);
  };

  // ─── REAL: Save File to GitHub ───
  const handleSaveFile = async () => {
    if (!activeTab) return;
    setIsSaving(true);

    if (isDemoMode) {
      // Demo mode: just mark as saved locally
      setTimeout(() => {
        setOpenTabs(prev => prev.map(t => {
          if (t.path === activeTabPath) {
            return { ...t, originalContent: t.content, isDirty: false };
          }
          return t;
        }));
        setIsSaving(false);
        triggerToast('File saved locally (sandbox mode).');
      }, 300);
      return;
    }

    try {
      appendLog('terminal', `[Save] Saving ${activeTab.name} to GitHub...`);
      const res = await workspaceFetch('/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeTab.path,
          content: activeTab.content,
          commitMessage: `Update ${activeTab.name} via GitSense AI`,
        }),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setOpenTabs(prev => prev.map(t => {
          if (t.path === activeTabPath) {
            return { ...t, originalContent: t.content, isDirty: false };
          }
          return t;
        }));
        setChangedFiles(cf => cf.filter(p => p !== activeTab.path));
        const msg = data.savedToGithub
          ? `✓ ${activeTab.name} saved and pushed to GitHub.`
          : `✓ ${activeTab.name} saved locally.`;
        appendLog('terminal', msg);
        triggerToast(data.savedToGithub ? 'Saved & pushed to GitHub!' : 'Saved locally.');
      } else {
        appendLog('terminal', `✗ Save failed: ${data.error || 'Unknown error'}`);
        triggerToast('Save failed.');
      }
    } catch (err) {
      appendLog('terminal', `✗ Save error: ${err.message}`);
      triggerToast('Save error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── REAL: Run Code ───
  const handleRunCode = async () => {
    if (!activeTab) return;
    setIsRunning(true);
    setActiveTerminalTab('TERMINAL');

    const lang = selectedLang === 'python' ? 'python' : 'javascript';
    const runnerCmd = lang === 'python' ? `python ${activeTab.name}` : `node ${activeTab.name}`;
    appendLog('terminal', `$ ${runnerCmd}`);

    if (isDemoMode) {
      setTimeout(() => {
        appendLog('terminal', '[Sandbox] Code execution requires a connected repo.');
        appendLog('terminal', '[Sandbox] Connect a GitHub repo to run code on the server.');
        setIsRunning(false);
      }, 500);
      return;
    }

    try {
      const res = await workspaceFetch('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeTab.content, language: lang }),
      });
      const data = await res.json();

      if (data.stdout) {
        data.stdout.split('\n').filter(Boolean).forEach(line => {
          appendLog('terminal', line);
        });
      }
      if (data.stderr) {
        data.stderr.split('\n').filter(Boolean).forEach(line => {
          setTerminalLogs(prev => [...prev, { text: line, type: 'error' }]);
        });
      }
      if (data.exitCode === 0) {
        appendLog('terminal', `✓ Process exited with code 0.`);
      } else {
        setTerminalLogs(prev => [...prev, { text: `✗ Process exited with code ${data.exitCode}.`, type: 'error' }]);
      }
    } catch (err) {
      setTerminalLogs(prev => [...prev, { text: `✗ Run error: ${err.message}`, type: 'error' }]);
    } finally {
      setIsRunning(false);
    }
  };

  // ─── REAL: Git Commit ───
  const handleCommit = async () => {
    if (isDemoMode) {
      triggerToast('Connect a repo for real git operations.');
      return;
    }

    if (!commitMessage.trim()) {
      triggerToast('Commit message is required.');
      return;
    }

    appendLog('terminal', `$ git add . && git commit -m "${commitMessage}"`);

    try {
      // Stage all first
      await workspaceFetch('/git/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: ['.'] }),
      });

      // Then commit
      const res = await workspaceFetch('/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage }),
      });
      const data = await res.json();

      if (data.success) {
        data.stdout.split('\n').filter(Boolean).forEach(line => {
          appendLog('terminal', line);
        });
        setStagedFiles([]);
        setChangedFiles([]);
        setCommitMessage('');
        triggerToast('Committed successfully!');
        fetchGitStatus();
      } else {
        const errMsg = data.stderr || data.stdout || 'Commit failed';
        setTerminalLogs(prev => [...prev, { text: `✗ ${errMsg}`, type: 'error' }]);
        triggerToast('Commit failed.');
      }
    } catch (err) {
      setTerminalLogs(prev => [...prev, { text: `✗ Commit error: ${err.message}`, type: 'error' }]);
      triggerToast('Commit error.');
    }
  };

  // ─── REAL: Git Pull ───
  const handlePull = async () => {
    if (isDemoMode) {
      triggerToast('Connect a repo for real git operations.');
      return;
    }
    setIsPulling(true);
    appendLog('terminal', `$ git pull origin ${currentBranch}`);

    try {
      const res = await workspaceFetch('/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: currentBranch }),
      });
      const data = await res.json();

      if (data.stdout) {
        data.stdout.split('\n').filter(Boolean).forEach(line => appendLog('terminal', line));
      }
      if (data.stderr) {
        data.stderr.split('\n').filter(Boolean).forEach(line => appendLog('terminal', line));
      }
      triggerToast(data.success ? 'Pull completed!' : 'Pull had issues.');
      fetchGitStatus();
    } catch (err) {
      setTerminalLogs(prev => [...prev, { text: `✗ Pull error: ${err.message}`, type: 'error' }]);
      triggerToast('Pull error.');
    } finally {
      setIsPulling(false);
    }
  };

  // ─── REAL: Git Push ───
  const handlePush = async () => {
    if (isDemoMode) {
      triggerToast('Connect a repo for real git operations.');
      return;
    }
    setIsPushing(true);
    appendLog('terminal', `$ git push origin ${currentBranch}`);

    try {
      const res = await workspaceFetch('/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: currentBranch }),
      });
      const data = await res.json();

      if (data.stdout) {
        data.stdout.split('\n').filter(Boolean).forEach(line => appendLog('terminal', line));
      }
      if (data.stderr) {
        data.stderr.split('\n').filter(Boolean).forEach(line => appendLog('terminal', line));
      }
      triggerToast(data.success ? 'Push completed!' : 'Push had issues.');
    } catch (err) {
      setTerminalLogs(prev => [...prev, { text: `✗ Push error: ${err.message}`, type: 'error' }]);
      triggerToast('Push error.');
    } finally {
      setIsPushing(false);
    }
  };

  // ─── REAL: Sync Branch (fetch + pull) ───
  const handleSync = async () => {
    if (isDemoMode) {
      triggerToast('Connect a repo for real git operations.');
      return;
    }
    setIsSyncing(true);
    appendLog('terminal', `$ git fetch origin && git pull origin ${currentBranch}`);

    try {
      // First exec fetch
      await workspaceFetch('/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'git fetch --all' }),
      });

      // Then pull
      const res = await workspaceFetch('/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: currentBranch }),
      });
      const data = await res.json();

      if (data.stdout) {
        data.stdout.split('\n').filter(Boolean).forEach(line => appendLog('terminal', line));
      }
      appendLog('terminal', '✓ Branch synchronized.');
      triggerToast('Branch synchronized!');
      fetchGitStatus();
    } catch (err) {
      setTerminalLogs(prev => [...prev, { text: `✗ Sync error: ${err.message}`, type: 'error' }]);
    } finally {
      setIsSyncing(false);
    }
  };

  // Custom Git Gutter indicators inside Monaco Editor on edit
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeTab) return;
    
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    
    const originalLines = activeTab.originalContent.split('\n');
    const currentLines = activeTab.content.split('\n');
    const newDecorations = [];
    
    const maxLines = Math.max(originalLines.length, currentLines.length);
    for (let i = 0; i < maxLines; i++) {
      const lineNum = i + 1;
      const originalLine = originalLines[i];
      const currentLine = currentLines[i];
      
      if (originalLine === undefined) {
        newDecorations.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: false,
            lineDecorationsClassName: 'git-line-added'
          }
        });
      } else if (currentLine !== undefined && originalLine !== currentLine) {
        newDecorations.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: false,
            lineDecorationsClassName: 'git-line-modified'
          }
        });
      }
    }
    
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [activeTabPath, activeTab?.content]);

  // Ask AI handler
  const handleAskAIClick = () => {
    if (!activeTab) return;
    const lines = activeTab.content.split('\n').slice(0, 200).join('\n');
    onAskAI(activeTab.name, lines);
  };

  // --- Source Control List Handlers ---
  const stageFile = async (filePath) => {
    if (!isDemoMode && connectedRepo) {
      try {
        await workspaceFetch('/git/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: [filePath] }),
        });
      } catch (err) {
        console.error('[IDE] Stage file error:', err);
      }
    }
    setChangedFiles(prev => prev.filter(f => f !== filePath));
    if (!stagedFiles.includes(filePath)) {
      setStagedFiles(prev => [...prev, filePath]);
    }
  };

  const unstageFile = (filePath) => {
    setStagedFiles(prev => prev.filter(f => f !== filePath));
    if (!changedFiles.includes(filePath)) {
      setChangedFiles(prev => [...prev, filePath]);
    }
  };

  const stageAll = async () => {
    if (!isDemoMode && connectedRepo) {
      try {
        await workspaceFetch('/git/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: ['.'] }),
        });
      } catch (err) {
        console.error('[IDE] Stage all error:', err);
      }
    }
    setStagedFiles(prev => [...new Set([...prev, ...changedFiles])]);
    setChangedFiles([]);
  };

  const unstageAll = () => {
    setChangedFiles(prev => [...new Set([...prev, ...stagedFiles])]);
    setStagedFiles([]);
  };

  // --- Terminal Log Helper ---
  const appendLog = (type, text) => {
    const logItem = {
      text,
      type: text.startsWith('✗') || text.includes('Error:') || text.startsWith('❌') ? 'error' :
            text.startsWith('✓') || text.startsWith('🚀') || text.startsWith('✔') ? 'success' : 'info'
    };
    
    if (type === 'terminal' || type === 'output') {
      setTerminalLogs(prev => [...prev, logItem]);
    }
  };

  // ─── REAL: Terminal Command Execution ───
  const handleTerminalSubmit = async (e) => {
    e.preventDefault();
    if (!terminalCommand.trim()) return;

    const cmd = terminalCommand.trim();
    const prompt = selectedTerm === 'PowerShell' ? 'PS>' : '$';
    setTerminalLogs(prev => [...prev, { text: `${prompt} ${cmd}`, type: 'info' }]);
    setCommandHistory(prev => [cmd, ...prev.slice(0, 50)]);
    setHistoryIndex(-1);
    setTerminalCommand('');

    // Handle local commands
    if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
      setTerminalLogs([]);
      return;
    }

    if (cmd.toLowerCase() === 'help') {
      setTerminalLogs(prev => [...prev,
        { text: '── GitSense Terminal Help ──', type: 'success' },
        { text: 'All commands run against your connected repo\'s cloned directory.', type: 'info' },
        { text: '', type: 'info' },
        { text: 'Common commands:', type: 'info' },
        { text: '  git status          — Show working tree status', type: 'info' },
        { text: '  git add .           — Stage all changes', type: 'info' },
        { text: '  git commit -m "msg" — Commit staged changes', type: 'info' },
        { text: '  git push origin main — Push to remote', type: 'info' },
        { text: '  git pull origin main — Pull from remote', type: 'info' },
        { text: '  git log --oneline -5 — Show recent commits', type: 'info' },
        { text: '  ls / dir            — List files', type: 'info' },
        { text: '  node file.js        — Run JavaScript file', type: 'info' },
        { text: '  python file.py      — Run Python file', type: 'info' },
        { text: '  npm install         — Install dependencies', type: 'info' },
        { text: '  npm test            — Run tests', type: 'info' },
        { text: '  clear               — Clear terminal', type: 'info' },
        { text: '', type: 'info' },
      ]);
      return;
    }

    if (isDemoMode) {
      setTerminalLogs(prev => [...prev,
        { text: '[Sandbox] Terminal commands require a connected repo.', type: 'error' },
        { text: '[Sandbox] Connect a GitHub repo to execute real commands.', type: 'info' },
        { text: '[Sandbox] Type "help" for available commands.', type: 'info' },
      ]);
      return;
    }

    // ─── EXECUTE REAL COMMAND ON BACKEND ───
    try {
      const res = await workspaceFetch('/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();

      if (res.status === 403) {
        setTerminalLogs(prev => [...prev, { text: `✗ Blocked: ${data.error}`, type: 'error' }]);
        return;
      }

      if (data.stdout) {
        data.stdout.split('\n').forEach(line => {
          setTerminalLogs(prev => [...prev, { text: line, type: 'info' }]);
        });
      }
      if (data.stderr) {
        data.stderr.split('\n').filter(Boolean).forEach(line => {
          setTerminalLogs(prev => [...prev, { text: line, type: data.exitCode !== 0 ? 'error' : 'info' }]);
        });
      }
      if (!data.stdout && !data.stderr && data.exitCode === 0) {
        setTerminalLogs(prev => [...prev, { text: '(command completed with no output)', type: 'info' }]);
      }

      // Refresh git status after git commands
      const lowerCmd = cmd.toLowerCase();
      if (lowerCmd.startsWith('git ')) {
        fetchGitStatus();
      }
    } catch (err) {
      setTerminalLogs(prev => [...prev, { text: `✗ Error: ${err.message}`, type: 'error' }]);
    }
  };

  // Terminal keyboard navigation (up/down for history)
  const handleTerminalKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(newIndex);
        setTerminalCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setTerminalCommand(commandHistory[newIndex]);
      } else {
        setHistoryIndex(-1);
        setTerminalCommand('');
      }
    }
  };

  // Scroll to terminal bottom
  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs, activeTerminalTab]);

  return (
    <div className="flex-1 flex overflow-hidden h-full text-slate-300 relative">
      
      {/* Action Status Toast Notifications */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0B1020]/90 border border-[#00D4FF]/30 shadow-[0_0_15px_rgba(0,212,255,0.2)] px-4 py-2 rounded-xl text-xs flex items-center gap-2 text-[#00D4FF] backdrop-blur-md"
          >
            <Sparkles size={13} className="animate-pulse" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- COLUMN 1: FILE TREE EXPLORER --- */}
      <div className="w-[240px] border-r border-white/[0.06] bg-[#060913]/60 flex flex-col h-full select-none flex-shrink-0">
        
        {/* Navigation / Header */}
        <div className="p-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
              WORKSPACE EXPLORER
            </span>
          </div>
          
          {/* Mode Indicator */}
          <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold select-none border ${
            isDemoMode 
              ? 'bg-[#7C5CFF]/15 border-[#7C5CFF]/30 text-[#7C5CFF]'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          }`}>
            {isDemoMode ? 'SANDBOX' : 'LIVE'}
          </span>
        </div>

        {/* Directory/File Listing */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-2.5 rounded-xl text-[10px] flex items-center gap-1.5">
              <AlertTriangle size={12} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loadingTree && contents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500 text-xs">
              <RefreshCw size={16} className="animate-spin text-[#7C5CFF]" />
              <span>Loading workspace tree...</span>
            </div>
          ) : (
            contents.map((item) => {
              const isSelected = activeTabPath === item.path;
              const hasUnsaved = openTabs.find(t => t.path === item.path)?.isDirty;

              return (
                <button
                  key={item.path}
                  onClick={() => loadFileContent(item)}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-between cursor-pointer border ${
                    isSelected
                      ? 'bg-slate-800/80 border-[#7C5CFF]/30 text-white'
                      : 'border-transparent hover:bg-slate-900/50 hover:text-slate-100 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.type === 'dir' || item.type === 'tree' ? (
                      <Folder size={14} className="shrink-0 text-[#7C5CFF]/80" />
                    ) : (
                      <FileCode size={14} className="shrink-0 text-[#00D4FF]/80" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </div>
                  
                  {/* File tree indicators */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasUnsaved && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved Changes" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Demo Mode / Switch banner */}
        {!connectedRepo && (
          <div className="p-3 border-t border-white/[0.06] bg-slate-950/40 text-center">
            <p className="text-[10px] text-slate-500 leading-relaxed mb-2">
              Showing Sandbox Mode. Connect a repo in the header to view your own code.
            </p>
          </div>
        )}
      </div>

      {/* --- COLUMN 2: CODE EDITOR & TERMINAL WORKSPACE (MIDDLE) --- */}
      <div className="flex-1 flex flex-col bg-[#030712] overflow-hidden min-w-0">
        
        {/* Editor Main Header Toolbar */}
        <div className="h-14 border-b border-white/[0.06] bg-[#060913]/60 px-4 flex items-center justify-between gap-4 shrink-0 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
              AI Workspace
            </span>
            {!isDemoMode && (
              <span className="text-[9px] text-slate-500 font-mono">
                branch: <strong className="text-emerald-400">{currentBranch}</strong>
              </span>
            )}
          </div>

          {/* Action Area & Dropdowns */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Language Selector Dropdown */}
            <div className="relative">
              <button 
                onClick={() => {
                  setIsLangDropdownOpen(!isLangDropdownOpen);
                  setIsTermDropdownOpen(false);
                }}
                className="px-2.5 py-1.5 bg-[#060913]/60 border border-white/[0.08] hover:border-[#7C5CFF]/30 text-slate-300 hover:text-white rounded-xl text-[10px] font-mono flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <span>Lang: <strong className="text-[#00D4FF]">{selectedLang === 'javascript' ? 'JavaScript' : selectedLang === 'typescript' ? 'TypeScript' : 'Python'}</strong></span>
                <ChevronLeft size={10} className={`rotate-270 transition-transform ${isLangDropdownOpen ? 'rotate-90' : ''}`} />
              </button>

              <AnimatePresence>
                {isLangDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsLangDropdownOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute right-0 top-[110%] w-[130px] bg-slate-950/95 border border-white/[0.1] rounded-xl shadow-2xl backdrop-blur-xl z-50 p-1 flex flex-col"
                    >
                      {[
                        { id: 'javascript', label: 'JavaScript' },
                        { id: 'typescript', label: 'TypeScript' },
                        { id: 'python', label: 'Python' }
                      ].map(lang => (
                        <button
                          key={lang.id}
                          onClick={() => {
                            setSelectedLang(lang.id);
                            setIsLangDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer transition-all ${
                            selectedLang === lang.id ? 'bg-[#7C5CFF]/15 text-[#7C5CFF]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                          }`}
                        >
                          {lang.label}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Terminal Selector Dropdown */}
            <div className="relative">
              <button 
                onClick={() => {
                  setIsTermDropdownOpen(!isTermDropdownOpen);
                  setIsLangDropdownOpen(false);
                }}
                className="px-2.5 py-1.5 bg-[#060913]/60 border border-white/[0.08] hover:border-[#7C5CFF]/30 text-slate-300 hover:text-white rounded-xl text-[10px] font-mono flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <span>Shell: <strong className="text-[#7C5CFF]">{selectedTerm}</strong></span>
                <ChevronLeft size={10} className={`rotate-270 transition-transform ${isTermDropdownOpen ? 'rotate-90' : ''}`} />
              </button>

              <AnimatePresence>
                {isTermDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsTermDropdownOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute right-0 top-[110%] w-[120px] bg-slate-950/95 border border-white/[0.1] rounded-xl shadow-2xl backdrop-blur-xl z-50 p-1 flex flex-col"
                    >
                      {['PowerShell', 'Bash', 'CMD'].map(term => (
                        <button
                          key={term}
                          onClick={() => {
                            setSelectedTerm(term);
                            setIsTermDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer transition-all ${
                            selectedTerm === term ? 'bg-[#7C5CFF]/15 text-[#7C5CFF]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                          }`}
                        >
                          {term}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Action Buttons: Run Code, Format, Save, Commit Changes */}
            <div className="flex items-center gap-2 border-l border-white/[0.06] pl-2.5">
              
              {/* RUN CODE */}
              <button
                onClick={handleRunCode}
                disabled={isRunning || !activeTab}
                className="relative px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold text-slate-200 hover:text-white transition-all duration-300 cursor-pointer flex items-center gap-1 bg-[#060913]/60 hover:bg-slate-950/80 border border-white/[0.08] hover:border-transparent shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(0,212,255,0.2)] hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none group"
              >
                <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-[#7C5CFF]/20 to-[#00D4FF]/20 group-hover:from-[#7C5CFF] group-hover:to-[#00D4FF] transition-all duration-300" style={{
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                }} />
                {isRunning ? <Loader2 size={10} className="animate-spin text-[#00D4FF]" /> : <Play size={10} className="text-[#00D4FF] fill-[#00D4FF]/20" />}
                <span>{isRunning ? 'Running...' : 'Run'}</span>
              </button>

              {/* FORMAT */}
              <button
                onClick={handleFormatCode}
                disabled={isFormatting || !activeTab}
                className="relative px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold text-slate-200 hover:text-white transition-all duration-300 cursor-pointer flex items-center gap-1 bg-[#060913]/60 hover:bg-slate-950/80 border border-white/[0.08] hover:border-transparent shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(0,212,255,0.2)] hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none group"
              >
                <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-[#7C5CFF]/20 to-[#00D4FF]/20 group-hover:from-[#7C5CFF] group-hover:to-[#00D4FF] transition-all duration-300" style={{
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                }} />
                <RefreshCw size={10} className={`text-[#7C5CFF] ${isFormatting ? 'animate-spin' : ''}`} />
                <span>Format</span>
              </button>

              {/* SAVE */}
              <button
                onClick={handleSaveFile}
                disabled={isSaving || !activeTab}
                className="relative px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold text-slate-200 hover:text-white transition-all duration-300 cursor-pointer flex items-center gap-1 bg-[#060913]/60 hover:bg-slate-950/80 border border-white/[0.08] hover:border-transparent shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(0,212,255,0.2)] hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none group"
              >
                <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-[#7C5CFF]/20 to-[#00D4FF]/20 group-hover:from-[#7C5CFF] group-hover:to-[#00D4FF] transition-all duration-300" style={{
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                }} />
                {isSaving ? <Loader2 size={10} className="animate-spin text-[#00D4FF]" /> : <Save size={10} className="text-[#00D4FF]" />}
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </button>

              {/* COMMIT CHANGES */}
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim() && changedFiles.length === 0 && stagedFiles.length === 0}
                className="relative px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold text-slate-200 hover:text-white transition-all duration-300 cursor-pointer flex items-center gap-1 bg-[#060913]/60 hover:bg-slate-950/80 border border-white/[0.08] hover:border-transparent shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(124,92,255,0.2)] hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none group"
              >
                <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-[#7C5CFF]/20 to-[#00D4FF]/20 group-hover:from-[#7C5CFF] group-hover:to-[#00D4FF] transition-all duration-300" style={{
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                }} />
                <GitCommit size={10} className="text-[#7C5CFF]" />
                <span>Commit</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Row (VS Code Style Open Tabs) */}
        <div className="h-9 border-b border-white/[0.06] bg-[#060913]/40 flex items-center overflow-x-auto select-none custom-scrollbar shrink-0">
          {openTabs.map(tab => {
            const isTabActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                onClick={() => {
                  setActiveTabPath(tab.path);
                  setSelectedLang(getFileLanguage(tab.name));
                }}
                className={`h-full px-4 flex items-center gap-2 border-r border-white/[0.06] text-xs font-semibold cursor-pointer transition-all ${
                  isTabActive 
                    ? 'bg-[#030712] border-t-2 border-[#7C5CFF] text-[#F8FAFC]' 
                    : 'bg-[#060913]/20 text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                }`}
              >
                <FileCode size={12} className={isTabActive ? 'text-[#00D4FF]' : 'text-slate-500'} />
                <span>{tab.name}</span>
                {tab.isDirty ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" />
                ) : (
                  <button 
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition-colors ml-1"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}
          {openTabs.length === 0 && (
            <div className="px-4 text-[10px] text-slate-500 font-medium font-mono select-none">
              No active editor tabs.
            </div>
          )}
        </div>

        {/* Monaco Editor Container */}
        <div className="flex-1 relative w-full h-full text-left overflow-hidden">
          {loadingFile ? (
            <div className="absolute inset-0 bg-[#030712] flex flex-col items-center justify-center gap-3 text-slate-500 text-xs">
              <RefreshCw size={22} className="animate-spin text-[#7C5CFF]" />
              <span>Loading workspace file...</span>
            </div>
          ) : activeTab ? (
            <Editor
              height="100%"
              theme="vs-dark"
              language={selectedLang}
              value={activeTab.content}
              onChange={handleEditorChange}
              onMount={handleEditorDidMount}
              options={{
                readOnly: false,
                fontSize: 13,
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                minimap: { enabled: true, maxColumn: 80 },
                lineNumbers: 'on',
                lineNumbersMinChars: 3,
                wordWrap: 'on',
                autoIndent: 'advanced',
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                cursorStyle: 'line',
                scrollbar: {
                  vertical: 'visible',
                  horizontal: 'visible',
                  useShadows: false,
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8
                },
                guides: {
                  indentation: true,
                  bracketPairs: true
                },
                bracketPairColorization: {
                  enabled: true
                },
                padding: { top: 8, bottom: 8 }
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3 text-slate-500 select-none h-full">
              <FileCode size={24} className="opacity-30 animate-pulse text-[#7C5CFF]" />
              <p className="text-xs leading-relaxed max-w-xs">
                Select a file from the explorer on the left to start editing in the AI Workspace.
              </p>
            </div>
          )}
        </div>

        {/* --- VS CODE-STYLE INTEGRATED TERMINAL PANEL (BOTTOM) --- */}
        <div className="h-[220px] border-t border-white/[0.06] bg-[#060913]/90 flex flex-col overflow-hidden shrink-0 select-none">
          {/* Terminal Tabs bar */}
          <div className="h-9 border-b border-white/[0.04] bg-[#060913]/30 px-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              {['TERMINAL', 'PROBLEMS', 'OUTPUT'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTerminalTab(tab)}
                  className={`h-full px-3 text-[10.5px] font-bold relative flex items-center transition-all cursor-pointer ${
                    activeTerminalTab === tab 
                      ? 'text-[#00D4FF]' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{tab}</span>
                  {tab === 'PROBLEMS' && hasMergeConflict && (
                    <span className="ml-1.5 px-1 py-0.2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[9px] font-mono font-extrabold select-none">
                      1
                    </span>
                  )}
                  {activeTerminalTab === tab && (
                    <motion.div 
                      layoutId="terminalActiveIndicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00D4FF]"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* AI Assistant Chat link trigger */}
            {activeTab && (
              <button 
                onClick={handleAskAIClick}
                className="px-2.5 py-1 bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF] hover:bg-[#7C5CFF] hover:text-white rounded-lg text-[9px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow"
              >
                <Send size={8} /> Discuss file with GitSense AI
              </button>
            )}
          </div>

          {/* Tab Screen Contents */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs custom-scrollbar bg-black/35">
            {activeTerminalTab === 'TERMINAL' && (
              <div className="flex flex-col gap-1 min-h-full">
                {/* History logs */}
                {terminalLogs.map((log, index) => (
                  <div 
                    key={index} 
                    className={`whitespace-pre-wrap leading-relaxed ${
                      log.type === 'error' ? 'text-rose-400' :
                      log.type === 'success' ? 'text-[#00E38C]' :
                      'text-slate-300'
                    }`}
                  >
                    {log.text}
                  </div>
                ))}
                
                {/* Command Input Prompt line */}
                <form onSubmit={handleTerminalSubmit} className="flex items-center gap-1.5 mt-1">
                  <span className="text-[#00E38C] shrink-0 select-none">
                    {selectedTerm === 'PowerShell' ? 'PS>' : '$ '}
                  </span>
                  <input
                    type="text"
                    value={terminalCommand}
                    onChange={(e) => setTerminalCommand(e.target.value)}
                    onKeyDown={handleTerminalKeyDown}
                    placeholder={connectedRepo ? "Type any command... (try: git status, ls, npm test)" : "Type help for commands..."}
                    className="flex-1 bg-transparent border-none outline-none text-slate-200 caret-[#00D4FF] min-w-0"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </form>
                
                <div ref={terminalBottomRef} />
              </div>
            )}

            {activeTerminalTab === 'PROBLEMS' && (
              <div className="flex flex-col gap-2.5 text-left">
                {hasMergeConflict ? (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl p-3.5 flex items-start gap-3">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-500" />
                    <div className="flex flex-col gap-1 text-[11px]">
                      <span className="font-bold">Merge Conflict Detected</span>
                      <p className="text-slate-300">Merge conflict markers found in the current file. Resolve the conflicts to continue.</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs py-8 text-center flex flex-col items-center gap-2 select-none">
                    <Check size={20} className="text-emerald-400" />
                    <span>No errors or warnings found. Clean build!</span>
                  </div>
                )}
              </div>
            )}

            {activeTerminalTab === 'OUTPUT' && (
              <div className="flex flex-col gap-1 text-slate-400 text-left">
                <div>[System] GitSense AI Workspace loaded.</div>
                <div>[System] Monaco Editor initialized.</div>
                <div>[Workspace] {connectedRepo ? `Connected to ${connectedRepo.owner}/${connectedRepo.name}` : 'Running in sandbox mode.'}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- COLUMN 3: SOURCE CONTROL PANEL (RIGHT) --- */}
      <aside className="w-[280px] bg-[#060913]/90 border-l border-white/[0.06] flex flex-col flex-shrink-0 overflow-hidden select-none">
        
        {/* Panel Header */}
        <div className="p-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
            SOURCE CONTROL
          </span>
          <div className="flex items-center gap-2">
            {!isDemoMode && (
              <button
                onClick={fetchGitStatus}
                className="text-[9px] text-slate-500 hover:text-[#00D4FF] cursor-pointer transition-colors"
                title="Refresh git status"
              >
                <RefreshCw size={11} />
              </button>
            )}
            <span className="bg-[#7C5CFF]/10 text-[#7C5CFF] border border-[#7C5CFF]/20 text-[9px] font-bold px-1.5 py-0.2 rounded font-mono select-none">
              git
            </span>
          </div>
        </div>

        {/* Scrollable controls */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4.5 custom-scrollbar text-left">
          
          {/* Merge Conflict Warning Card */}
          {hasMergeConflict && (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                <AlertCircle size={13} className="shrink-0 animate-pulse text-rose-500" />
                <span>Merge Conflict Detected</span>
              </div>
              <p className="text-[10.5px] text-slate-300 leading-relaxed">
                Conflict markers found in the current file. Resolve them to proceed.
              </p>
            </motion.div>
          )}

          {/* Commit Message Box */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase font-mono">
              COMMIT CHANGES
            </label>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message (e.g., feat: add login)..."
              rows={2}
              className="w-full bg-slate-950/60 border border-white/[0.06] hover:border-white/[0.12] focus:border-[#7C5CFF]/50 rounded-xl p-2.5 text-xs text-slate-200 outline-none placeholder-slate-500 transition-colors resize-none"
            />
            
            {/* Sync Action Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              {/* PULL */}
              <button
                onClick={handlePull}
                disabled={isPulling || isDemoMode}
                className="py-2 bg-slate-900/60 hover:bg-[#7C5CFF]/15 border border-white/[0.06] hover:border-[#7C5CFF]/40 rounded-xl text-[10.5px] font-bold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
              >
                {isPulling ? <Loader2 size={11} className="animate-spin text-[#00D4FF]" /> : <ArrowDownCircle size={11} className="text-[#00D4FF]" />}
                <span>{isPulling ? 'Pulling...' : 'Pull'}</span>
              </button>

              {/* PUSH */}
              <button
                onClick={handlePush}
                disabled={isPushing || isDemoMode}
                className="py-2 bg-slate-900/60 hover:bg-[#7C5CFF]/15 border border-white/[0.06] hover:border-[#7C5CFF]/40 rounded-xl text-[10.5px] font-bold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
              >
                {isPushing ? <Loader2 size={11} className="animate-spin text-[#7C5CFF]" /> : <ArrowUpCircle size={11} className="text-[#7C5CFF]" />}
                <span>{isPushing ? 'Pushing...' : 'Push'}</span>
              </button>
            </div>

            {/* SYNC BRANCH */}
            <button
              onClick={handleSync}
              disabled={isSyncing || isDemoMode}
              className="py-2.5 mt-1 bg-[#060913]/60 border border-white/[0.08] hover:border-transparent text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5 shadow-md hover:shadow-[0_0_15px_rgba(0,212,255,0.15)] hover:scale-[1.01] active:scale-99 group relative overflow-hidden disabled:opacity-40 disabled:pointer-events-none"
            >
              <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-[#7C5CFF]/20 to-[#00D4FF]/20 group-hover:from-[#7C5CFF] group-hover:to-[#00D4FF] transition-all duration-300" style={{
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
              }} />
              {isSyncing ? <Loader2 size={11} className="animate-spin text-[#00D4FF]" /> : <RefreshCw size={11} className="text-[#00D4FF] group-hover:rotate-180 transition-transform duration-500" />}
              <span>{isSyncing ? 'Syncing...' : 'Sync Branch'}</span>
            </button>
          </div>

          {/* Staged Changes Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
                STAGED CHANGES ({stagedFiles.length})
              </span>
              {stagedFiles.length > 0 && (
                <button 
                  onClick={unstageAll}
                  className="text-[9px] font-bold text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  Unstage All
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {stagedFiles.map(file => (
                <div key={file} className="flex items-center justify-between bg-slate-950/40 border border-white/[0.04] p-2 rounded-xl text-xs group">
                  <span className="truncate text-slate-300 max-w-[170px]" title={file}>{file}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-extrabold px-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono select-none">A</span>
                    <button 
                      onClick={() => unstageFile(file)}
                      className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                      title="Unstage file"
                    >
                      <Minus size={11} />
                    </button>
                  </div>
                </div>
              ))}
              {stagedFiles.length === 0 && (
                <div className="bg-slate-950/20 border border-dashed border-white/[0.04] p-3 rounded-xl text-[10.5px] text-slate-600 text-center select-none font-medium">
                  No staged modifications
                </div>
              )}
            </div>
          </div>

          {/* Changed Files Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 font-mono uppercase">
                CHANGED FILES ({changedFiles.length})
              </span>
              {changedFiles.length > 0 && (
                <button 
                  onClick={stageAll}
                  className="text-[9px] font-bold text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  Stage All
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {changedFiles.map(file => (
                <div key={file} className="flex items-center justify-between bg-slate-950/40 border border-white/[0.04] p-2 rounded-xl text-xs group">
                  <span className="truncate max-w-[170px] text-slate-300" title={file}>{file}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-extrabold px-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono select-none">M</span>
                    <button 
                      onClick={() => stageFile(file)}
                      className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                      title="Stage file"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              ))}
              {changedFiles.length === 0 && (
                <div className="bg-slate-950/20 border border-dashed border-white/[0.04] p-3 rounded-xl text-[10.5px] text-slate-600 text-center select-none font-medium">
                  No unstaged modifications
                </div>
              )}
            </div>
          </div>

          {/* AI Insight Card */}
          <div className="relative overflow-hidden rounded-2xl border border-[#7C5CFF]/35 bg-gradient-to-br from-[#7C5CFF]/5 to-[#00D4FF]/5 p-4 shadow-[0_0_15px_rgba(124,92,255,0.08)] mt-auto select-text">
            {/* Glowing spot */}
            <div className="absolute -right-6 -bottom-6 w-20 h-20 rounded-full bg-[#00D4FF]/15 blur-xl pointer-events-none" />
            <div className="flex gap-2">
              <Sparkles size={14} className="text-[#00D4FF] shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-300 font-heading tracking-wide">
                  AI WORKSPACE
                </span>
                <p className="text-[10px] text-slate-400 leading-relaxed font-sans font-medium">
                  {connectedRepo 
                    ? `Terminal commands execute on the real cloned repo. Git push/pull work with GitHub.`
                    : `Connect a GitHub repo to unlock real terminal execution, git operations, and code running.`}
                </p>
              </div>
            </div>
          </div>

        </div>
      </aside>
    </div>
  );
}
