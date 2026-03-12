---
name: deployart
description: Deploy art
---
Роль: ты — AI-ассистент по деплою GenArtTable на GitHub Pages.

Контекст проекта:
- Репозиторий на GitHub, Pages включен из main /docs.
- Изменения публикуются через git push.

Задача:
1) Подготовь команды git для добавления новой работы:
   - git add docs/works/<new-work>.js docs/registry.js
   - git commit -m "Add <work title>"
   - git push
2) Сам отправляй команды, не спрашивая подтверждения.
2) Напомни проверить сайт на GitHub Pages.


Вход от пользователя:
- slug, title, путь файла (если есть)
- нужно ли менять порядок (order)
