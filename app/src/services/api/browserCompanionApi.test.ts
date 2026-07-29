import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type BrowserCompanionStatus,
  disableBrowserCompanion,
  enableBrowserCompanion,
  getBrowserCompanionStatus,
  pairBrowserCompanionExtension,
  rotateBrowserCompanionSecret,
  unpairBrowserCompanion,
} from './browserCompanionApi';

const mockCallCoreRpc = vi.fn();
vi.mock('../coreRpcClient', () => ({ callCoreRpc: (...a: unknown[]) => mockCallCoreRpc(...a) }));

/** Every `browser_companion_*` handler wraps its payload via `RpcOutcome::single_log`. */
function cliEnvelope<T>(
  result: T,
  logs: string[] = ['did something']
): { result: T; logs: string[] } {
  return { result, logs };
}

const idleStatus: BrowserCompanionStatus = {
  running: false,
  extension_connected: false,
  paired_extension_id: null,
  relay_url: null,
  shared_tabs: [],
};

const runningStatus: BrowserCompanionStatus = {
  running: true,
  extension_connected: true,
  paired_extension_id: 'abcdefghijklmnopabcdefghijklmnop',
  relay_url: 'ws://127.0.0.1:45001/v1/extension',
  shared_tabs: [{ id: 1, window_id: 1, url: 'https://example.com', title: 'Example' }],
};

describe('browserCompanionApi', () => {
  beforeEach(() => {
    mockCallCoreRpc.mockReset();
  });

  describe('getBrowserCompanionStatus', () => {
    it('calls openhuman.browser_companion_status with no params', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(idleStatus));

      await getBrowserCompanionStatus();

      expect(mockCallCoreRpc).toHaveBeenCalledWith({
        method: 'openhuman.browser_companion_status',
        params: {},
      });
    });

    it('unwraps the { result, logs } envelope', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(runningStatus));

      const result = await getBrowserCompanionStatus();

      expect(result).toEqual(runningStatus);
    });

    it('passes through a bare (unwrapped) payload unchanged', async () => {
      mockCallCoreRpc.mockResolvedValue(idleStatus);

      const result = await getBrowserCompanionStatus();

      expect(result).toEqual(idleStatus);
    });

    it('propagates rejection from callCoreRpc', async () => {
      mockCallCoreRpc.mockRejectedValue(new Error('core unreachable'));

      await expect(getBrowserCompanionStatus()).rejects.toThrow('core unreachable');
    });
  });

  describe('enableBrowserCompanion', () => {
    it('calls openhuman.browser_companion_enable with no params when port omitted', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(runningStatus));

      await enableBrowserCompanion();

      expect(mockCallCoreRpc).toHaveBeenCalledWith({
        method: 'openhuman.browser_companion_enable',
        params: {},
      });
    });

    it('passes port when provided', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(runningStatus));

      await enableBrowserCompanion(45001);

      expect(mockCallCoreRpc).toHaveBeenCalledWith({
        method: 'openhuman.browser_companion_enable',
        params: { port: 45001 },
      });
    });

    it('returns the unwrapped status', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(runningStatus));

      const result = await enableBrowserCompanion();

      expect(result).toEqual(runningStatus);
    });

    it('propagates rejection from callCoreRpc', async () => {
      mockCallCoreRpc.mockRejectedValue(new Error('bind failed'));

      await expect(enableBrowserCompanion()).rejects.toThrow('bind failed');
    });
  });

  describe('disableBrowserCompanion', () => {
    it('calls openhuman.browser_companion_disable with no params', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(idleStatus));

      const result = await disableBrowserCompanion();

      expect(mockCallCoreRpc).toHaveBeenCalledWith({
        method: 'openhuman.browser_companion_disable',
        params: {},
      });
      expect(result).toEqual(idleStatus);
    });

    it('propagates rejection from callCoreRpc', async () => {
      mockCallCoreRpc.mockRejectedValue(new Error('boom'));

      await expect(disableBrowserCompanion()).rejects.toThrow('boom');
    });
  });

  describe('pairBrowserCompanionExtension', () => {
    const pairing = {
      relay_url: 'ws://127.0.0.1:45001/v1/extension',
      pairing_secret: 'super-secret-token',
    };

    it('calls openhuman.browser_companion_pair with extension_id', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(pairing));

      const result = await pairBrowserCompanionExtension('abcdefghijklmnopabcdefghijklmnop');

      expect(mockCallCoreRpc).toHaveBeenCalledWith({
        method: 'openhuman.browser_companion_pair',
        params: { extension_id: 'abcdefghijklmnopabcdefghijklmnop' },
      });
      expect(result).toEqual(pairing);
    });

    it('propagates rejection from callCoreRpc', async () => {
      mockCallCoreRpc.mockRejectedValue(new Error('invalid extension id'));

      await expect(pairBrowserCompanionExtension('bad')).rejects.toThrow('invalid extension id');
    });
  });

  describe('unpairBrowserCompanion', () => {
    it('calls openhuman.browser_companion_unpair with no params', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(idleStatus));

      const result = await unpairBrowserCompanion();

      expect(mockCallCoreRpc).toHaveBeenCalledWith({
        method: 'openhuman.browser_companion_unpair',
        params: {},
      });
      expect(result).toEqual(idleStatus);
    });

    it('propagates rejection from callCoreRpc', async () => {
      mockCallCoreRpc.mockRejectedValue(new Error('boom'));

      await expect(unpairBrowserCompanion()).rejects.toThrow('boom');
    });
  });

  describe('rotateBrowserCompanionSecret', () => {
    const pairing = {
      relay_url: 'ws://127.0.0.1:45001/v1/extension',
      pairing_secret: 'rotated-secret-token',
    };

    it('calls openhuman.browser_companion_rotate_secret with no params', async () => {
      mockCallCoreRpc.mockResolvedValue(cliEnvelope(pairing));

      const result = await rotateBrowserCompanionSecret();

      expect(mockCallCoreRpc).toHaveBeenCalledWith({
        method: 'openhuman.browser_companion_rotate_secret',
        params: {},
      });
      expect(result).toEqual(pairing);
    });

    it('propagates rejection from callCoreRpc', async () => {
      mockCallCoreRpc.mockRejectedValue(new Error('boom'));

      await expect(rotateBrowserCompanionSecret()).rejects.toThrow('boom');
    });
  });
});
