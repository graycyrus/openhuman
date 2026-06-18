/**
 * AgentWorld — section host for the tiny.place Agent World integration.
 *
 * Uses the standard two-pane shell (the same `TwoPanelLayout` + `TwoPaneNav`
 * pattern as Brain / Settings): a resizable left sidebar lists the sections and
 * the active section renders in the right content pane. The section name is
 * carried by the sidebar (no per-section page title), so sections render their
 * own body chrome via `PanelScaffold`.
 *
 * Sub-navigation keys: agentWorld.explore (+ future section keys).
 */
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import TwoPanelLayout from '../../components/layout/TwoPanelLayout';
import TwoPaneNav from '../../components/layout/TwoPaneNav';
import { useT } from '../../lib/i18n/I18nContext';
import DirectorySection from './DirectorySection';
import ExploreSection from './ExploreSection';
import FeedSection from './FeedSection';
import IdentitiesSection from './IdentitiesSection';
import JobsSection from './JobsSection';
import LedgerSection from './LedgerSection';
import MarketplaceSection from './MarketplaceSection';
import MessagingSection from './MessagingSection';
import ProfilesSection from './ProfilesSection';
import SettingsSection from './SettingsSection';

// Sub-nav section definition (one per section).
interface AgentWorldSection {
  slug: string;
  labelKey: string;
  iconPath: string;
}

/** Small inline icon helper for the sidebar nav (matches Brain's). */
const navIcon = (d: string) => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

// === AGENT-WORLD SECTIONS (append one per section) ===
// Format: { slug: '<path-segment>', labelKey: 'agentWorld.<name>', iconPath: '<svg d>' }
// Fan-out agents: add a row here AND a <Route> below AND an i18n key.
const SECTIONS: AgentWorldSection[] = [
  {
    slug: 'feed',
    labelKey: 'agentWorld.feed',
    iconPath:
      'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
  },
  {
    slug: 'ledger',
    labelKey: 'agentWorld.ledger',
    iconPath:
      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
  {
    slug: 'jobs',
    labelKey: 'agentWorld.jobs',
    iconPath:
      'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M3.20898 7H20.791C21.4593 7 22 7.54066 22 8.20898V10.291C22 10.9593 21.4593 11.5 20.791 11.5H3.20898C2.54066 11.5 2 10.9593 2 10.291V8.20898C2 7.54066 2.54066 7 3.20898 7ZM5 11.5V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V11.5',
  },
  {
    slug: 'explore',
    labelKey: 'agentWorld.explore',
    iconPath: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  },
  {
    slug: 'directory',
    labelKey: 'agentWorld.directory',
    iconPath:
      'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  },
  {
    slug: 'profiles',
    labelKey: 'agentWorld.profiles',
    iconPath:
      'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    slug: 'identities',
    labelKey: 'agentWorld.identities',
    iconPath:
      'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0',
  },
  {
    slug: 'marketplace',
    labelKey: 'agentWorld.marketplace',
    iconPath: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  },
  {
    slug: 'settings',
    labelKey: 'agentWorld.settings',
    iconPath:
      'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    slug: 'messaging',
    labelKey: 'agentWorld.messaging',
    iconPath:
      'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
];

export default function AgentWorld() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive the active slug from the current sub-path
  // e.g. /agent-world/explore → 'explore'
  const pathParts = location.pathname.split('/');
  const activeSlug = pathParts[pathParts.length - 1] || 'feed';

  return (
    <div className="h-full">
      <TwoPanelLayout
        id="agent-world"
        // Max-width applied once to the whole panel (sidebar + content) and
        // centered, matching the Brain / settings two-pane shell.
        className="mx-auto h-full w-full max-w-6xl p-4 pt-6"
        defaultSidebarVisible
        defaultSidebarWidth={210}
        minSidebarWidth={170}
        maxSidebarWidth={320}
        seamless
        sidebar={
          <TwoPaneNav
            ariaLabel={t('nav.agentWorld')}
            selected={activeSlug}
            onSelect={slug => navigate(`/agent-world/${slug}`)}
            groups={[
              {
                items: SECTIONS.map(section => ({
                  value: section.slug,
                  label: t(section.labelKey),
                  icon: navIcon(section.iconPath),
                })),
              },
            ]}
            header={
              <div className="min-w-0">
                <h1 className="text-base font-bold text-stone-900 dark:text-neutral-100">
                  {t('nav.agentWorld')}
                </h1>
                <p className="truncate text-xs text-stone-500 dark:text-neutral-400">
                  tiny.place network
                </p>
              </div>
            }
          />
        }>
        <Routes>
          <Route index element={<Navigate to="/agent-world/feed" replace />} />
          <Route path="feed" element={<FeedSection />} />
          <Route path="ledger" element={<LedgerSection />} />
          <Route path="jobs" element={<JobsSection />} />
          <Route path="explore" element={<ExploreSection />} />
          {/* === AGENT-WORLD SECTION ROUTES (append one per section) === */}
          <Route path="directory" element={<DirectorySection />} />
          <Route path="profiles" element={<ProfilesSection />} />
          <Route path="identities" element={<IdentitiesSection />} />
          <Route path="marketplace" element={<MarketplaceSection />} />
          <Route path="messaging" element={<MessagingSection />} />
          <Route path="settings" element={<SettingsSection />} />
          <Route path="*" element={<Navigate to="/agent-world/feed" replace />} />
        </Routes>
      </TwoPanelLayout>
    </div>
  );
}
