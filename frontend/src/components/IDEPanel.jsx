import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { motion } from 'framer-motion';
import { Folder, FileCode, ChevronLeft, RefreshCw, Send, AlertTriangle } from 'lucide-react';

export default function IDEPanel({ connectedRepo, apiFetch, onAskAI }) {
  const [currentPath, setCurrentPath] = useState('');
  const [contents, setContents] = useState([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [error, setError] = useState('');

  const fetchContents = async (path = '') => {
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

  const loadFileContent = async (fileItem) => {
    setLoadingFile(true);
    setError('');
    setSelectedFile(fileItem);
    try {
      const res = await apiFetch(`/repos/${connectedRepo.id}/contents/file?path=${encodeURIComponent(fileItem.path)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch file content.');
      }
      setFileContent(data.content || '');
    } catch (err) {
      setError(err.message || 'Failed to load file.');
      setFileContent('// Error loading file contents.');
    } finally {
      setLoadingFile(false);
    }
  };

  useEffect(() => {
    fetchContents('');
  }, [connectedRepo]);

  const handleDirectoryClick = (dirItem) => {
    fetchContents(dirItem.path);
  };

  const handleBackClick = () => {
    const parts = currentPath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    fetchContents(parentPath);
  };

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

  const handleAskAI = () => {
    if (!selectedFile) return;
    // Get first 200 lines
    const lines = fileContent.split('\n').slice(0, 200).join('\n');
    onAskAI(selectedFile.name, lines);
  };

  if (!connectedRepo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4 select-none">
        <div className="w-12 h-12 rounded-full bg-slate-900/80 border border-white/[0.05] flex items-center justify-center mb-2">
          <Folder size={20} className="opacity-40" />
        </div>
        <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
          Please connect a GitHub repository first to access the Code View panel.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden h-full text-slate-300">
      {/* Left panel: File Tree */}
      <div className="w-[260px] border-r border-white/[0.06] bg-[#060913]/60 flex flex-col h-full select-none flex-shrink-0">
        {/* Navigation Breadcrumb / Path */}
        <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
          {currentPath && (
            <button
              onClick={handleBackClick}
              className="p-1 rounded hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              title="Go Back"
            >
              <ChevronLeft size={14} />
            </button>
          )}
          <span className="text-[10px] font-mono text-slate-400 truncate flex-1">
            {currentPath ? `./${currentPath}` : './ (Root)'}
          </span>
          <button
            onClick={() => fetchContents(currentPath)}
            className="p-1 rounded hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
            title="Reload contents"
          >
            <RefreshCw size={11} className={loadingTree ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Contents List */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-2.5 rounded-lg text-[10px] flex items-center gap-1.5 select-all">
              <AlertTriangle size={12} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loadingTree && contents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500 text-xs">
              <RefreshCw size={16} className="animate-spin text-[#7C5CFF]" />
              <span>Loading tree...</span>
            </div>
          ) : (
            contents.map((item) => {
              const isFolder = item.type === 'dir';
              const isSelected = selectedFile?.path === item.path;

              return (
                <button
                  key={item.path}
                  onClick={() => (isFolder ? handleDirectoryClick(item) : loadFileContent(item))}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 cursor-pointer truncate border ${
                    isSelected
                      ? 'bg-slate-800/80 border-[#7C5CFF]/30 text-white'
                      : 'border-transparent hover:bg-slate-900/50 hover:text-slate-100 text-slate-400'
                  }`}
                >
                  {isFolder ? (
                    <Folder size={14} className="text-[#F59E0B]/80 shrink-0" />
                  ) : (
                    <FileCode size={14} className="text-[#00D4FF]/80 shrink-0" />
                  )}
                  <span className="truncate">{item.name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Editor Workspace */}
      <div className="flex-1 flex flex-col bg-[#030712] overflow-hidden">
        {selectedFile ? (
          <>
            {/* Editor Top Toolbar */}
            <div className="h-11 border-b border-white/[0.06] bg-[#060913]/40 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode size={14} className="text-[#00D4FF]" />
                <span className="text-xs font-semibold text-slate-200">{selectedFile.name}</span>
                <span className="bg-slate-900 border border-white/[0.06] px-1.5 py-0.5 rounded text-[8px] font-mono text-slate-500 uppercase">
                  {getFileLanguage(selectedFile.name)}
                </span>
              </div>

              <button
                onClick={handleAskAI}
                className="px-3.5 py-1.5 bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF] hover:bg-[#7C5CFF] hover:text-white rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-lg hover:shadow-[#7C5CFF]/20"
              >
                <Send size={10} /> Ask AI About This File
              </button>
            </div>

            {/* Monaco Editor Container */}
            <div className="flex-1 relative w-full h-full text-left overflow-hidden">
              {loadingFile ? (
                <div className="absolute inset-0 bg-[#030712] flex flex-col items-center justify-center gap-3 text-slate-500 text-xs">
                  <RefreshCw size={22} className="animate-spin text-[#7C5CFF]" />
                  <span>Loading file content...</span>
                </div>
              ) : (
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={getFileLanguage(selectedFile.name)}
                  value={fileContent}
                  options={{
                    readOnly: true,
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, monospace',
                    minimap: { enabled: false },
                    lineNumbersMinChars: 3,
                    wordWrap: 'on',
                    scrollbar: {
                      vertical: 'visible',
                      horizontal: 'visible',
                      useShadows: false,
                      verticalScrollbarSize: 10,
                      horizontalScrollbarSize: 10
                    }
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3 text-slate-500 select-none">
            <FileCode size={24} className="opacity-30 animate-pulse text-[#7C5CFF]" />
            <p className="text-xs leading-relaxed max-w-xs">
              Select a file from the explorer on the left to inspect its source code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
