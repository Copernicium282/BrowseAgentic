# BrowseAgentic — Agent Guide

## ⛔ STOP — READ THIS OR FAIL ⛔

**This document is INSTRUCTIONS, not reference material. You MUST follow these rules. If you skip this section, you WILL waste hours and fail.**

### WHAT BROWSEAGENTIC IS

BrowseAgentic is a **set of instructions** for you (the agent) on how to control a browser. It is NOT a library. It is NOT an API. It is NOT something you import or call.

**You control the browser directly using Playwright.** That's it. There is no middle layer. There is no "BrowseAgentic function" to call. You use Playwright.

### THE THREE LAWS (Violation = Total Failure)

```
LAW 1: SCREENSHOT BEFORE EVERY ACTION
LAW 2: ONE ACTION AT A TIME, THEN SCREENSHOT AGAIN
LAW 3: NEVER WRITE A SCRIPT LONGER THAN 5 LINES
```

**LAW 1 — SCREENSHOT BEFORE EVERY ACTION:**
Before you do ANYTHING — click, type, scroll, navigate — you MUST take a screenshot first. You need to SEE what is on screen. You have eyes. USE THEM.

```js
await page.screenshot({ path: '/tmp/step_01.png' }); // ALWAYS FIRST
```

**LAW 2 — ONE ACTION, THEN SCREENSHOT:**
Do ONE thing. Then STOP. Then screenshot. Then LOOK at the screenshot. Then decide what to do next. NEVER chain multiple actions.

```js
// This is WRONG:
await page.goto(url);
await page.click('#btn');
await page.fill('#input', 'text');
await page.screenshot({ path: '/tmp/result.png' });

// This is RIGHT:
await page.screenshot({ path: '/tmp/step_1.png' }); // Look first
await page.goto(url);                                 // ONE action
await page.screenshot({ path: '/tmp/step_2.png' }); // Look again
await page.click('#btn');                             // ONE action
await page.screenshot({ path: '/tmp/step_3.png' }); // Look again
```

**LAW 3 — NEVER WRITE LONG SCRIPTS:**
If you find yourself writing more than 5 lines of Playwright code in a single response — STOP. You are doing it wrong. Break it up. Do one thing, report back, then do the next thing.

### THE LOOP (Repeat This Forever)

```
1. SCREENSHOT    →  What is on screen right now?
2. THINK         →  What ONE thing should I do next?
3. ACT           →  Do that ONE thing.
4. SCREENSHOT    →  What changed? Did it work?
5. READ          →  What does the text say? Any errors?
6. REPEAT from 1
```

**There is no step 7. There is no "write a script and run it." There is only this loop.**

### COMMON FAILURE MODES (If You Do Any of These, You Have Already Failed)

❌ **"Let me write a Playwright script that..."** — NO. You don't write scripts. You take actions.

❌ **"Let me create a test file and..."** — NO. There are no test files. There is you, the browser, and Playwright.

❌ **"I'll chain goto → click → fill → screenshot..."** — NO. One action. Screenshot. Think. One action. Screenshot.

❌ **"Let me use page.evaluate() to inject..."** — STOP. Look at the page first. What are you even injecting? Screenshot.

❌ **"The selector didn't work, let me try 5 more times..."** — NO. Screenshot. READ what's on screen. Try a DIFFERENT approach.

❌ **"Let me create a helper function..."** — NO. Just do the thing. Click the button. Type the text. Stop abstraction.

❌ **"BrowseAgentic has a tool called..."** — NO. BrowseAgentic has NO tools. YOU have Playwright. Use it.

### WHAT YOU SHOULD BE DOING

```
User says: "Go to google.com and search for cats"

You do:
1. page.screenshot() — see current state
2. page.goto('https://google.com') — one action
3. page.screenshot() — did it load?
4. page.click('textarea[name="q"]') — one action
5. page.screenshot() — is the input focused?
6. page.keyboard.type('cats') — one action
7. page.screenshot() — is the text there?
8. page.keyboard.press('Enter') — one action
9. page.screenshot() — did results appear?
10. READ the results and tell the user what you found
```

**NOT this:**
```
Let me write a script:
const browser = await chromium.connectOverCDP(...)
await page.goto('https://google.com')
await page.click('textarea[name="q"]')
await page.keyboard.type('cats')
await page.keyboard.press('Enter')
await page.screenshot()
// ← This is WRONG. You just blind-fired 6 actions.
```

---

## How to Connect

**The user MUST launch the browser first. You CANNOT launch it yourself.**

Ask the user to run one of these:
- Chrome: `./scripts/browser.sh start`
- Firefox: `./scripts/browser.sh start firefox`

Wait for the user to say it's ready. Then connect:

```js
const { chromium } = require('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0]?.pages()[0];
```

For Firefox:
```js
const { firefox } = require('playwright');
const browser = await firefox.launch({ headless: false });
const page = await browser.newPage();
```

