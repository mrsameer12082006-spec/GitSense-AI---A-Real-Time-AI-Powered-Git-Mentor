import React, { useState, useEffect } from 'react';
import CursorSpotlight from './components/CursorSpotlight';
import ParticleCanvas from './components/ParticleCanvas';
import Navbar from './sections/Navbar';
import Hero from './sections/Hero';
import VisualizerSection from './sections/VisualizerSection';
import AIShowcase from './sections/AIShowcase';
import Features from './sections/Features';
import HowItWorks from './sections/HowItWorks';
import Developers from './sections/Developers';
import AuthPage from './sections/AuthPage';
import Dashboard from './sections/Dashboard';
import VisualizerPage from './sections/VisualizerPage';
import ProfilePage from './sections/ProfilePage';
import SettingsPage from './sections/SettingsPage';
import AboutUsPage from './sections/AboutUsPage';
import PrivacyPage from './sections/PrivacyPage';
import { ShaderAnimation } from './components/ui/shader-animation';

export default function App() {
  const [currentPage, setCurrentPage] = useState(() => {
    const hash = window.location.hash;
    if (hash === '#login' || hash === '#signup') return 'auth';
    if (hash === '#dashboard' || hash.startsWith('#dashboard')) return 'dashboard';
    if (hash === '#visualizer-page') return 'visualizer';
    if (hash === '#profile') return 'profile';
    if (hash === '#settings') return 'settings';
    if (hash === '#about-us') return 'about';
    if (hash === '#terms') return 'terms';
    return 'home';
  });

  const [authMode, setAuthMode] = useState(() => {
    const hash = window.location.hash;
    return hash.startsWith('#signup') ? 'signup' : 'login';
  });

  useEffect(() => {
    // Check if token exists in URL (e.g., #dashboard?token=xyz or /?token=xyz)
    const hash = window.location.hash;
    const search = window.location.search;
    
    let token = null;
    if (hash.includes('token=')) {
      const match = hash.match(/token=([^&]+)/);
      if (match && match[1]) token = match[1];
    } else if (search.includes('token=')) {
      const match = search.match(/token=([^&]+)/);
      if (match && match[1]) token = match[1];
    }
    
    if (token) {
      if (window.opener) {
        // We are in the OAuth popup window
        window.opener.postMessage({ type: 'GITSENSE_OAUTH_TOKEN', token }, '*');
        window.close();
      } else {
        // Direct link / redirect in main window
        localStorage.setItem('gitsense_token', token);
        window.location.hash = '#dashboard';
      }
    }

    if (hash.includes('github=connected')) {
      if (window.opener) {
        // We are in the OAuth popup window
        window.opener.postMessage({ type: 'GITSENSE_GITHUB_CONNECTED' }, '*');
        window.close();
      }
    }

    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#login') {
        setCurrentPage('auth');
        setAuthMode('login');
      } else if (hash === '#signup') {
        setCurrentPage('auth');
        setAuthMode('signup');
      } else if (hash === '#dashboard' || hash.startsWith('#dashboard')) {
        setCurrentPage('dashboard');
      } else if (hash === '#visualizer-page') {
        setCurrentPage('visualizer');
      } else if (hash === '#profile') {
        setCurrentPage('profile');
      } else if (hash === '#settings') {
        setCurrentPage('settings');
      } else if (hash === '#about-us') {
        setCurrentPage('about');
      } else if (hash === '#terms') {
        setCurrentPage('terms');
      } else if (hash === '#home' || !hash) {
        setCurrentPage('home');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    
    // Initial theme load
    const savedTheme = localStorage.getItem('gitsense_theme');
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text)] relative overflow-x-hidden">

      {/* Layer 0 — fixed canvas background */}
      <ParticleCanvas />

      {/* Layer 0.5 — fixed shader background */}
      <div className="fixed inset-0 z-0 opacity-18 pointer-events-none overflow-hidden">
        <ShaderAnimation />
      </div>

      {/* Layer 1 — mouse-based spotlight tracker */}
      <CursorSpotlight />

      {/* Layer 2 — page layout */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {currentPage === 'home' ? (
          <>
            <Navbar />
            <main className="flex-1">
              <Hero />
              <VisualizerSection />
              <AIShowcase />
              <Features />
              <HowItWorks />
              <Developers />
            </main>
          </>
        ) : currentPage === 'dashboard' ? (
          <Dashboard />
        ) : currentPage === 'visualizer' ? (
          <VisualizerPage />
        ) : currentPage === 'profile' ? (
          <ProfilePage />
        ) : currentPage === 'settings' ? (
          <SettingsPage />
        ) : currentPage === 'about' ? (
          <AboutUsPage />
        ) : currentPage === 'terms' ? (
          <PrivacyPage />
        ) : (
          <AuthPage key={authMode} initialMode={authMode} />
        )}
      </div>
    </div>
  );
}
