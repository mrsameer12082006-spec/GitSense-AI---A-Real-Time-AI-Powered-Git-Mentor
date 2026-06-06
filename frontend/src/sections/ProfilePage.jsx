import React, { useState, useEffect } from 'react';
import SubPageLayout from '../components/SubPageLayout';
import { User, Mail, Save, Check, AlertCircle } from 'lucide-react';

const GithubIcon = ({ size = 15, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [github, setGithub] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load user profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('gitsense_token');
        if (!token) {
          setError('Session expired. Please log in again.');
          setTimeout(() => window.location.hash = '#login', 1500);
          return;
        }

        const API_URL = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
          localStorage.removeItem('gitsense_token');
          localStorage.removeItem('gitsense_user');
          window.location.hash = '#login';
          return;
        }

        if (!res.ok) {
          throw new Error('Failed to load profile');
        }

        const data = await res.json();
        if (data.user) {
          setName(data.user.name || '');
          setEmail(data.user.email || '');
          setGithub(data.user.githubLink || '');
          
          // Sync with localStorage
          localStorage.setItem('gitsense_user', JSON.stringify({
            ...data.user,
            avatarInitial: data.user.name?.charAt(0)?.toUpperCase() || 'U'
          }));
        }
      } catch (err) {
        console.error('Error loading profile:', err);
        setError('Failed to load profile. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    // Validate inputs
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('gitsense_token');
      const API_URL = import.meta.env.VITE_API_URL || '';

      const res = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          githubLink: github.trim() || ''
        })
      });

      if (res.status === 401) {
        localStorage.removeItem('gitsense_token');
        localStorage.removeItem('gitsense_user');
        window.location.hash = '#login';
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      const data = await res.json();
      if (data.user) {
        // Sync with localStorage
        localStorage.setItem('gitsense_user', JSON.stringify({
          ...data.user,
          avatarInitial: data.user.name?.charAt(0)?.toUpperCase() || 'U'
        }));
      }

      setIsSaved(true);
      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setIsSaved(false), 2500);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const initial = name.trim().charAt(0).toUpperCase() || 'U';

  if (loading) {
    return (
      <SubPageLayout activeTab="">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1 text-left">
            <h2 className="text-2xl font-extrabold tracking-tight text-white font-heading">User Profile</h2>
            <p className="text-sm text-slate-400">View and update your personal developer details.</p>
          </div>
          <div className="gitsense-card p-8 flex items-center justify-center border-white/[0.08] bg-[#0b1220]/70 h-64">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-[#7C5CFF] border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-slate-400">Loading profile...</p>
            </div>
          </div>
        </div>
      </SubPageLayout>
    );
  }

  return (
    <SubPageLayout activeTab="">
      <div className="flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex flex-col gap-1 text-left">
          <h2 className="text-2xl font-extrabold tracking-tight text-white font-heading">User Profile</h2>
          <p className="text-sm text-slate-400">View and update your personal developer details.</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="gitsense-card p-4 flex items-center gap-3 border-red-500/30 bg-red-950/20 rounded-lg">
            <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {successMsg && (
          <div className="gitsense-card p-4 flex items-center gap-3 border-[#00E38C]/30 bg-[#00E38C]/10 rounded-lg">
            <Check size={18} className="text-[#00E38C] flex-shrink-0" />
            <p className="text-sm text-[#00E38C]">{successMsg}</p>
          </div>
        )}

        {/* Card */}
        <div className="gitsense-card p-8 flex flex-col md:flex-row gap-8 items-center border-white/[0.08] bg-[#0b1220]/70">
          
          {/* Avatar side */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full border-2 border-dashed border-[#7C5CFF]/30 bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] flex items-center justify-center text-white text-3xl font-heading font-bold shadow-[0_0_24px_rgba(124,92,255,0.15)] relative">
              {initial}
              <div className="absolute inset-0 rounded-full border-4 border-[#0b1220]/80" />
            </div>
            <span className="text-[10px] font-mono font-bold text-[#00D4FF] uppercase bg-[#00D4FF]/10 border border-[#00D4FF]/25 px-2 py-0.5 rounded-full">
              Developer Account
            </span>
          </div>

          {/* Form side */}
          <form onSubmit={handleSave} className="flex-1 w-full flex flex-col gap-4 text-left">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono font-bold text-slate-400 uppercase">Full Name</label>
              <div className="relative flex items-center bg-slate-950/80 border border-white/[0.06] hover:border-white/[0.12] focus-within:border-[#7C5CFF]/60 rounded-xl px-3.5 py-2.5 transition-all">
                <User size={15} className="text-slate-500 mr-2.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-600 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono font-bold text-slate-400 uppercase">Email Address (Read-Only)</label>
              <div className="relative flex items-center bg-slate-950/80 border border-white/[0.06] rounded-xl px-3.5 py-2.5 opacity-60">
                <Mail size={15} className="text-slate-500 mr-2.5" />
                <input
                  type="email"
                  value={email}
                  disabled={true}
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-600 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-slate-500">Email cannot be changed in this version</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono font-bold text-slate-400 uppercase">GitHub Profile URL</label>
              <div className="relative flex items-center bg-slate-950/80 border border-white/[0.06] hover:border-white/[0.12] focus-within:border-[#7C5CFF]/60 rounded-xl px-3.5 py-2.5 transition-all">
                <GithubIcon size={15} className="text-slate-500 mr-2.5" />
                <input
                  type="url"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  disabled={saving}
                  placeholder="https://github.com/username"
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-600 disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-2 btn btn-primary flex items-center justify-center gap-2 self-start py-2.5 px-6 !text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaved ? (
                <>
                  <Check size={15} className="text-[#00E38C]" />
                  <span>Profile Saved</span>
                </>
              ) : saving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={15} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </SubPageLayout>
  );
}
