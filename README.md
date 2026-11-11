# SyncShare Resilient

Unofficial, experimental compatibility work for the Firefox 1.1.6 release.
The original project by Naloaty is licensed under MIT; its archived source
history is preserved here. This fork is not affiliated with the original author.

The archived source tree predates the installed 1.1.6 release. The reproducible
patch in [compatibility/](compatibility/README.md) therefore operates on the
original, checksum-pinned Mozilla package. Running the legacy root build does
not produce the patched extension.

The patch handles optional question grades, recognizes current-user metadata
in Moodle, and allows a longer bounded wait for solution requests. It does not
provide its own answer service. The extension still relies on the upstream
SyncShare service and retains its existing data-sharing behavior.

Version **1.1.6.2** passes 15 local regression tests. A user report confirms
that the first compatibility patch reached the solution-request stage; an
upstream request then aborted. The latest timeout adjustment has not yet been
verified against that live service flow. This is not a verified stable release.

The package is unsigned and intended for temporary Firefox loading. Permanent
distribution requires a separate Mozilla signing process and a fork-specific
extension identity. No signing checks need to be disabled for temporary loading.

## Original project

Source: [naloaty/syncshare-extension](https://github.com/naloaty/syncshare-extension).

## Learn more & download
Check out [SyncShare landing page.](https://syncshare.naloaty.me/)

# Screenshots
<img src="screenshots/demo-1.png" width="700px">
<img src="screenshots/demo-2.png" width="700px">
<img src="screenshots/demo-3.png" width="700px">
