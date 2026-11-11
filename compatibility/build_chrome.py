"""Build the Chrome MV3 variant without changing the Firefox artifact."""
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
VERSION = '1.1.6.3'
runpy.run_path(str(ROOT / 'build.py'))
BUILD = ROOT / 'chrome'
if BUILD.exists():
    shutil.rmtree(BUILD)
shutil.copytree(ROOT / 'fixed', BUILD)

manifest_path = BUILD / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest.update({
    'manifest_version': 3,
    'version': VERSION,
    'minimum_chrome_version': '120',
    'homepage_url': 'https://github.com/WhaleShip/syncshare-resilient',
    'permissions': ['storage'],
    'host_permissions': ['*://*/*'],
    'background': {'service_worker': 'service-worker.js'},
    'content_security_policy': {
        'extension_pages': "script-src 'self'; object-src 'self'; "
                           + manifest['content_security_policy'],
    },
    'web_accessible_resources': [{
        'resources': manifest['web_accessible_resources'],
        'matches': ['*://*/*'],
    }],
})
manifest['action'] = manifest.pop('browser_action')
manifest['action'].pop('browser_style', None)
manifest.pop('browser_specific_settings')
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
shutil.copyfile(ROOT / 'patches/chrome-service-worker.js', BUILD / 'service-worker.js')

background_path = BUILD / 'src/background.js'
background = background_path.read_text()
start = background.index('851:function(')
end = background.index('8394:function(', start)
replacement = (ROOT / 'patches/chrome-background-entry.js').read_text().strip()
background = background[:start] + '851:' + replacement + ',' + background[end:]


def replace_once(before, after):
    global background
    assert background.count(before) == 1, f'Unexpected background layout: {before}'
    background = background.replace(before, after)


# Carry the asynchronous operation back to runtime.onMessage's Promise response.
# Otherwise a service-worker event can finish before its work has completed.
for topic, predicate in [('QuizAttemptData', '(0,r.isObject)'),
                         ('QuizReviewData', '(0,r.isObject)'),
                         ('SetSettings', '(0,u.isSettings)')]:
    before = f't.bind(s.default.{topic},(t=>{{{predicate}'
    replace_once(before, f't.bind(s.default.{topic},(t=>{{return {predicate}')
for method in ['sendAttemptData', 'sendReviewData']:
    replace_once(f'{method}(t){{(0,u.fetchWithTimeout)',
                 f'{method}(t){{return (0,u.fetchWithTimeout)')
for kind, variable in [('attempt', 'n'), ('review', 'i')]:
    method = 'sendAttemptData' if kind == 'attempt' else 'sendReviewData'
    before = f'o.default.info("AttemptService: Sent {kind} data",{variable}),this.quizApi.{method}({variable})'
    replace_once(before, 'return ' + before)
# A popup can save settings while the active tab has no SyncShare content script.
replace_once('this.bus.publishToActiveTab(s.default.SettingsUpdated,t),',
             'this.bus.publishToActiveTab(s.default.SettingsUpdated,t).catch(()=>{}),')
background_path.write_text(background)

archive_path = ROOT / f'syncshare-resilient-chrome-{VERSION}.zip'
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(BUILD.rglob('*')):
        if file.is_file():
            info = zipfile.ZipInfo(file.relative_to(BUILD).as_posix(), (2026, 11, 11, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, file.read_bytes())
print(f'Built {archive_path.name}; SHA256 {hashlib.sha256(archive_path.read_bytes()).hexdigest()}')
