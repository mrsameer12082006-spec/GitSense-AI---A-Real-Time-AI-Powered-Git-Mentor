import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Mail, Lock, User, CheckCircle2 } from 'lucide-react';

const FLOATING_COMMANDS_CONFIG = [
  { text: 'git commit -m "feat: init auth"', top: '6%', duration: 10, delay: 0, color: '#A78BFA' }, // Violet-400
  { text: 'git checkout -b feature/auth', top: '12%', duration: 10, delay: 5, color: '#67E8F9' }, // Cyan-300
  { text: 'git push origin main', top: '18%', duration: 10, delay: 0, color: '#4ADE80' }, // Green-400
  { text: 'git pull --rebase origin dev', top: '24%', duration: 10, delay: 5, color: '#FCD34D' }, // Amber-300
  { text: 'git status', top: '30%', duration: 10, delay: 0, color: '#FFFFFF' }, // White
  { text: 'git merge feature/auth', top: '36%', duration: 10, delay: 5, color: '#A78BFA' },
  { text: 'git clone https://github.com/delmora/gitsense', top: '42%', duration: 10, delay: 0, color: '#67E8F9' },
  { text: 'git stash pop', top: '48%', duration: 10, delay: 5, color: '#4ADE80' },
  { text: 'git log --oneline -n 5', top: '54%', duration: 10, delay: 0, color: '#FFFFFF' },
  { text: 'git rebase -i HEAD~3', top: '60%', duration: 10, delay: 5, color: '#FCD34D' },
  { text: 'git branch -a', top: '66%', duration: 10, delay: 0, color: '#A78BFA' },
  { text: 'git diff main..feature', top: '72%', duration: 10, delay: 5, color: '#67E8F9' },
  { text: 'git add .', top: '78%', duration: 10, delay: 0, color: '#4ADE80' },
  { text: 'git fetch --all', top: '84%', duration: 10, delay: 5, color: '#FCD34D' },
  { text: 'git reset --hard HEAD~1', top: '90%', duration: 10, delay: 0, color: '#FFFFFF' }
];

