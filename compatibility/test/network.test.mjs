import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const build = path.resolve(process.env.SYNCSHARE_BUILD || 'fixed');
const commons = fs.readFileSync(path.join(build, 'src/commons.js'), 'utf8');
const background = fs.readFileSync(path.join(build, 'src/background.js'), 'utf8');
const entry = 'var a=i.O(void 0,[351],(()=>i(851)));a=i.O(a)';
assert.equal(background.split(entry).length, 2);

function load() {
  const dom = new JSDOM('', {runScripts: 'outside-only'});
  const w = dom.window;
  w.browser = w.JSON.parse('{}');
  w.browser.runtime = {getManifest: () => ({name: 'SyncShare test'})};
  const timers = new Map();
  let counter = 0;
  let request;
  let deliver;
  w.setTimeout = (callback, delay) => { timers.set(++counter, {callback, delay}); return counter; };
  w.clearTimeout = id => timers.delete(id);
  w.fetch = (url, options) => {
    request = {url, options};
    return new Promise((resolve, reject) => {
      deliver = value => resolve(value);
      options.signal.addEventListener('abort', () => reject(new w.DOMException('The operation was aborted.', 'AbortError')));
    });
  };
  w.eval(commons);
  w.eval(background.replace(entry, 'self.__require=i'));
  return {
    w, timers, get request() {return request;},
    deliver: value => deliver(value),
    advanceTo(ms) {
      for (const [id, timer] of timers) {
        if (timer.delay <= ms) { timers.delete(id); timer.callback(); }
      }
    },
    close: () => w.close(),
  };
}

test('solution request can finish after 9 seconds without the legacy 8-second abort', async () => {
  const env = load();
  try {
    const API = env.w.__require(9995).default;
    const result = new API('https://service.example/api/v2/').requestSolution({questionId: '42'});
    // Attach rejection handling immediately: this is an expected failure on 1.1.6.
    const outcome = result.then(value => ({value}), error => ({error}));
    env.advanceTo(9000);
    env.deliver({ok: true, json: async () => []});
    const actual = await outcome;
    assert.equal(actual.error, undefined, actual.error?.message);
    assert.deepEqual(actual.value, []);
    assert.equal(env.request.options.method, 'GET');
    assert.equal(new URL(env.request.url).searchParams.get('questionId'), '42');
    assert.equal(env.timers.size, 0);
  } finally {env.close();}
});

test('a stalled solution request still times out with an actionable error', async () => {
  const env = load();
  try {
    const API = env.w.__require(9995).default;
    const result = new API('https://service.example/api/v2/').requestSolution({questionId: '42'});
    const rejection = assert.rejects(result, /timed out after 30000 ms/);
    env.advanceTo(30000);
    await rejection;
    assert.equal(env.request.options.signal.aborted, true);
    assert.equal(env.timers.size, 0);
  } finally {env.close();}
});

test('non-timeout network errors retain their cause and release the timer', async () => {
  const env = load();
  try {
    const networkError = new TypeError('Network is unavailable');
    env.w.fetch = async () => {throw networkError;};
    const fetchWithTimeout = env.w.__require(8309).fetchWithTimeout;
    await assert.rejects(fetchWithTimeout('https://service.example/status'), error => error === networkError);
    assert.equal(env.timers.size, 0);
  } finally {env.close();}
});

test('explicit short timeout for other requests remains effective', async () => {
  const env = load();
  try {
    const fetchWithTimeout = env.w.__require(8309).fetchWithTimeout;
    const result = fetchWithTimeout('https://service.example/status', {timeout: 50});
    const rejection = assert.rejects(result, /timed out after 50 ms/);
    env.advanceTo(49);
    assert.equal(env.request.options.signal.aborted, false);
    env.advanceTo(50);
    await rejection;
  } finally {env.close();}
});
