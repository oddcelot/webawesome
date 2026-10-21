/**
 * Node-side Vitest browser commands that reimplement the parts of @web/test-runner-commands that our tests use. They
 * drive the Playwright page directly. Vitest runs tests inside an iframe, so mouse coordinates (which tests compute
 * relative to the test document) are translated into page coordinates using the iframe's bounding box.
 *
 * Client-side wrappers with the original function names live in src/internal/test/commands.ts.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Page } from 'playwright';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface Context {
  page: Page;
  frame: () => Promise<import('playwright').Frame>;
  testPath?: string;
}

type MouseButton = 'left' | 'middle' | 'right';

const pressedButtons = new WeakMap<Page, Set<MouseButton>>();

/** Maps a coordinate in the test iframe's viewport to a coordinate in the page. */
async function toPagePoint(ctx: Context, [x, y]: [number, number]) {
  const iframe = ctx.page.locator('iframe[data-vitest="true"]').first();
  const box = await iframe.boundingBox();
  if (!box) {
    return { x, y };
  }
  const metrics = await iframe.evaluate((el: HTMLIFrameElement) => ({
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
    clientLeft: el.clientLeft,
    clientTop: el.clientTop,
  }));
  const scaleX = metrics.clientWidth ? (box.width - metrics.clientLeft * 2) / metrics.clientWidth : 1;
  const scaleY = metrics.clientHeight ? (box.height - metrics.clientTop * 2) / metrics.clientHeight : 1;
  return {
    x: box.x + metrics.clientLeft + x * scaleX,
    y: box.y + metrics.clientTop + y * scaleY,
  };
}

/** Make sure keyboard events go to the test iframe's document (the page may have focus on the orchestrator). */
async function focusTestFrame(ctx: Context) {
  const frame = await ctx.frame();
  await frame.evaluate(() => {
    if (
      !document.activeElement ||
      document.activeElement.ownerDocument !== document ||
      document.activeElement === document.body
    ) {
      window.focus();
    }
  });
}

export const commands = {
  async sendKeys(ctx: Context, payload: { type?: string; press?: string; down?: string; up?: string }): Promise<void> {
    await focusTestFrame(ctx);
    const { keyboard } = ctx.page;
    if (typeof payload.type === 'string') {
      await keyboard.type(payload.type);
    } else if (typeof payload.press === 'string') {
      await keyboard.press(payload.press);
    } else if (typeof payload.down === 'string') {
      await keyboard.down(payload.down);
    } else if (typeof payload.up === 'string') {
      await keyboard.up(payload.up);
    } else {
      throw new Error(`Unknown sendKeys payload: ${JSON.stringify(payload)}`);
    }
  },

  async sendMouse(
    ctx: Context,
    payload: {
      type: 'move' | 'click' | 'down' | 'up';
      position?: [number, number];
      button?: MouseButton;
    },
  ): Promise<void> {
    const { mouse } = ctx.page;
    const button = payload.button ?? 'left';
    const pressed = pressedButtons.get(ctx.page) ?? new Set<MouseButton>();
    pressedButtons.set(ctx.page, pressed);
    const point = payload.position ? await toPagePoint(ctx, payload.position) : undefined;

    switch (payload.type) {
      case 'move':
        if (!point) throw new Error('sendMouse "move" requires a position');
        await mouse.move(point.x, point.y);
        break;
      case 'click':
        if (!point) throw new Error('sendMouse "click" requires a position');
        await mouse.click(point.x, point.y, { button });
        break;
      case 'down':
        await mouse.down({ button });
        pressed.add(button);
        break;
      case 'up':
        await mouse.up({ button });
        pressed.delete(button);
        break;
      default:
        throw new Error(`Unknown sendMouse type: ${String(payload.type)}`);
    }
  },

  async resetMouse(ctx: Context): Promise<void> {
    const pressed = pressedButtons.get(ctx.page);
    for (const button of pressed ?? []) {
      await ctx.page.mouse.up({ button });
    }
    pressed?.clear();
    const origin = await toPagePoint(ctx, [0, 0]);
    await ctx.page.mouse.move(origin.x, origin.y);
  },

  async emulateMedia(ctx: Context, options: Parameters<Page['emulateMedia']>[0]): Promise<void> {
    await ctx.page.emulateMedia(options);
  },

  /** Reads a file relative to the calling test file, like WTR's `readFile`. */
  async readFile(ctx: Context, payload: { path: string }): Promise<string> {
    const base = ctx.testPath ? dirname(ctx.testPath) : packageRoot;
    return readFile(resolve(base, payload.path), 'utf8');
  },

  /** SSR-renders a serialized Lit template with the given built modules (paths relative to the package root). */
  async litSsrRender(_ctx: Context, payload: { template: any; modules: string[] }): Promise<string> {
    const { template, modules } = payload;
    const resolved = modules.map(m => pathToFileURL(join(packageRoot, m)).href);

    return new Promise<string>((res, rej) => {
      const worker = new Worker(new URL('./ssr-worker.js', import.meta.url), {
        workerData: { template, modules: resolved },
      });
      worker.once('error', rej);
      worker.once('message', res);
    });
  },
};
