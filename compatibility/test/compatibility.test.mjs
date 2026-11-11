import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

// Run the actual packaged modules. Suppress only the page entry point so
// the tests never send a quiz or a user ID to the service.
const build = path.resolve(process.env.SYNCSHARE_BUILD || 'fixed');
const commons = fs.readFileSync(path.join(build, 'src/commons.js'), 'utf8');
const attempt = fs.readFileSync(path.join(build, 'src/quizattempt.js'), 'utf8');
const entry = 'var s=i.O(void 0,[351],(()=>i(856)));s=i.O(s)';
assert.equal(attempt.split(entry).length, 2, 'Expected the known 1.1.6 entry point');

function load(html) {
  const dom = new JSDOM(html, {
    url: 'https://moodle.example/mod/quiz/attempt.php?attempt=11&cmid=12',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  // jsdom has no layout engine; emulate only the innerText DOM surface.
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent; },
    set(value) { this.textContent = value; },
  });
  window.browser = window.JSON.parse('{}');
  window.browser.runtime = {
    getManifest: () => ({ name: 'SyncShare test' }),
    getURL: file => `moz-extension://test/${file}`,
    onMessage: { addListener() {} },
    sendMessage() { throw new Error('Extension messaging is forbidden in unit tests'); },
  };
  window.fetch = () => { throw new Error('Network is forbidden in tests'); };
  window.eval(commons);
  window.eval(attempt.replace(entry, 'self.__require=i'));
  return { window, close: () => window.close() };
}

async function userId(html) {
  const env = load(html);
  try {
    const Source = env.window.__require(9423).default;
    const source = new Source();
    await source.load();
    return source.get('moodleId');
  } finally { env.close(); }
}

const question = (grade = '') => `
  <div class="que multichoice deferredfeedback notyetanswered">
    <div class="info"><h3>Question 1</h3>${grade}</div>
    <input class="questionflagpostdata" value="qid=42&amp;qaid=57">
    <div class="qtext">Which network?</div>
    <div class="answer"><div class="r0">
      <input type="radio" name="q1" value="0" id="answer0">
      <label for="answer0"><span class="answernumber">a. </span>Example</label>
    </div></div>
  </div>`;

test('missing optional grade still yields a serializable question with its real ID', () => {
  const env = load(question());
  try {
    const Question = env.window.__require(7684).Question;
    const parsed = new Question(env.window.document.querySelector('.que'));
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.serializeToJSON())), {
      id: 42, __type: 'multichoice', behavior: 'deferredfeedback',
      state: 'notyetanswered', grade: [],
    });
  } finally { env.close(); }
});

test('present grade retains the previous numeric values', () => {
  const env = load(question('<div class="grade">Marked out of 2.50</div>'));
  try {
    const Question = env.window.__require(7684).Question;
    const parsed = new Question(env.window.document.querySelector('.que'));
    assert.deepEqual(Array.from(parsed.grade), [2.5]);
  } finally { env.close(); }
});

test('the real multiple-choice parser preserves options when the grade is absent', () => {
  const env = load(question());
  try {
    const Parser = env.window.__require(8494).Parser;
    const parsed = new Parser(env.window.document.querySelector('.que'));
    const data = JSON.parse(JSON.stringify(parsed.serializeToJSON()));
    assert.equal(data.id, 42);
    assert.equal(data.single, true);
    assert.deepEqual(data.grade, []);
    assert.equal(data.formulation.html, 'Which network?');
    assert.equal(data.options.length, 1);
    assert.equal(data.options[0].html, 'Example');
    assert.equal(data.options[0].userInput.checked, false);
  } finally { env.close(); }
});

test('missing question ID is still rejected instead of inventing one', () => {
  const env = load(question().replace('qid=42&amp;', ''));
  try {
    const Question = env.window.__require(7684).Question;
    assert.throws(() => new Question(env.window.document.querySelector('.que')), /doesn't have an id/);
  } finally { env.close(); }
});

test('data-user-id is exposed under the moodleId key required by the caller', async () => {
  assert.equal(await userId('<div data-user-id="731"></div>'), 731);
});

test('standard Moodle JSON config identifies the current user without a profile menu', async () => {
  assert.equal(await userId('<script>var M = {}; M.cfg = {"wwwroot":"https://moodle.example","userId":732};</script>'), 732);
});

test('current-user config takes priority over a link to another user', async () => {
  assert.equal(await userId('<a href="/user/profile.php?id=999">Another user</a><script>M.cfg = {"userId":732};</script>'), 732);
});

test('multiline JSON config and a string user ID work without executing page scripts', async () => {
  assert.equal(await userId('<script>M.cfg = {\n"userId": "733"\n}; throw new Error("must not run");</script>'), 733);
});

test('legacy profile and data-userid sources continue to work', async () => {
  assert.equal(await userId('<a href="/user/profile.php?id=734">My profile</a>'), 734);
  assert.equal(await userId('<div data-userid="735"></div>'), 735);
});

test('invalid and absent IDs are not treated as a logged-in user', async () => {
  for (const value of ['0', '-1', '12oops', 'NaN', '', '9007199254740992']) {
    assert.equal(await userId(`<div data-user-id="${value}"></div>`), null, value);
  }
  assert.equal(await userId('<script>M.cfg = {"userId":0};</script>'), null);
  assert.equal(await userId('<div>No user info</div>'), null);
});

test('malformed config is ignored and valid DOM metadata can still be used', async () => {
  assert.equal(await userId('<script>M.cfg = {userId: 99};</script><div data-user-id="736"></div>'), 736);
});
