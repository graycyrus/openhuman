import { expect, test } from '@playwright/test';

import {
  bootAuthenticatedPage,
  dismissWalkthroughIfPresent,
  waitForAppReady,
} from '../helpers/core-rpc';

test.describe('Insights Dashboard', () => {
  test('renders the memory workspace and actions toolbar', async ({ page }) => {
    // Phase 3: /intelligence → /activity. Memory tab is dev-gated behind
    // developer mode — seed it via persist:theme before boot so the tab renders.
    await page.addInitScript(() => {
      try {
        const raw = localStorage.getItem('persist:theme');
        const parsed: Record<string, string> = raw
          ? (JSON.parse(raw) as Record<string, string>)
          : {};
        parsed.developerMode = JSON.stringify(true);
        localStorage.setItem('persist:theme', JSON.stringify(parsed));
      } catch {}
    });
    await bootAuthenticatedPage(page, 'pw-insights-user', '/activity');
    await waitForAppReady(page);
    // /activity boots on the Tasks tab by default. The walkthrough portal can
    // sit on top of the pill bar and memory-workspace testid only mounts when
    // tab=memory, so we dismiss the overlay and click the Memory pill first.
    await dismissWalkthroughIfPresent(page);
    await page.getByRole('tab', { name: 'Memory', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Memory', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="memory-workspace"]')).toBeVisible();
    await expect(page.locator('[data-testid="memory-actions"]')).toBeVisible();
  });
});