**That's the ONLY setup code you need. Everything after this is the LOOP.**

---

## Screenshot Protocol

Every screenshot MUST be named sequentially:
```js
await page.screenshot({ path: '/tmp/step_01_initial.png' });
await page.screenshot({ path: '/tmp/step_02_after_navigate.png' });
await page.screenshot({ path: '/tmp/step_03_after_click.png' });
await page.screenshot({ path: '/tmp/step_04_result.png' });
```

This way you (and the user) can review exactly what happened at each step.

---

## Reading the Page

After every action, READ what's on screen. Don't guess.

```js
// Read visible text
const text = await page.textContent('body');

// Read a specific element
const result = await page.textContent('#output');

// Read the title
const title = await page.title();

// Read the URL
const url = page.url();

// Check if an element exists
const exists = await page.locator('#button').isVisible().catch(() => false);
```

---

## Handling Common Situations

### Popups and Overlays

```js
// Close Chrome password manager popup
const okBtn = page.locator('button:has-text("OK")').first();
if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
  await okBtn.click();
}

// Remove JS overlays
await page.evaluate(() => {
  document.querySelectorAll('[class*="dialog"], [class*="popup"], [role="alert"]').forEach(el => el.remove());
});

// Close context menus
await page.keyboard.press('Escape');
```

### JavaScript Dialogs (alert, confirm, prompt)

Set up listener BEFORE triggering, clean up after:

```js
let dialogMsg = '';
const handler = async (dialog) => {
  dialogMsg = dialog.message();
  await dialog.accept();
};
page.on('dialog', handler);

await page.click('button'); // Trigger the dialog
await page.waitForTimeout(1000);
console.log('Dialog:', dialogMsg);
page.removeListener('dialog', handler);
```

### iframes

```js
const frame = page.frameLocator('#my-iframe');
const body = frame.locator('body');
const text = await body.textContent();
```

### Rich Text Editors (TinyMCE, etc.)

```js
// Use the editor's API, not Playwright
const content = await page.evaluate(() => tinymce.editors[0].getContent());
await page.evaluate(() => tinymce.editors[0].setContent('<p>Hello</p>'));
```

### Dynamic Content (AJAX, delayed elements)

```js
// Wait for element to be visible
await page.waitForFunction(() => {
  const el = document.querySelector('#result');
  return el && el.style.display !== 'none' && el.offsetParent !== null;
}, { timeout: 15000 });
```

### Drag and Drop

```js
const src = page.locator('#source');
const dst = page.locator('#target');
const srcBox = await src.boundingBox();
const dstBox = await dst.boundingBox();

await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
await page.mouse.down();
for (let i = 1; i <= 20; i++) {
  const x = srcBox.x + srcBox.width / 2 + (dstBox.x + dstBox.width / 2 - srcBox.x - srcBox.width / 2) * i / 20;
  const y = srcBox.y + srcBox.height / 2 + (dstBox.y + dstBox.height / 2 - srcBox.y - srcBox.height / 2) * i / 20;
  await page.mouse.move(x, y);
  await page.waitForTimeout(30);
}
await page.mouse.up();
```

### Hover Menus

```js
await page.evaluate(() => {
  document.querySelector('#menu-trigger').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
});
await page.waitForTimeout(500);
await page.click('#submenu-item');
```

### Authentication

```js
// HTTP Basic Auth
await page.goto('https://user:pass@domain.com/protected');

// Form Login
await page.fill('#username', 'myuser');
await page.fill('#password', 'mypass');
await page.click('button[type="submit"]');
await page.waitForLoadState('networkidle');
```

### Read-Only / Disabled Elements

```js
// Set value via JS
await page.evaluate(() => {
  const input = document.querySelector('#readonly-input');
  input.value = 'new value';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
```

---

## When You Get Stuck

1. **SCREENSHOT** — What is ACTUALLY on screen? Not what you THINK is on screen.
2. **READ** — What does the text say? Any error messages? Any popups?
3. **CHECK** — Is the element you're trying to click actually visible? Does it exist?
4. **DIFFERENT APPROACH** — Don't retry the same thing 5 times. Try something else.
5. **ASK** — Tell the user what you see and ask for help.

---

## Config

Edit `config/browseagentic.yaml`:
- `browser.engine`: `"chromium"` or `"firefox"`
- `browser.headless`: `false` to see the browser
- `browser.cdp_port`: `9222` (connect to existing Chrome)

## Troubleshooting

**Chrome not starting**: Ensure Chrome is installed. Check `./scripts/browser.sh status`.

**CDP connection fails**: `curl http://127.0.0.1:9222/json/version` — if this fails, Chrome isn't ready.

**Page elements not found**: Screenshot. READ. The element might not exist, or might be hidden behind a popup.

**Stuck in a loop**: STOP. Screenshot. Read this document from the top. You're probably breaking one of the three laws.
