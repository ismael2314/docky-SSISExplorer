# Docky API (Node)

Reads SSIS files from `./packages` and serves them as JSON. This is the first version of the
backend; the .NET version will expose the same endpoints and the same JSON, so the React app
does not change.

```bash
cd server
npm install
npm start            # http://127.0.0.1:5000   (npm run dev = auto-restart on change)
npm run parse -- packages/LOAD_MAIN_MASTER.dtsx   # print the parsed model, no server
```

Environment variables: `PORT` (5000), `HOST` (127.0.0.1), `PACKAGES_DIR` (./packages),
`DATA_DIR` (./data, holds settings.json), `DOCKY_SQL_PASSWORD` (optional default SQL password; with it set, the Jobs page opens without asking for one).

> **No login yet.** The API listens on localhost only. Do not set `HOST=0.0.0.0` or put it on a
> network until authentication is added: anyone who can reach it can upload and delete files and
> make the server connect to a SQL Server.

## Endpoints

| Endpoint | What it does |
|---|---|
| `POST /api/jobs` | SQL Server Agent jobs from msdb, soonest next run first, with schedules in words and the SSIS package each step runs |
| `GET /api/dashboard` | totals and breakdowns across all packages (what the dashboard shows) |
| `GET /api/packages` | every package: id, name, stats, child packages (found or not) |
| `GET /api/packages/:id` | summary: variables (with `used` / `usedBy`), connections, stats |
| `GET /api/packages/:id/hierarchy` | full call tree: tasks in run order, called packages nested, loops and missing children flagged, plus a package-level graph |
| `GET /api/packages/:id/flow` | control flow: `nodes` (with `parent` for containers) and `edges` |
| `GET /api/packages/:id/dataflow?task=<refId>` | components of one Data Flow Task, with `columns` (types, mapping) |
| `GET /api/files` | files in the packages folder |
| `PUT /api/files/:name[?overwrite=1]` | upload a `.dtsx`, `.conmgr` or `.ispac` (raw body) |
| `DELETE /api/files/:name` | remove a file |
| `GET /api/connections` | project connections from `.conmgr` files (passwords masked) |
| `GET/PUT /api/settings` | saved SQL Server settings (never the password) |
| `POST /api/catalog/test` | test a SQL Server connection |
| `POST /api/catalog/projects` | list folders and projects in the SSIS catalog |
| `POST /api/catalog/import` | download projects from the catalog into the packages folder |

A package's id is its file name without `.dtsx`. Execute Package Tasks are matched to other files in
the same folder by name (case-insensitive).

## Files

- `dashboard.js` summary across all packages for the dashboard
- `dtsx.js`    parser: `.dtsx` and `.conmgr` in, JSON model out (pure functions)
- `store.js`   packages folder, upload validation, settings file
- `hierarchy.js` the cross-package call tree
- `jobs.js`    SQL Server Agent jobs (msdb): schedule wording, step-to-package matching
- `ispac.js`   unpacks a project file (`.ispac` is a zip)
- `catalog.js` SQL Server access (SSISDB), using the pure-JS `mssql` driver
- `index.js`   the HTTP API
