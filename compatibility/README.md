# Firefox 1.1.6 compatibility patch

This directory contains readable replacement modules, a reproducible packaging
script, and tests that execute the actual bundled extension modules in jsdom.
It is experimental and does not claim compatibility with every Moodle theme.

## Changes

- Treat an absent `div.grade` as an unknown grade (`[]`) instead of rejecting the question.
- Correct the `data-user-id` assignment from `userId` to the expected `moodleId`.
- Read a positive current-user ID from Moodle's standard `M.cfg.userId` JSON.
  Page scripts are not evaluated. Existing metadata fallbacks are retained;
  an unknown ID is not fabricated.
- Allow solution requests up to 30 seconds instead of 8. Other timeout values
  are preserved. Timeouts have an explicit error message, and timers are
  cleared on success and failure. No automatic retries are introduced.

## Build and test

Requirements: Python 3.9+ and Node.js 24.

```sh
cd compatibility
npm ci --ignore-scripts
python3 build.py
npm test
```

Output: `syncshare-resilient-1.1.6.2.zip` and the unpacked `fixed/` directory.
The ZIP has reproducible entry timestamps. The script refuses an unexpected
upstream package checksum or bundle layout.

To run the regression tests against the original release:

```sh
python3 -m zipfile -e original.xpi original
SYNCSHARE_BUILD=original npm test
```

Expected results: 11 failing and 4 passing tests against the original; all 15
passing against the patch. The tests use synthetic page fixtures and replace
browser messaging/network boundaries. They do not contact a live Moodle site
or submit quiz data. Local success is not a guarantee of upstream API behavior.

## Temporary installation

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. If a previous temporary version of this patch is loaded, remove that
   temporary version first.
3. Choose **Load Temporary Add-on**, then select the generated ZIP.
4. Verify the displayed name and version: **SyncShare Resilient**,
   **1.1.6.2**.
5. Load the quiz page again after saving any in-progress answers, so its content
   scripts use the new build. Do not start another attempt just to reload scripts.

The patch keeps the original add-on ID for temporary replacement. It does not
modify a Firefox profile on disk. The temporary add-on does not survive a browser
restart. Do not disable signature verification. A separately distributed fork
would need its own ID and Mozilla signing before permanent installation.

[Mozilla temporary installation documentation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

## Upstream provenance and privacy

- Original project: <https://github.com/naloaty/syncshare-extension>
- Original package: <https://addons.mozilla.org/firefox/downloads/file/4104548/syncshare-1.1.6.xpi>
- Version: 1.1.6, licensed under MIT (see `LICENSE.md`).
- Original SHA-256: `d48d4c9e34a36d13e653c6cf3c92368cfa6fbfb12a938da57547849885273bae`.

`original.xpi` contains the unmodified upstream package, not a browser profile.
The root source archive is older than this package; it is not represented as
the source used to build the 1.1.6 release.

The original extension accesses web pages and sends Moodle quiz/attempt data,
including a Moodle user identifier, to SyncShare. This patch preserves those
permissions and service endpoints. It does not add telemetry, a new destination,
or an independent backend. Review that behavior before using it.

Only `manifest.json`, `src/commons.js`, `src/quizattempt.js`, and
`src/background.js` are modified. The original signature is removed because it
is invalid after modification; the MIT license is included in the output ZIP.
No private page captures, user identifiers, local paths, or test execution logs
are included in this source directory.
