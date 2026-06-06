import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, X, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';

export default function RepoConnectModal({ isOpen, onClose, apiFetch, onConnectSuccess }) {
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState([]);
  const [error, setError] = useState('');
  const [isGithubConnected, setIsGithubConnected] = useState(true);

  const fetchGithubRepos = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/repos/connect-github');
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400 && data.error?.includes('connect via GitHub OAuth')) {
          setIsGithubConnected(false);
        } else {
          throw new Error(data.error || 'Failed to load user repositories.');
        }
      } else {
        setRepos(data.repos || []);
        setIsGithubConnected(true);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch repositories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGithubRepos();
    }
  }, [isOpen]);

  const handleAuthorize = async () => {
    try {
      const res = await apiFetch('/auth/github');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'width=600,height=700');
      } else {
        alert('GitHub OAuth Client ID not configured.');
      }
    } catch {
      alert('Failed to connect to backend server.');
    }
  };

  const handleConnectRepo = async (repoFullName) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/repos/connect-github', {
        method: 'POST',
        body: JSON.stringify({ repoFullName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect repository.');
      }
      onConnectSuccess(data.repository);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to connect repository.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-950 border border-white/[0.08] rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl"
          style={{ maxHeight: '80vh' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-base font-bold font-heading text-slate-100 flex items-center gap-2">
              <GitBranch size={16} className="text-[#7C5CFF]" /> Connect GitHub Repository
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 custom-scrollbar">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!isGithubConnected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
                <div className="w-12 h-12 rounded-full bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 flex items-center justify-center text-[#7C5CFF]">
                  <GitBranch size={22} />
                </div>
                <h4 className="text-sm font-bold text-slate-200">GitHub account not connected</h4>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Authorize GitSense AI with your GitHub account to access your public and private repositories.
                </p>
                <button
                  onClick={handleAuthorize}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white text-xs font-bold rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all cursor-pointer flex items-center gap-2"
                >
                  <ExternalLink size={14} /> Authorize with GitHub
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Available Repositories ({repos.length})</span>
                  <button
                    onClick={fetchGithubRepos}
                    disabled={loading}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>

                {loading && repos.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                    <RefreshCw size={24} className="animate-spin text-[#7C5CFF]" />
                    <span className="text-xs font-medium">Fetching repositories...</span>
                  </div>
                ) : repos.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500 bg-slate-900/30 rounded-xl border border-white/[0.04] p-6">
                    No repositories found in your GitHub profile.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto custom-scrollbar pr-1">
                    {repos.map((repo) => (
                      <div
                        key={repo.fullName}
                        className="flex items-center justify-between bg-slate-900/40 hover:bg-slate-900 border border-white/[0.04] hover:border-white/[0.08] p-3.5 rounded-xl transition-all duration-200"
                      >
                        <div className="flex flex-col min-w-0 text-left">
                          <span className="text-xs font-semibold text-slate-200 truncate">{repo.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono truncate">{repo.fullName}</span>
                        </div>
                        <button
                          onClick={() => handleConnectRepo(repo.fullName)}
                          disabled={loading}
                          className="px-3.5 py-1.5 bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 text-[#7C5CFF] hover:bg-[#7C5CFF] hover:text-white rounded-xl text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                          Connect
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
