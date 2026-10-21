/**
 * Drop-in replacements for the @web/test-runner-commands functions our tests use. Each one forwards to a Node-side
 * Vitest browser command defined in scripts/vitest/commands.ts, which drives the Playwright page.
 */
import { commands, page } from 'vite-plus/test/browser/context';

type Commands = Record<string, (...args: any[]) => Promise<any>>;
const cmd = commands as unknown as Commands;

export interface SendKeysPayload {
  /** Types the given text, one key at a time. */
  type?: string;
  /** Presses (down + up) a single key, e.g. "Enter" or "Shift+Tab". */
  press?: string;
  /** Holds a key down. */
  down?: string;
  /** Releases a held key. */
  up?: string;
}

export function sendKeys(payload: SendKeysPayload): Promise<void> {
  return cmd.sendKeys(payload);
}

export interface SendMousePayload {
  type: 'move' | 'click' | 'down' | 'up';
  /** [x, y] relative to the test document's viewport. */
  position?: [number, number];
  button?: 'left' | 'middle' | 'right';
}

let mouseMoved = false;

export function sendMouse(payload: SendMousePayload): Promise<void> {
  mouseMoved = true;
  return cmd.sendMouse(payload);
}

export function resetMouse(): Promise<void> {
  mouseMoved = false;
  return cmd.resetMouse();
}

/**
 * Parks the real mouse back in the corner if a test moved it. Every test file shares one Playwright mouse, so a pointer
 * left over an element's position would hover the next test's fixture (web-test-runner gave each file a fresh page).
 */
export async function resetMouseIfMoved(): Promise<void> {
  if (mouseMoved) {
    await resetMouse();
  }
}

export async function setViewport(viewport: { width: number; height: number }): Promise<void> {
  await page.viewport(viewport.width, viewport.height);
}

export interface EmulateMediaPayload {
  media?: 'screen' | 'print' | null;
  colorScheme?: 'dark' | 'light' | 'no-preference' | null;
  reducedMotion?: 'reduce' | 'no-preference' | null;
  forcedColors?: 'active' | 'none' | null;
}

export function emulateMedia(payload: EmulateMediaPayload): Promise<void> {
  return cmd.emulateMedia(payload);
}

/** Reads a text file. The path is relative to the calling test file. */
export function readFile(payload: { path: string }): Promise<string> {
  return cmd.readFile(payload);
}

/** Server-side SSR render used by `hydratedFixture` (see scripts/vitest/commands.ts). */
export function litSsrRender(payload: { template: unknown; modules: string[] }): Promise<string> {
  return cmd.litSsrRender(payload);
}
