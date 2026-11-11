# SyncShare Resilient

## Установка

### Firefox (Windows и Linux)

1. Скачай [готовый ZIP расширения 1.1.6.2](https://github.com/WhaleShip/syncshare-resilient/releases/download/v1.1.6.2/syncshare-resilient-1.1.6.2.zip) на нужный компьютер. Собирать и распаковывать не нужно.
2. В Firefox вставь в адресную строку:

   ```text
   about:debugging#/runtime/this-firefox
   ```

3. Нажми **«Загрузить временное дополнение…»** и выбери этот ZIP. Если предыдущая временная версия уже загружена, сначала удали её.
4. В списке появится **SyncShare Resilient 1.1.6.2**.
5. Обнови страницу с тестом, предварительно сохранив ответы.

После полного закрытия Firefox расширение придётся загрузить заново — используй тот же ZIP, повторная сборка не нужна. Для постоянной установки потребуется подпись Mozilla.

[Инструкция Mozilla](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/). Архив **Source code** на странице релиза содержит исходники; для установки нужен ZIP по ссылке выше.

### Chrome

Текущий релиз **1.1.6.2 предназначен для Firefox** и использует Manifest V2. В Chrome 139 и новее поддержка этого формата удалена, поэтому установить эту сборку через «Загрузить распакованное расширение» не получится. Для Chrome нужна отдельная версия на Manifest V3; готовой сборки в этом репозитории пока нет. Сейчас используй Firefox по инструкции выше.

[О прекращении поддержки Manifest V2 в Chrome](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline).

## About

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
