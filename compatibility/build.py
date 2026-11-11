"""Reproducible compatibility patch for the installed MIT-licensed 1.1.6 XPI."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'original.xpi'
EXPECTED = 'd48d4c9e34a36d13e653c6cf3c92368cfa6fbfb12a938da57547849885273bae'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED, 'Unexpected input XPI'
BUILD = ROOT / 'fixed'
if BUILD.exists():
    shutil.rmtree(BUILD)
with zipfile.ZipFile(SOURCE) as archive:
    for name in archive.namelist():
        if name.startswith('META-INF/'):
            continue  # The upstream signature is invalid after modification.
        target = BUILD / name
        assert target.resolve().is_relative_to(BUILD.resolve())
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(name))

attempt_path = BUILD / 'src/quizattempt.js'
attempt = attempt_path.read_text()
before = 'r=(0,a.checkNotNull)(o.querySelector("div.grade"),"Could not locate .grade");for(const e of r.innerText.matchAll(/[0-9]\\d*([.,]\\d+)?/g))'
after = 'r=o.querySelector("div.grade");for(const e of (r?r.innerText:"").matchAll(/[0-9]\\d*([.,]\\d+)?/g))'
assert attempt.count(before) == 1, 'Unexpected question module'
attempt_path.write_text(attempt.replace(before, after))

commons_path = BUILD / 'src/commons.js'
commons = commons_path.read_text()
assert commons.count('9423:function(') == 1
start = commons.index('9423:function(')
end = commons.index('3487:function(', start)
assert 'this.data.userId=parseInt(e)' in commons[start:end]
replacement = (ROOT / 'patches/user-data-source.js').read_text().strip()
commons_path.write_text(commons[:start] + '9423:' + replacement + ',' + commons[end:])

background_path = BUILD / 'src/background.js'
background = background_path.read_text()
before = 'n=yield(0,u.fetchWithTimeout)(e,{method:"GET"});return n.ok?yield n.json()'
after = 'n=yield(0,u.fetchWithTimeout)(e,{method:"GET",timeout:3e4});return n.ok?yield n.json()'
assert background.count(before) == 1, 'Unexpected solution request module'
background = background.replace(before, after)
assert background.count('8309:function(') == 1
start = background.index('8309:function(')
end = background.index('},n={};function i(', start)
replacement = (ROOT / 'patches/fetch-with-timeout.js').read_text().strip()
background_path.write_text(background[:start] + '8309:' + replacement + background[end:])

manifest_path = BUILD / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
assert manifest['version'] == '1.1.6'
assert manifest['browser_specific_settings']['gecko']['id'] == 'syncshare@naloaty.me'
manifest['version'] = '1.1.6.2'
manifest['name'] = 'SyncShare Resilient'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
# Same extension ID and permissions: a temporary build replaces the existing
# add-on for this session, rather than running two copies against one page.
shutil.copy2(ROOT / 'LICENSE.md', BUILD / 'LICENSE.md')

archive_path = ROOT / 'syncshare-resilient-1.1.6.2.zip'
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(BUILD.rglob('*')):
        if file.is_file():
            info = zipfile.ZipInfo(file.relative_to(BUILD).as_posix(), (2026, 11, 11, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, file.read_bytes())
print(f'Built {archive_path.name}; SHA256 {hashlib.sha256(archive_path.read_bytes()).hexdigest()}')
