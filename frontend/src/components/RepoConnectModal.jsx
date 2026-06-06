import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, X, RefreshCw, AlertTriangle, ExternalLink, Download, Lock } from 'lucide-react';

export default function RepoConnectModal({ isOpen, onClose, apiFetch, onConnectSuccess }) {
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState([]);
  const [error, setError] = useState('');
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [importingRepo, setImportingRepo] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Check GitHub connection status on modal open
  useEffect(() => {
    if (isOpen) {
      checkGithubStatus();
    }
  }, [isOpen]);

  // Auto-fetch repos when GitHub is connected
  useEffect(() => {
    if (isGithubConnected && repos.length === 0) {
      fetchGithubRepos();
    }
  }, [isGithubConnected]);

  const checkGithubStatus = async () => {
    try {
      const res = await apiFetch('/github/status');
      const data = await res.json();
      setIsGithubConnected(data.connected);
      if (data.connected) {
        setGithubUsername(data.githubUsername);
      }
    } catch (err) {
      console.error('Failed to check GitHub status:', err.message);
      setIsGithubConnected(false);
    }
  };

  const fetchGithubRepos = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/github/repos');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load repositories.');
      }
      setRepos(data.repos || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch repositories.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGithub = async () => {
    try {
      setLoading(true);
      setError('');
      
      const res = await apiFetch('/github/connect');
      const data = await res.json();
      
      if (!res.ok || !data.authUrl) {
        throw new Error(data.error || 'Failed to initiate GitHub connection.');
      }
      
      // Redirect to GitHub OAuth
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err.message || 'Failed to connect GitHub.');
      setLoading(false);
    }
  };

  const handleImportRepo = async (repo) => {
    setImportingRepo(repo.fullName);
    setError('');
    setSuccessMessage('');
    try {
      const res = await apiFetch('/github/import', {
        method: 'POST',
        body: JSON.stringify({ fullName: repo.fullName }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import repository.');
      }
      
      setSuccessMessage(`Successfully imported ${repo.name}!`);
      onConnectSuccess(data.repository);
      
      // Close modal after 1.5 seconds
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to import repository.');
    } finally {
      setImportingRepo(null);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your GitHub account?')) {
      return;
    }
    
    try {
      const res = await apiFetch('/github/disconnect', { method: 'POST' });
      if (res.ok) {
        setIsGithubConnected(false);
        setGithubUsername('');
        setRepos([]);
        setSuccessMessage('GitHub account disconnected.');
      }
    } catch (err) {
      setError('Failed to disconnect GitHub account.');
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
          className="bg-slate-950 border border-white/[0.08] rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl"
          style={{ maxHeight: '85vh' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-slate-900/50 to-slate-900/20">
            <h3 className="text-base font-bold font-heading text-slate-100 flex items-center gap-2">
              <GitBranch size={16} className="text-[#7C5CFF]" />
              {isGithubConnected ? 'Import Repository' : 'Connect GitHub Account'}
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
            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl text-xs flex items-center gap-2"
              >
                <AlertTriangle size={14} className="shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Success Message */}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-xl text-xs flex items-center gap-2"
              >
                <span>✓ {successMessage}</span>
              </motion.div>
            )}

            {!isGithubConnected ? (
              /* Not Connected - Show Authorization Screen */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center text-center p-12 gap-6"
              >
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] p-[2px]"
                >
                  <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                    <GitBranch size={28} className="text-[#7C5CFF]" />
                  </div>
                </motion.div>

                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-bold text-slate-100">Connect Your GitHub Account</h4>
                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                    Authorize GitSense AI to access your repositories. You can import both public and private repositories once connected.
                  </p>
                </div>

                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button
                    onClick={handleConnectGithub}
                    disabled={loading}
                    className="px-6 py-3 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white text-xs font-bold rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink size={14} />
                        <span>Authorize with GitHub</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[10px] text-slate-500 mt-4">
                  You'll be redirected to GitHub to approve access to your repositories.
                </p>
              </motion.div>
            ) : (
              /* Connected - Show Repository List */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-4"
              >
                {/* Connected Header */}
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    Connected as <span className="font-bold">@{githubUsername}</span>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="text-[10px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer underline"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Repositories Header */}
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-200">Your Repositories ({repos.length})</h4>
                  <button
                    onClick={fetchGithubRepos}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Loading State */}
                {loading && repos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
                    <RefreshCw size={24} className="animate-spin text-[#7C5CFF]" />
                    <span className="text-xs font-medium">Fetching your repositories...</span>
                  </div>
                ) : repos.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500 bg-slate-900/30 rounded-xl border border-white/[0.04] p-6">
                    No repositories found in your GitHub profile.
                  </div>
                ) : (
                  <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                    {repos.map((repo) => (
                      <motion.div
                        key={repo.fullName}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-slate-900/50 border border-white/[0.06] rounded-lg p-4 flex items-start justify-between hover:border-white/[0.1] hover:bg-slate-900/70 transition-all group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h5 className="text-xs font-bold text-slate-100 truncate group-hover:text-white transition-colors">
                              {repo.fullName}
                            </h5>
                            {repo.isPrivate && (
                              <Lock size={12} className="text-amber-400 shrink-0" />
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-[10px] text-slate-500 truncate mb-2">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-[10px] text-slate-400">
                            {repo.language && (
                              <span className="px-2 py-0.5 bg-slate-800/50 rounded text-slate-300">
                                {repo.language}
                              </span>
                            )}
                            {repo.stars > 0 && (
                              <span>⭐ {repo.stars}</span>
                            )}
                            <span>Updated {new Date(repo.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleImportRepo(repo)}
                          disabled={importingRepo === repo.fullName || loading}
                          className="ml-3 px-3 py-1.5 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] text-white text-[10px] font-bold rounded-lg shadow-md hover:shadow-[0_0_15px_rgba(124,92,255,0.2)] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0"
                        >
                          {importingRepo === repo.fullName ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : (
                            <Download size={10} />
                          )}
                          {importingRepo === repo.fullName ? 'Importing...' : 'Import'}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
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
