/**
 * mockDashboardData.js
 * ────────────────────────────────────────────────────────────────
 * Central placeholder / mock data file for the GitSense.AI Dashboard.
 *
 * TODO: Replace this with backend/API data later.
 *
 * Every value exported here is consumed by Dashboard components.
 * When the backend is ready, swap these exports with real API responses
 * or replace the imports in each component with live data hooks.
 * ────────────────────────────────────────────────────────────────
 */

// ── User ────────────────────────────────────────────────────────
// TODO: Replace this with backend/API data later
export const currentUser = {
  get name() {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('gitsense_profile_name') || 'Kartik Sharma';
    }
    return 'Kartik Sharma';
  },
  get email() {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('gitsense_profile_email') || 'kartik.s1280@gmail.com';
    }
    return 'kartik.s1280@gmail.com';
  },
  get avatarInitial() {
    const n = this.name;
    return n.trim().charAt(0).toUpperCase() || 'K';
  }
};

// ── Repository Connection State ─────────────────────────────────
// TODO: Replace this with backend/API data later
export const isRepositoryConnected = true;

// TODO: Replace this with backend/API data later
export const connectedRepository = {
  name: 'gitsense-dashboard',
  url: 'https://github.com/manikchauhan/gitsense-dashboard',
  branch: 'feature/login',
  ahead: '2 commits ahead',
  health: '94% safe',
};

// ── GitHub Import Dropdown Options ──────────────────────────────
// TODO: Replace this with backend/API data later
export const githubImportOptions = [
  { id: 'connect', label: 'Connect GitHub Account', icon: 'GitBranch' },
  { id: 'import', label: 'Import Repository', icon: 'Download' },
  { id: 'paste', label: 'Paste Repository URL', icon: 'Link' },
];

// ── Repository Insights (Right Sidebar) ─────────────────────────
// TODO: Replace this with backend/API data later
export const repositoryInsights = {
  emptyStateText: 'Connect a GitHub repository to view repository insights.',
  commits: 482,
  openPRs: 3,
  issues: 12,
  contributors: 8,
  securityStatus: 'Clean',
  latestCommits: [
    { hash: '92cd99b', message: 'fix: login router logic', author: 'Manik', time: '2m ago' },
    { hash: 'a12bc8f', message: 'feat: auth middleware base', author: 'Ayesh', time: '5m ago' },
    { hash: '7c3b28d', message: 'docs: update readme guidelines', author: 'Sameer', time: '15m ago' }
  ],
  activePRs: [
    { id: '#12', title: 'Add dashboard layout routing', status: 'In Review', author: 'Sameer' },
    { id: '#11', title: 'Setup auth token persistence', status: 'Approved', author: 'Manik' }
  ],
  pipelines: [
    { name: 'Build #10843', status: 'Passed' },
    { name: 'Test Suite #10842', status: 'Failed' }
  ]
};

// ── Sidebar Empty State ─────────────────────────────────────────
// TODO: Replace this with backend/API data later
export const sidebarEmptyStateText =
  'No conversations yet. Connect a repository to start.';

// ── Chat Input ──────────────────────────────────────────────────
// TODO: Replace this with backend/API data later
export const chatInputPlaceholder = 'Ask about your connected repository...';

// ── Welcome / Greeting ──────────────────────────────────────────
// TODO: Replace this with backend/API data later
export const welcomeSubtitle = 'Connect a GitHub repository to get started.';

/**
 * Returns a time-based greeting string.
 * @param {string} userName — the display name of the current user
 * @returns {string}
 */
export function getGreeting(userName) {
  const hour = new Date().getHours();
  let period;
  if (hour >= 5 && hour < 12) {
    period = 'morning';
  } else if (hour >= 12 && hour < 17) {
    period = 'afternoon';
  } else {
    period = 'evening';
  }
  return `Good ${period}, ${userName}. Welcome back.`;
}
