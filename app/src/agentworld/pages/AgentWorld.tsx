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
import ProfilesSection from './ProfilesSection';

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
];

export default function AgentWorld() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive the active slug from the current sub-path
  // e.g. /agent-world/explore → 'explore'
  const pathParts = location.pathname.split('/');
  const activeSlug = pathParts[pathParts.length - 1] || 'explore';

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
            onSelect={slug => navigate('/agent-world/' + slug)}
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
          <Route index element={<Navigate to="/agent-world/explore" replace />} />
          <Route path="explore" element={<ExploreSection />} />
          {/* === AGENT-WORLD SECTION ROUTES (append one per section) === */}
          <Route path="directory" element={<DirectorySection />} />
          {/* Directory agent:   done (see above) */}
          {/* Identities agent:  <Route path="identities"  element={<IdentitiesSection />} /> */}
          <Route path="profiles" element={<ProfilesSection />} />
          {/* Marketplace agent: <Route path="marketplace" element={<MarketplaceSection />} /> */}
          {/* Messaging agent:   <Route path="messaging"   element={<MessagingSection />} /> */}
          {/* Settings agent:    <Route path="settings"    element={<SettingsSection />} /> */}
          <Route path="*" element={<Navigate to="/agent-world/explore" replace />} />
        </Routes>
      </TwoPanelLayout>
    </div>
  );
}
