# Validation Log: Spiral Time Dial

## Общая проверка
- [x] Seed зафиксирован для всех approved assets
- [x] Fixed time согласован для image/video candidates
- [x] Итоговые ассеты соответствуют intended use-case

## og-image
- [x] Выбран лучший кандидат
- [x] Композиция не ломается в целевом размере
- [x] Кадр читается в маленьком превью
- [x] Нет UI-артефактов
- [x] Approved candidate id: og-image--seed-spiral-a--time-2026-04-08T03-03-30-000Z--frame-0-75

## poster-frame
- [x] Выбран лучший кандидат
- [x] Композиция не ломается в целевом размере
- [x] Кадр читается в маленьком превью
- [x] Нет UI-артефактов
- [x] Approved candidate id: poster-frame--seed-spiral-a--time-2026-04-08T03-03-30-000Z--frame-0-75

## loop-landscape
- [x] Выбран лучший кандидат
- [x] Композиция не ломается в целевом размере
- [x] Loop визуально гладкий на стыке
- [x] Нет UI-артефактов
- [x] Approved candidate id: loop-landscape--seed-spiral-a--time-2026-04-08T03-03-30-000Z--dur-4

## loop-vertical
- [x] Выбран лучший кандидат
- [x] Композиция не ломается в целевом размере
- [x] Loop визуально гладкий на стыке
- [x] Нет UI-артефактов
- [x] Approved candidate id: loop-vertical--seed-spiral-a--time-2026-04-08T03-03-30-000Z--dur-4

## Spec Notes
- [x] Не бери кадры, где стрелки почти сливаются со спиралью.
- [x] Стык loop должен быть незаметен по частицам и секундам.
- [x] Проверяй thumbnail-читабельность: в маленьком размере должен считываться центральный спиральный мотив.

## Final Decision
- [x] Approved
- [ ] Needs recapture

## Notes
- Selected a single aligned seed/time set across all targets: `seed-spiral-a` at `2026-04-08T03-03-30-000Z`.
