# ArtGenTable: текущее состояние

## Короткое резюме проекта (3-5 предложений)
ArtGenTable — минималистичный статический сайт (GitHub Pages) с generative art-постами: один экран = одна работа, автозапуск, текстовая навигация. [Факт] Контент уже публикуется через shell + registry + отдельные JS-модули работ. [Факт] В проекте есть 7 опубликованных работ в реестре и базовая SEO-поверхность (wrapper-страницы, robots, sitemap). [Факт] Для части работ внедрен детерминированный render/capture pipeline (prepare/capture/finalize) с ручной валидацией кандидатов. [Факт] Контентные ассеты финализированы минимум для `spiral-time-dial`; покрытие остальных работ требует расширения.

## Что уже есть
- [Факт] Продуктовая модель и UX зафиксированы в PRD: один арт на экран, next/random/deep-link, страницы all/credits, без фреймворков.
- [Факт] Рабочая архитектура реализована: общий runtime ([docs/app.js](docs/app.js)), реестр ([docs/registry.js](docs/registry.js)), отдельные wrapper-страницы в [docs/works](docs/works).
- [Факт] В реестре 7 работ: blur-dots, random-walk, looped-curve, masked-time-dots, spiral-time-dial, pollen-clock, prism-weave.
- [Факт] Реализованы path-based роуты `/`, `/all/`, `/credits/`, `/works/<slug>.html`, плюс поддержка `/work/<slug>/` для deep capture URL.
- [Факт] Есть fullscreen-режим с авто-скрытием кнопки и ResizeObserver для корректного resize модулей.
- [Факт] SEO-база присутствует: [docs/sitemap.xml](docs/sitemap.xml), [docs/robots.txt](docs/robots.txt), meta title/description/og в wrapper-страницах.
- [Факт] Render pipeline реализован скриптами [scripts/render-pipeline.mjs](scripts/render-pipeline.mjs) и [scripts/render-capture.mjs](scripts/render-capture.mjs), зависимости в [package.json](package.json).
- [Факт] Есть render-spec для 2 работ: [render-specs/masked-time-dots.json](render-specs/masked-time-dots.json), [render-specs/spiral-time-dial.json](render-specs/spiral-time-dial.json).
- [Факт] Для `spiral-time-dial` есть финальные media-ассеты + заполненный validation-log + capture reports в [docs/media/spiral-time-dial](docs/media/spiral-time-dial).

## Что в работе
- [Факт] В [todo.md](todo.md) только 1 активный пункт: сгенерировать per-art OpenGraph изображения для каждой artwork-страницы.
- [Факт] Media pipeline фактически покрывает не все работы: финальные ассеты зафиксированы только для `spiral-time-dial`.
- [Факт] Для `masked-time-dots` есть бриф и render-spec, но финальных media-файлов в `docs/media/masked-time-dots/` нет.
- [Факт] Для `pollen-clock` работа опубликована в реестре и sitemap, но render-spec и media-папка отсутствуют.

## Контентный pipeline (пошагово)
1. Идея/концепт оформляется в brief (например, [briefs/spiral-time-dial.md](briefs/spiral-time-dial.md)). [Факт]
2. Создается арт-модуль в [docs/works](docs/works) + wrapper-страница + запись в [docs/registry.js](docs/registry.js). [Факт]
3. Для рендеринга медиа настраивается spec в [render-specs/<slug>.json](render-specs). [Факт]
4. `prepare` генерирует `manifest.json` кандидатов и `validation-log.md`. [Факт]
5. `render-capture` headless (Playwright) снимает still/video кандидаты в `docs/media/<slug>/candidates/...`. [Факт]
6. Автор вручную отбирает кандидаты и отмечает approved id в validation log. [Факт]
7. `finalize` копирует выбранные файлы в финальные имена (`og-image`, `poster-frame`, `loop-*`) и пишет `metadata.json`. [Факт]
8. Публикация происходит через статический `docs/` (GitHub Pages). [Факт]
9. Что автоматизировано агентами: в конфиге Copilot определены специализированные skills/агенты для генерации модуля, упаковки поста, deploy-check и render-assets; факт их реального запуска в истории этого репозитория не подтвержден артефактами. [Факт + Требует уточнения]

## Каналы трафика
- [Факт] Органический SEO: indexable страницы (`/`, `/all/`, `/credits/`, `/works/...`) + sitemap + robots.
- [Факт] Direct/deep links: отдельные URL каждой работы и deep-link в UI.
- [Факт] Соц-сниппеты технически поддерживаются (OG meta + pipeline ассетов).
- [Требует уточнения] Реальные внешние каналы дистрибуции (X/Instagram/Telegram/Reddit/и т.д.), контент-календарь и фактические источники трафика не описаны в файлах.

## Ближайшие 5 приоритетных шагов
1. Довести per-art OG-image для всех работ и подключить их в `og:image` wrapper-страниц.
2. Расширить render-spec + media-пайплайн минимум на `pollen-clock` и закрыть `masked-time-dots` до финальных ассетов.
3. Синхронизировать sitemap/обертки/реестр при появлении новых работ (проверка полноты публикации).
4. Зафиксировать единый процесс «идея -> модуль -> media -> публикация» как короткий чеклист для владельца.
5. Добавить базовую аналитику трафика (хотя бы pageview по slug), чтобы оценивать каналы привлечения.

## Риски и узкие места
- [Факт] Разрыв между количеством опубликованных работ (7) и покрытием media pipeline (фактически 1 финализированный slug).
- [Факт] В wrapper-страницах сейчас используется `og-default.svg`, поэтому per-art превью не подключены автоматически.
- [Факт] В `sitemap.xml` используется `https://example.com` (плейсхолдер), а не прод-домен.
- [Факт] В `credits` сейчас хардкод-плейсхолдеры (`genarttable.local`, `github.com/genarttable`).
- [Требует уточнения] Неясно, какие артефакты считаются обязательными перед публикацией каждой работы (только страница или страница+media пакет).

## Что уточнить у владельца проекта
1. Какой прод-домен должен стоять в sitemap/canonical/OG URL?
2. Является ли media-пакет (og/poster/loop) обязательным для каждой новой работы до релиза?
3. Какие внешние каналы трафика целевые и какие форматы нужны по приоритету (landscape/vertical/square)?
4. Нужен ли единый стандарт метаданных (title/description/date/tags) для всех работ?
5. Есть ли требование по аналитике (GA/Plausible/Cloudflare) и KPI на трафик/удержание?

## Противоречия и места, требующие уточнения
- [Требует уточнения] В repo-memory есть запись о verified capture для `masked-time-dots`, но в текущем дереве нет финальных media-артефактов для этого slug.
- [Требует уточнения] В [todo.md](todo.md) задача про per-art OG уже стоит, при этом для `spiral-time-dial` физически есть `og-image.png`, но он не подключен в `og:image` wrapper-страницы.