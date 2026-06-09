import React, { useState, useEffect } from 'react';
import SubPageLayout from '../components/SubPageLayout';
import { Settings, Moon, Sun, Lightbulb, Code, LogOut, Trash2, ArrowRight } from 'lucide-react';

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [darkTheme, setDarkTheme] = useState(() => localStorage.getItem('gitsense_theme') !== 'light');
  const [gitTips, setGitTips] = useState(() => localStorage.getItem('gitsense_pref_git_tips') !== 'false');
  const [repoInsights, setRepoInsights] = useState(() => localStorage.getItem('gitsense_pref_repo_insights') !== 'false');
  const [isSaved, setIsSaved] = useState(false);

  // Load user data
  useEffect(() => {
    try {
      const userData = localStorage.getItem('gitsense_user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (e) {
      console.error('Error loading user data:', e);
    }
  }, []);

  // Handle theme toggle
  const handleThemeToggle = () => {
    const newTheme = !darkTheme;
    setDarkTheme(newTheme);
    localStorage.setItem('gitsense_theme', newTheme ? 'dark' : 'light');
    
    // Apply theme to document
    if (newTheme) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
  };

  // Save app preferences
  const handleSavePreferences = () => {
    localStorage.setItem('gitsense_pref_git_tips', gitTips.toString());
    localStorage.setItem('gitsense_pref_repo_insights', repoInsights.toString());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  // Clear local app data
  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all local app settings? Your account and profile data will NOT be deleted.')) {
      localStorage.removeItem('gitsense_pref_git_tips');
      localStorage.removeItem('gitsense_pref_repo_insights');
      localStorage.removeItem('gitsense_theme');
      setDarkTheme(true);
      setGitTips(true);
      setRepoInsights(true);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    }
  };

  // Logout
  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      localStorage.removeItem('gitsense_token');
      localStorage.removeItem('gitsense_user');
      window.location.hash = '#login';
    }
  };

  // Navigate to profile
  const handleEditProfile = () => {
    window.location.hash = '#profile';
  };

  return (
    <SubPageLayout activeTab="">
      <div className="flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex flex-col gap-1 text-left">
          <h2 className="text-2xl font-extrabold tracking-tight text-white font-heading">Settings</h2>
          <p className="text-sm text-slate-400">Manage your account, appearance, and app preferences.</p>
        </div>

        {/* SECTION 1: Account Settings */}
        <div className="gitsense-card p-6 flex flex-col gap-4 border-white/[0.08] bg-[#0b1220]/70">
          <div className="flex items-center gap-2 mb-1">
            <Settings size={16} className="text-[#00D4FF]" />
            <h3 className="text-sm font-semibold text-slate-200">Account Settings</h3>
          </div>

          <div className="space-y-3">
            {/* Name */}
            <div className="flex items-center justify-between py-2.5 px-3 bg-slate-950/40 border border-white/[0.06] rounded-lg">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-slate-400 font-mono uppercase">Name</span>
                <span className="text-sm text-slate-100 font-medium">{user?.name || 'User'}</span>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between py-2.5 px-3 bg-slate-950/40 border border-white/[0.06] rounded-lg">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-slate-400 font-mono uppercase">Email</span>
                <span className="text-sm text-slate-100 font-medium">{user?.email || 'Loading...'}</span>
              </div>
            </div>

            {/* GitHub URL */}
            <div className="flex items-center justify-between py-2.5 px-3 bg-slate-950/40 border border-white/[0.06] rounded-lg">
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-xs text-slate-400 font-mono uppercase">GitHub Profile</span>
                <span className="text-sm text-slate-100 font-medium truncate">{user?.githubLink || 'Not set'}</span>
              </div>
            </div>

            {/* Edit Profile Button */}
            <button
              onClick={handleEditProfile}
              className="mt-2 btn btn-primary flex items-center justify-center gap-2 py-2.5 px-4 !text-sm cursor-pointer w-full"
            >
              <span>Edit Profile</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* SECTION 2: Appearance */}
        <div className="gitsense-card p-6 flex flex-col gap-4 border-white/[0.08] bg-[#0b1220]/70">
          <div className="flex items-center gap-2 mb-1">
            {darkTheme ? (
              <Moon size={16} className="text-[#7C5CFF]" />
            ) : (
              <Sun size={16} className="text-[#FFD700]" />
            )}
            <h3 className="text-sm font-semibold text-slate-200">Appearance</h3>
          </div>

          <label className="flex items-center justify-between py-3 px-3 bg-slate-950/40 border border-white/[0.06] rounded-lg cursor-pointer hover:border-white/[0.12] transition-all group">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-400 font-mono uppercase">Dark Theme</span>
              <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">
                {darkTheme ? 'Currently enabled' : 'Currently disabled'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={darkTheme}
              onChange={handleThemeToggle}
              className="w-5 h-5 rounded border-white/[0.1] bg-slate-900 accent-[#00D4FF] cursor-pointer"
            />
          </label>
        </div>

        {/* SECTION 3: App Preferences */}
        <div className="gitsense-card p-6 flex flex-col gap-4 border-white/[0.08] bg-[#0b1220]/70">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb size={16} className="text-[#00E38C]" />
            <h3 className="text-sm font-semibold text-slate-200">App Preferences</h3>
          </div>

          <label className="flex items-center justify-between py-2.5 px-3 bg-slate-950/40 border border-white/[0.06] rounded-lg cursor-pointer hover:border-white/[0.12] transition-all group">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-400 font-mono uppercase">Helpful Git Tips</span>
              <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors">Show tips and guides in the app</span>
            </div>
            <input
              type="checkbox"
              checked={gitTips}
              onChange={(e) => setGitTips(e.target.checked)}
              className="w-4 h-4 rounded border-white/[0.1] bg-slate-900 accent-[#7C5CFF] cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between py-2.5 px-3 bg-slate-950/40 border border-white/[0.06] rounded-lg cursor-pointer hover:border-white/[0.12] transition-all group">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-400 font-mono uppercase">Repository Insights</span>
              <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors">Display analytics by default</span>
            </div>
            <input
              type="checkbox"
              checked={repoInsights}
              onChange={(e) => setRepoInsights(e.target.checked)}
              className="w-4 h-4 rounded border-white/[0.1] bg-slate-900 accent-[#7C5CFF] cursor-pointer"
            />
          </label>

          <button
            onClick={handleSavePreferences}
            className="mt-2 btn btn-secondary flex items-center justify-center gap-2 py-2 px-4 !text-xs cursor-pointer"
          >
            {isSaved ? (
              <span>✓ Preferences Saved</span>
            ) : (
              <span>Save Preferences</span>
            )}
          </button>
        </div>

        {/* SECTION 4: Danger Zone */}
        <div className="gitsense-card p-6 flex flex-col gap-4 border-red-500/[0.15] bg-red-950/[0.08]">
          <div className="flex items-center gap-2 mb-1">
            <Code size={16} className="text-red-400" />
            <h3 className="text-sm font-semibold text-red-300">Danger Zone</h3>
          </div>

          <button
            onClick={handleClearData}
            className="flex items-center justify-between py-2.5 px-3 bg-slate-950/60 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-2 text-left">
              <Trash2 size={15} className="text-red-400 group-hover:text-red-300 transition-colors" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-red-300 group-hover:text-red-200 transition-colors">Clear Local App Data</span>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors">Resets preferences only (not your profile)</span>
              </div>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center justify-between py-2.5 px-3 bg-slate-950/60 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-2 text-left">
              <LogOut size={15} className="text-red-400 group-hover:text-red-300 transition-colors" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-red-300 group-hover:text-red-200 transition-colors">Log Out</span>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors">Sign out of your account</span>
              </div>
            </div>
          </button>
        </div>

      </div>
    </SubPageLayout>
  );
}
