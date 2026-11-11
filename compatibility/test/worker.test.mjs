import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const build = path.resolve(process.env.SYNCSHARE_BUILD || 'chrome');
const manifest = JSON.parse(fs.readFileSync(path.join(build, 'manifest.json')));
const plain = value => JSON.parse(JSON.stringify(value));
const defaults = {widgetToggleHotkey: 'esc', widgetToggleDoubleClick: true, hideWidgetByDefault: false};
const meta = {
  moodleId: 731, host: 'moodle.example', courseId: 12, courseName: 'Synthetic course',
  quizId: 13, quizName: 'Synthetic quiz', attemptId: 14,
};

// Execute the whole worker, including its entry point, without a DOM.
// Only browser persistence/messaging and HTTP boundaries are substituted.
function boot(storage = {}, fetch = async () => {throw new Error('Unexpected network request');}) {
  const listeners = {};
  const context = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch,
    console: {info() {}, warn() {}, error() {}, log() {}},
    storageGet: async defaults => plain({...defaults, ...storage}),
    storageSet: async data => {Object.assign(storage, plain(data));},
    storageRemove: async key => {delete storage[key];},
    register: (event, listener) => {listeners[event] = listener;},
    manifest,
  });
  vm.runInContext(`
    self = globalThis;
    browser = {
      runtime: {
        getManifest: () => manifest,
        onMessage: {addListener: fn => register('message', fn)},
        onStartup: {addListener: fn => register('startup', fn)},
      },
      storage: {local: {get: storageGet, set: data => storageSet(data), remove: storageRemove}},
      i18n: {getMessage: key => key},
      tabs: {query: async () => []},
    };
  `, context);
  function execute(file) {
    vm.runInContext(fs.readFileSync(path.join(build, file), 'utf8'), context, {filename: file});
  }
  context.importScripts = (...files) => files.forEach(execute);
  if (manifest.background.service_worker) execute(manifest.background.service_worker);
  else manifest.background.scripts.forEach(execute); // Regression against Firefox's old background.
  return {
    context, listeners,
    send: (topic, data) => listeners.message({topic, data}),
  };
}

test('worker registers startup cleanup before any asynchronous turn', () => {
  const env = boot();
  assert.equal(typeof env.listeners.startup, 'function');
});

test('first message on a cold worker reaches the solution handler', async () => {
  const env = boot({}, async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v2/quiz/solution');
    assert.equal(new URL(url).searchParams.get('questionId'), '42');
    assert.equal(options.method, 'GET');
    return {ok: true, json: async () => [{synthetic: true}]};
  });
  assert.deepEqual(await env.send('solution-request', {quizMeta: meta, questionId: 42, questionType: 'multichoice'}), [{synthetic: true}]);
});

test('settings acknowledgement waits for persistence and survives a fresh worker', async () => {
  const storage = {};
  const env = boot(storage);
  assert.deepEqual(plain(await env.send('get-settings')), defaults);
  let persist;
  env.context.storageSet = data => new Promise(resolve => {
    persist = () => {Object.assign(storage, plain(data)); resolve();};
  });
  const changed = {...defaults, widgetToggleHotkey: 'f2', hideWidgetByDefault: true};
  let acknowledged = false;
  const result = env.send('set-settings', changed).then(() => {acknowledged = true;});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(acknowledged, false, 'must not acknowledge before storage finishes');
  persist();
  await result;
  assert.deepEqual(plain(await boot(storage).send('get-settings')), changed);
});

for (const [topic, endpoint] of [['quiz-attempt-data', 'attempt'], ['quiz-review-data', 'review']]) {
  test(`${topic} keeps its response pending until the HTTP request finishes`, async () => {
    let finish;
    const env = boot({}, (url, options) => {
      assert.equal(new URL(url).pathname, `/api/v2/quiz/${endpoint}`);
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).moodleId, 731);
      return new Promise(resolve => {finish = () => resolve({ok: true});});
    });
    // Also exercise an already-running worker, isolating promise propagation.
    await new Promise(resolve => setImmediate(resolve));
    let completed = false;
    const result = env.send(topic, {quizMeta: meta, questions: [], reviewSummary: null}).then(() => {completed = true;});
    try {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(completed, false, 'message must keep the upload alive');
    } finally {finish?.(); await result;}
  });
}

test('upload errors propagate through the message response', async () => {
  let rejectFetch;
  const env = boot({}, () => new Promise((resolve, reject) => {rejectFetch = reject;}));
  await new Promise(resolve => setImmediate(resolve));
  const result = env.send('quiz-attempt-data', {quizMeta: meta, questions: []});
  const check = assert.rejects(result, /Offline fixture/);
  rejectFetch(new Error('Offline fixture'));
  await check;
});
