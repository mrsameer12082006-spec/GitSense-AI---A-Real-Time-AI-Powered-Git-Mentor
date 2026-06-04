import React, { useState, useEffect } from 'react';
import SubPageLayout from '../components/SubPageLayout';
import { User, Mail, Save, Check } from 'lucide-react';

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
  const [name, setName] = useState(() => localStorage.getItem('gitsense_profile_name') || 'Kartik Sharma');
  const [email, setEmail] = useState(() => localStorage.getItem('gitsense_profile_email') || 'kartik.s1280@gmail.com');
  const [github, setGithub] = useState(() => localStorage.getItem('gitsense_profile_github') || 'https://github.com/kartik1280');
  
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem('gitsense_profile_name', name);
    localStorage.setItem('gitsense_profile_email', email);
    localStorage.setItem('gitsense_profile_github', github);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const initial = name.trim().charAt(0).toUpperCase() || 'K';

  return (
    <SubPageLayout activeTab="">
      <div className="flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex flex-col gap-1 text-left">
          <h2 className="text-2xl font-extrabold tracking-tight text-white font-heading">User Profile</h2>
          <p className="text-sm text-slate-400">View and update your personal developer details.</p>
        </div>

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
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-600"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono font-bold text-slate-400 uppercase">Email Address</label>
              <div className="relative flex items-center bg-slate-950/80 border border-white/[0.06] hover:border-white/[0.12] focus-within:border-[#7C5CFF]/60 rounded-xl px-3.5 py-2.5 transition-all">
                <Mail size={15} className="text-slate-500 mr-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-600"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono font-bold text-slate-400 uppercase">GitHub Profile URL</label>
              <div className="relative flex items-center bg-slate-950/80 border border-white/[0.06] hover:border-white/[0.12] focus-within:border-[#7C5CFF]/60 rounded-xl px-3.5 py-2.5 transition-all">
                <GithubIcon size={15} className="text-slate-500 mr-2.5" />
                <input
                  type="url"
                  required
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-600"
                />
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 btn btn-primary flex items-center justify-center gap-2 self-start py-2.5 px-6 !text-sm cursor-pointer"
            >
              {isSaved ? (
                <>
                  <Check size={15} className="text-[#00E38C]" />
                  <span>Profile Saved</span>
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