export default function AuthPage({ initialMode }) {
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormSubmitted(true);
    setTimeout(() => {
      setFormSubmitted(false);
      // Reset form and go to home page
      window.location.hash = '#home';
    }, 2000);
  };

  // Animation variants for the sliding overlay panel
  const overlayVariants = {
    login: {
      x: '100%',
      borderTopLeftRadius: '90px',
      borderBottomLeftRadius: '90px',
      borderTopRightRadius: '16px',
      borderBottomRightRadius: '16px',
    },
    signup: {
      x: '0%',
      borderTopLeftRadius: '16px',
      borderBottomLeftRadius: '16px',
      borderTopRightRadius: '90px',
      borderBottomRightRadius: '90px',
    },
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden select-none z-0">
      
      {/* Soft & Dark Ambient Glow Blobs in Background (makes the background darker, boosting command visibility) */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-[#7C5CFF]/18 to-[#00D4FF]/12 blur-[130px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '10s' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#00D4FF]/18 to-[#EC4899]/10 blur-[135px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="absolute top-[30%] left-[20%] w-[500px] h-[500px] rounded-full bg-gradient-to-r from-[#7C5CFF]/06 to-[#EC4899]/06 blur-[110px] pointer-events-none z-0" />

      {/* Floating Git Commands (aligned horizontally on 15 distinct, non-overlapping lanes for a clean, low-randomness grid flow) */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        {FLOATING_COMMANDS_CONFIG.map((cmd, idx) => (
          <motion.div
            key={idx}
            initial={{ x: '-380px', opacity: 0 }}
            animate={{ 
              x: '105vw',
              opacity: [0, 0.24, 0.24, 0] 
            }}
            transition={{
              duration: cmd.duration,
              delay: cmd.delay,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute font-mono text-lg md:text-2xl font-bold select-none"
            style={{
              top: cmd.top,
              color: cmd.color,
              textShadow: `0 0 10px ${cmd.color}45`
            }}
          >
            {cmd.text}
          </motion.div>
        ))}
      </div>

      {/* Top Header / Back Button */}
      <div className="absolute top-6 left-6 z-30">
        <button
          onClick={() => (window.location.hash = '#home')}
          className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors duration-200 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </button>
      </div>

      {/* Main Container Card: Styled with double-glow shadows and brighter borders (rgba background for increased transparency) */}
      <div 
        className="relative w-full max-w-[780px] min-h-[500px] gitsense-card spotlight-border overflow-hidden flex flex-row border border-[#7C5CFF]/30 hover:border-[#00D4FF]/40 z-20 shadow-[0_0_60px_rgba(124,92,255,0.25)] transition-all duration-500"
        style={{ background: 'rgba(15, 22, 41, 0.35)' }}
      >
        
        {/* Success Modal overlay */}
        <AnimatePresence>
          {formSubmitted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0B1020]/95 z-50 flex flex-col items-center justify-center text-center p-6"
            >
              <motion.div
                initial={{ scale: 0.6, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 15 }}
                className="w-16 h-16 rounded-full bg-[#00E38C]/15 border border-[#00E38C]/30 text-[#00E38C] flex items-center justify-center mb-4"
              >
                <CheckCircle2 size={32} />
              </motion.div>
              <h4 className="text-xl font-heading font-bold text-white mb-2">
                {isSignUp ? 'Account Created!' : 'Successfully Logged In!'}
              </h4>
              <p className="text-sm text-slate-400">
                Welcome to GitSense AI. Redirecting you to the workspace...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── LEFT HALF: Login Form ── */}
        <motion.div
          animate={{
            opacity: isSignUp ? 0 : 1,
            pointerEvents: isSignUp ? 'none' : 'auto',
            x: isSignUp ? -30 : 0,
          }}
          transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          className="absolute left-0 top-0 w-1/2 h-full flex flex-col justify-center px-12 z-10"
        >
          <h3 
            className="text-2xl font-bold font-heading text-center gradient-text"
            style={{ marginBottom: '32px' }}
          >
            Log In
          </h3>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-[#00D4FF]">
                <Mail size={16} />
              </span>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Email"
                className="w-full pl-10 pr-4 py-3 bg-[#060913]/60 border border-white/[0.1] rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.2)] transition-all duration-300"
              />
            </div>
            
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-[#00D4FF]">
                <Lock size={16} />
              </span>
              <input
                type="password"
                name="password"
                required
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Password"
                className="w-full pl-10 pr-4 py-3 bg-[#060913]/60 border border-white/[0.1] rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.2)] transition-all duration-300"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-3 bg-gradient-to-r from-[#7C5CFF] via-[#8B5CF6] to-[#00D4FF] text-white font-bold font-heading rounded-xl shadow-lg hover:shadow-[0_0_25px_rgba(124,92,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all text-xs tracking-wider uppercase cursor-pointer"
            >
              Log In
            </button>
          </form>
        </motion.div>

        {/* ── RIGHT HALF: Signup Form ── */}
        <motion.div
          animate={{
            opacity: isSignUp ? 1 : 0,
            pointerEvents: isSignUp ? 'auto' : 'none',
            x: isSignUp ? 0 : 30,
          }}
          transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          className="absolute right-0 top-0 w-1/2 h-full flex flex-col justify-center px-12 z-10"
        >
          <h3 
            className="text-2xl font-bold font-heading text-center gradient-text"
            style={{ marginBottom: '32px' }}
          >
            Create Account
          </h3>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-[#00D4FF]">
                <User size={16} />
              </span>
              <input
                type="text"
                name="name"
                required={isSignUp}
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Name"
                className="w-full pl-10 pr-4 py-3 bg-[#060913]/60 border border-white/[0.1] rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.2)] transition-all duration-300"
              />
            </div>

            <div className="relative">
              <span className="absolute left-3 top-3.5 text-[#00D4FF]">
                <Mail size={16} />
              </span>
              <input
                type="email"
                name="email"
                required={isSignUp}
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Email"
                className="w-full pl-10 pr-4 py-3 bg-[#060913]/60 border border-white/[0.1] rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.2)] transition-all duration-300"
              />
            </div>
            
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-[#00D4FF]">
                <Lock size={16} />
              </span>
              <input
                type="password"
                name="password"
                required={isSignUp}
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Password"
                className="w-full pl-10 pr-4 py-3 bg-[#060913]/60 border border-white/[0.1] rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.2)] transition-all duration-300"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-3 bg-gradient-to-r from-[#7C5CFF] via-[#8B5CF6] to-[#00D4FF] text-white font-bold font-heading rounded-xl shadow-lg hover:shadow-[0_0_25px_rgba(124,92,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all text-xs tracking-wider uppercase cursor-pointer"
            >
              Sign Up
            </button>
          </form>
        </motion.div>

        {/* ── SLIDING OVERLAY PANEL ── */}
        <motion.div
          animate={isSignUp ? 'signup' : 'login'}
          variants={overlayVariants}
          transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
          className="absolute left-0 top-0 w-1/2 h-full bg-gradient-to-br from-[#7C5CFF]/45 via-[#6366F1]/45 to-[#00D4FF]/50 backdrop-blur-xl z-20 flex flex-col justify-center items-center overflow-hidden shadow-xl border border-white/15"
        >
          {/* Glass sheen overlay & animated inner ambient glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2),transparent_60%)] pointer-events-none" />
          <motion.div 
            animate={{ 
              scale: [1, 1.15, 1],
              opacity: [0.3, 0.45, 0.3]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute top-[-20%] left-[-20%] w-[300px] h-[300px] rounded-full bg-[#00D4FF]/25 blur-3xl pointer-events-none" 
          />

          <AnimatePresence mode="wait">
            {isSignUp ? (
              <motion.div
                key="signup-panel"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center px-10 text-center text-white"
              >
                <h3 className="text-2xl font-bold font-heading text-white text-glow" style={{ marginBottom: '20px' }}>
                  Welcome Back!
                </h3>
                <button
                  type="button"
                  onClick={() => setIsSignUp(false)}
                  className="px-8 py-2.5 bg-transparent border border-white/50 text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-white/10 hover:border-white hover:shadow-[0_0_15px_rgba(255,255,255,0.25)] transition-all cursor-pointer"
                >
                  Log In
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="login-panel"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center px-10 text-center text-white"
              >
                <h3 className="text-2xl font-bold font-heading text-white text-glow" style={{ marginBottom: '20px' }}>
                  Hello, Friend!
                </h3>
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className="px-8 py-2.5 bg-transparent border border-white/50 text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-white/10 hover:border-white hover:shadow-[0_0_15px_rgba(255,255,255,0.25)] transition-all cursor-pointer"
                >
                  Sign Up
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </div>
    </div>
  );
}
