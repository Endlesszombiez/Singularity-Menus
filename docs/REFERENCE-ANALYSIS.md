# Reference analysis: Max's Menu

Reference: <https://github.com/mogrinz/maxs-menu> (main, reviewed October 30, 2026).
Its source identifies version `1.0.0-rc3` and carries an MIT license.
This V1 is an independent implementation; it does not copy the reference's source, fonts, themes or assets.

## How the reference works

The reference uses Flask 3.1.3 and Waitress 3.0.2. `app.py` provides administration and public routes. `models.py` defines menus, accounts, settings, schedule validation and durable storage. Browser administration modules edit those records.

Its central idea is useful: assign each logical screen a permanent address and resolve its current content on the server. Each TV needs only a browser on the same network. It is independent of the server's HDMI output.

`static/display.js` polls approximately every five seconds, compares content revisions and renders updates. It caches the last received content in browser storage, fits the menu to the screen and supports rotation. Schedules choose a menu without changing the TV's address.

The reference offers ten fixed menus, ten logical screen URLs, eleven global themes, half-hour schedule windows, currency formatting, administrator/employee accounts, publication history and backups. Its schema is restaurant-oriented: headers, item names, descriptions, prices and columns.

The Pi deployment adds setup scripts, systemd services, a privileged networking helper, hotspot configuration and network-switch rollback. These are unnecessary for a Docker service on an existing LAN.

## V1 decisions

| Reference concept                              | Singularity implementation                                            |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Pi services and privileged network helper      | One unprivileged Docker container, restart policy and health check    |
| Ten fixed menu slots                           | Up to 100 boards and 100 logical screen addresses                     |
| Restaurant-specific schema                     | Eight typed templates, with production tasks as the primary workflow  |
| One global theme                               | Three themes per template, selected independently per board           |
| Changes go live on save                        | Separate draft and published snapshots                                |
| Permanent numbered screen URLs                 | Readable `/display/production-floor` style URLs                       |
| Five-second revision polling and browser cache | Five-second polling, offline cache and connection notice              |
| Half-hour daily windows                        | Minute-precision weekly windows, overnight support and overlap checks |
| File-oriented application state                | Transactional SQLite in a persistent Docker volume                    |
| Admin and employee roles                       | One admin account; public, view-only display endpoints                |
| Publication history and system backups         | Content backup/restore; no historical publication browser             |
| Rotation and configurable menu columns         | Consistent 16:9 layouts, letterboxing and automatic pagination        |

## Data flow and source map

1. The administrator signs in through `static/index.html` and `static/app.js`.
2. The server checks the session, CSRF token and input schema, then updates SQLite in a transaction.
3. Saving changes only the draft. Publishing copies the draft into the public snapshot. Per-board revisions reject stale edits.
4. A TV polls `/api/display/<slug>`. The server resolves its schedule in the workspace timezone or uses its default board.
5. The TV receives that board's published content and public workspace settings. A SHA-256 content revision avoids unnecessary rerenders.
6. `static/board.js` renders editor previews and TV displays. `static/player.js` handles polling, pagination, fullscreen and last-received caching.

`templates.py` owns the eight-template catalog and samples. `server.py` owns authentication, validation, scheduling, transactions and API routes. `manage.py` provides password recovery for someone with server access. Python API tests and JavaScript renderer tests exercise the core workflows. Styles, icons, fonts and scripts have no runtime CDN dependency.

## Deliberate boundaries

- This displays production plans; it does not record employee clock-ins or integrate with payroll.
- KPI figures are entered manually. No ERP, MES, machine or spreadsheet integrations are included.
- TV pages are view-only. Tasks change through the admin editor.
- Dates and completed tasks do not reset automatically. Update or duplicate the board for each shift.
- V1 has one admin password, without employee roles, SSO or an audit-history interface.
- Layouts are landscape 16:9. Portrait displays are letterboxed; there is no dedicated portrait template or rotation setting.
- Offline caching preserves an already loaded player's last board. A cold launch still needs the server for app assets. Players cannot switch to uncached scheduled boards while offline.
- Schedules need a correct server clock. They follow local wall-clock time: repeated DST minutes run twice, while skipped minutes do not occur.
- Display URLs intentionally have no login. Remote access requires operator-managed networking and access controls.

## Graphify

The repository initially contained only the starter README and icon. The required initial `/graphify` run was delegated to GPT-6 Luna. Graphify was installed and invoked, but its configured Gemini backend rejected semantic extraction because prepayment credits were depleted. No graph was produced. Analysis therefore used direct source inspection. Rerun `/graphify` when that backend is available to index the completed V1.
