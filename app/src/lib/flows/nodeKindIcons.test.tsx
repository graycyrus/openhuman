/**
 * The icon and tile maps are the canvas's only source of node iconography, and
 * both are `Record<NodeKind, …>` — so TypeScript already guarantees they are
 * exhaustive. What it cannot guarantee is the *runtime* half of the contract:
 * that a kind this build has never heard of still renders (a graph saved by a
 * newer build reaches the renderer as `unknown`, and there is no error boundary
 * around `<ReactFlow>`), and that the two maps stay keyed alike.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  NODE_KIND_ICON,
  NODE_KIND_TILE,
  NodeKindGlyph,
  nodeKindIcon,
  nodeKindTile,
} from './nodeKindIcons';
import type { NodeKind } from './types';

const KINDS = Object.keys(NODE_KIND_ICON) as NodeKind[];

describe('nodeKindIcons', () => {
  it('covers all 14 node kinds in both maps, keyed identically', () => {
    expect(KINDS).toHaveLength(14);
    expect(Object.keys(NODE_KIND_TILE).sort()).toEqual([...KINDS].sort());
  });

  it('resolves an icon and a tile for every kind', () => {
    for (const kind of KINDS) {
      expect(nodeKindIcon(kind)).toBeTypeOf('function');
      expect(nodeKindTile(kind)).toMatch(/bg-/);
    }
  });

  it('falls back rather than throwing for a kind this build does not know', () => {
    // A graph saved by a newer build can carry a 15th kind. It must render as a
    // plain node, never crash the canvas.
    expect(() => nodeKindIcon('some_future_kind')).not.toThrow();
    expect(nodeKindIcon('some_future_kind')).toBeTypeOf('function');
    expect(nodeKindTile('some_future_kind')).toMatch(/bg-/);
  });

  it('renders a glyph for a known kind', () => {
    const { container } = render(<NodeKindGlyph kind="http_request" className="h-4 w-4" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class')).toContain('h-4');
  });

  it('renders a glyph for an unknown kind without throwing', () => {
    const { container } = render(<NodeKindGlyph kind="some_future_kind" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('honours an explicit icon override', () => {
    // The native OpenHuman tool is a `tool_call` that needs its own glyph
    // without its own NodeKind — the override is what makes that possible.
    const Custom = () => <svg data-testid="custom-glyph" />;
    const { getByTestId } = render(<NodeKindGlyph kind="tool_call" icon={Custom} />);
    expect(getByTestId('custom-glyph')).toBeInTheDocument();
  });
});
