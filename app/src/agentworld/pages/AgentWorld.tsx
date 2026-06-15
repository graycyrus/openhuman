/**
 * AgentWorld — section host for the tiny.place Agent World integration.
 *
 * Renders a sub-navigation bar (chip tabs) and mounts the active section.
 * For Wave 0 only Explore is implemented; the other six sections are stubs
 * that fan-out agents will fill in by appending Route entries at the
 * marked append point.
 *
 * Sub-navigation keys: agentWorld.explore (+ future section keys).
 */
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { useT } from '../../lib/i18n/I18nContext';
import ExploreSection from './ExploreSection';
import ProfilesSection from './ProfilesSection';

// Sub-nav section definition (one per section).
interface AgentWorldSection {
  slug: string;
  labelKey: string;
}

// === AGENT-WORLD SECTION ROUTES (append one per section) ===
// Format: { slug: '<path-segment>', labelKey: 'agentWorld.<name>' }
// Fan-out agents: add a row here AND a <Route> below AND an i18n key.
const SECTIONS: AgentWorldSection[] = [
  { slug: 'explore', labelKey: 'agentWorld.explore' },
  // { slug: 'directory',   labelKey: 'agentWorld.directory'   },  // ← Directory agent
  // { slug: 'identities',  labelKey: 'agentWorld.identities'  },  // ← Identities agent
  { slug: 'profiles', labelKey: 'agentWorld.profiles' },
  // { slug: 'marketplace', labelKey: 'agentWorld.marketplace' },  // ← Marketplace agent
  // { slug: 'messaging',   labelKey: 'agentWorld.messaging'   },  // ← Messaging agent
  // { slug: 'settings',    labelKey: 'agentWorld.settings'    },  // ← Settings agent
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
    <div className="flex flex-col h-full">
      {/* Sub-navigation chips */}
      <nav className="flex gap-2 px-4 py-2 border-b border-gray-800 overflow-x-auto shrink-0">
        {SECTIONS.map(section => (
          <button
            key={section.slug}
            onClick={() => navigate(section.slug)}
            data-active={activeSlug === section.slug}
            className={[
              'px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
              activeSlug === section.slug
                ? 'bg-ocean text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800',
            ].join(' ')}>
            {t(section.labelKey)}
          </button>
        ))}
      </nav>

      {/* Section routes */}
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<Navigate to="explore" replace />} />
          <Route path="explore" element={<ExploreSection />} />
          {/* === AGENT-WORLD SECTION ROUTES (append one per section) === */}
          {/* Directory agent:   <Route path="directory"   element={<DirectorySection />} /> */}
          {/* Identities agent:  <Route path="identities"  element={<IdentitiesSection />} /> */}
          <Route path="profiles" element={<ProfilesSection />} />
          {/* Marketplace agent: <Route path="marketplace" element={<MarketplaceSection />} /> */}
          {/* Messaging agent:   <Route path="messaging"   element={<MessagingSection />} /> */}
          {/* Settings agent:    <Route path="settings"    element={<AgentWorldSettings />} /> */}
          <Route path="*" element={<Navigate to="explore" replace />} />
        </Routes>
      </div>
    </div>
  );
}
