// Node.js 24; CHROME_BIN selects an installed Chrome/Chromium executable.
// Use raw CDP so no debugger attaches to (and keeps alive) the service worker.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const build = path.resolve(process.env.SYNCSHARE_BUILD || 'chrome');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'syncshare-chrome-test-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
const events = [];
const runtimeErrors = [];
let sequence = 0;
let socket;
let browserLog = '';
const child = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--enable-unsafe-extension-debugging', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], {stdio: ['ignore', 'ignore', 'pipe']});
child.stderr.on('data', chunk => {browserLog += chunk;});
let launchError;
child.on('error', error => {launchError = error;});

async function until(check, label) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const result = await check();
    if (result) return result;
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`Chrome exited: ${browserLog}`);
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {pending.delete(id); reject(new Error(`CDP timeout: ${method}`));}, 15000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
}
try {
  const portFile = await until(async () => {
    try {return await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8');}
    catch {return null;}
  }, 'Chrome DevTools port');
  const [port, endpoint] = portFile.trim().split('\n');
  socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params);
    if (!message.id) {events.push(message); return;}
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  const {product: browser} = await send('Browser.getVersion');
  const {id} = await send('Extensions.loadUnpacked', {path: build});
  const {targetId} = await send('Target.createTarget', {url: `chrome-extension://${id}/popup.html`});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  await send('Runtime.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  await send('Network.setBlockedURLs', {urls: ['http://*', 'https://*']}, sessionId);
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  const manifest = await evaluate('chrome.runtime.getManifest()');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.1.6.3');
  await until(() => evaluate("document.querySelector('#widget-toggle-double-click')?.checked"), 'popup settings');
  assert.equal(await evaluate("document.querySelector('#widget-toggle-hotkey').value"), 'esc');
  const settings = {widgetToggleHotkey: 'f2', widgetToggleDoubleClick: false, hideWidgetByDefault: true};
  await evaluate(`chrome.runtime.sendMessage({topic:'set-settings',data:${JSON.stringify(settings)}})`);
  await send('Page.reload', {}, sessionId);
  await until(() => evaluate("document.querySelector('#widget-toggle-hotkey')?.value === 'f2'"), 'saved popup settings');
  assert.equal(await evaluate("document.querySelector('#hide-widget-by-default').checked"), true);
  assert.equal(await evaluate("document.querySelector('#widget-toggle-double-click').checked"), false);

  // No debugger is attached to the worker, so Chrome can really stop it.
  await send('ServiceWorker.enable', {}, sessionId);
  const workerUrl = `chrome-extension://${id}/service-worker.js`;
  const version = await until(() => events.flatMap(event => event.params?.versions || [])
    .find(item => item.scriptURL === workerUrl && item.runningStatus === 'running'), 'worker running');
  events.length = 0;
  await send('ServiceWorker.stopWorker', {versionId: version.versionId}, sessionId);
  await until(() => events.flatMap(event => event.params?.versions || [])
    .find(item => item.versionId === version.versionId && item.runningStatus === 'stopped'), 'worker stopped');
  events.length = 0;
  assert.deepEqual(await evaluate("chrome.runtime.sendMessage({topic:'get-settings'})"), settings);
  await until(() => events.flatMap(event => event.params?.versions || [])
    .find(item => item.versionId === version.versionId && item.runningStatus === 'running'), 'worker restarted');
  assert.deepEqual(runtimeErrors, []);
  console.log(JSON.stringify({browser, version: manifest.version, manifest: manifest.manifest_version,
    popup: 'passed', workerRestart: 'passed', settingsPersistence: 'passed'}));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await send('Browser.close').catch(() => {});
    socket.close();
  }
  if (child.exitCode === null) {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  for (const entry of pending.values()) clearTimeout(entry.timer);
  await fs.rm(profile, {recursive: true, force: true});
}
