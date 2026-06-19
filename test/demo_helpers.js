// demo_helpers.js — Optional helper functions for the demo agent.
// The agent does NOT need to run this file. These are reference implementations
// for common operations that the agent can copy-paste into its tool calls.

const { chromium } = require('playwright');

const CDP_PORT = 9222;

// Connect to Chrome (call this once at the start)
async function connect() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const page = browser.contexts()[0]?.pages()[0];
  return { browser, page };
}

// Dismiss Chrome popups, overlays, context menus (call before each page interaction)
async function dismissPopups(page) {
  try {
    const okBtn = page.locator('button:has-text("OK")').first();
    if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await okBtn.click();
      await page.waitForTimeout(300);
    }
  } catch {}
  await page.evaluate(() => {
    document.querySelectorAll('[class*="dialog"], [class*="popup"], [role="alert"], .tox-notification').forEach(el => el.remove());
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

// Detect notepad type (returns 'codemirror', 'textarea', 'contenteditable', or 'unknown')
async function detectNotepad(page) {
  return page.evaluate(() => {
    if (document.querySelector('.CodeMirror')) return 'codemirror';
    if (document.querySelector('#notes')) return 'textarea';
    if (document.querySelector('textarea')) return 'textarea';
    if (document.querySelector('[contenteditable]')) return 'contenteditable';
    return 'unknown';
  });
}

// Type into a notepad (handles all 3 types)
async function typeIntoNotepad(page, text, type) {
  if (type === 'codemirror') {
    await page.evaluate((t) => {
      document.querySelector('.CodeMirror').CodeMirror.setValue(t);
    }, text);
  } else if (type === 'contenteditable') {
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.selectAll();
    await page.keyboard.press('Backspace');
    await editor.type(text, { delay: 30 });
  } else {
    const textarea = page.locator('textarea').first();
    await textarea.click();
    await textarea.fill(text);
  }
}

// Append text to a notepad (for the outro)
async function appendToNotepad(page, text, type) {
  if (type === 'codemirror') {
    await page.evaluate((t) => {
      const cm = document.querySelector('.CodeMirror').CodeMirror;
      cm.setValue(cm.getValue() + t);
    }, text);
  } else if (type === 'contenteditable') {
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press('Control+End');
    await editor.type(text, { delay: 30 });
  } else {
    const textarea = page.locator('textarea').first();
    await textarea.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(text, { delay: 30 });
  }
}

// Manual drag and drop (more reliable than dragTo)
async function dragAndDrop(page, sourceSelector, targetSelector) {
  const src = page.locator(sourceSelector);
  const dst = page.locator(targetSelector);
  const srcBox = await src.boundingBox();
  const dstBox = await dst.boundingBox();
  if (!srcBox || !dstBox) return false;

  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    const x = srcBox.x + srcBox.width / 2 + (dstBox.x + dstBox.width / 2 - srcBox.x - srcBox.width / 2) * i / 20;
    const y = srcBox.y + srcBox.height / 2 + (dstBox.y + dstBox.height / 2 - srcBox.y - srcBox.height / 2) * i / 20;
    await page.mouse.move(x, y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  return true;
}

module.exports = {
  connect, dismissPopups, detectNotepad,
  typeIntoNotepad, appendToNotepad, dragAndDrop,
  CDP_PORT,
};
