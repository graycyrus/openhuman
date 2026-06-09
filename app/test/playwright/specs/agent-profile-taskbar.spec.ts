import { expect, type Page, test } from '@playwright/test';

import {
  bootAuthenticatedPage,
  dismissWalkthroughIfPresent,
  waitForAppReady,
} from '../helpers/core-rpc';

/**
 * Phase 6 IA revamp: the agent-profile switcher was removed from the bottom
 * taskbar. The avatar button now shows the signed-in user's initials and opens
 * an account menu (Account · Billing · Rewards · Invites · Wallet).
 *
 * This spec was previously "agent-profile-taskbar" — it now covers the
 * account avatar menu that replaced the profile switcher.
 */

async function openAvatarMenu(page: Page): Promise<void> {
  // The avatar button is aria-labelled via nav.avatarMenu.account ("Account")
  const avatarBtn = page
    .getByRole('button', { name: /Account/i })
    .or(page.locator('[aria-haspopup="menu"]').last());
  await expect(avatarBtn).toBeVisible({ timeout: 10_000 });
  await avatarBtn.click();
}

test.describe('Account avatar menu in bottom taskbar', () => {
  test('avatar button is visible and opens the account menu', async ({ page }) => {
    await bootAuthenticatedPage(page, 'pw-agent-profile-taskbar', '/home');
    await waitForAppReady(page);
    await dismissWalkthroughIfPresent(page);

    await openAvatarMenu(page);

    // The menu should be present as a [role="menu"]
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: 5_000 });
  });

  test('account menu contains expected items', async ({ page }) => {
    await bootAuthenticatedPage(page, 'pw-agent-profile-taskbar-items', '/home');
    await waitForAppReady(page);
    await dismissWalkthroughIfPresent(page);

    await openAvatarMenu(page);

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    // Verify core account menu items exist (cloud-only items may be hidden for local sessions)
    await expect(menu.getByRole('menuitem', { name: /Account/i })).toBeVisible();
  });

  test('account menu item navigates to settings/account', async ({ page }) => {
    await bootAuthenticatedPage(page, 'pw-agent-profile-taskbar-nav', '/home');
    await waitForAppReady(page);
    await dismissWalkthroughIfPresent(page);

    await openAvatarMenu(page);

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /Account/i }).click();

    await expect
      .poll(async () => page.evaluate(() => window.location.hash), { timeout: 10_000 })
      .toContain('/settings/account');
  });

  test('pressing Escape closes the account menu', async ({ page }) => {
    await bootAuthenticatedPage(page, 'pw-agent-profile-taskbar-escape', '/home');
    await waitForAppReady(page);
    await dismissWalkthroughIfPresent(page);

    await openAvatarMenu(page);
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
});
