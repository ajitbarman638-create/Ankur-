# Ankur

A calm, local-first tracker for daily tasks and habits. Three files, no build step, no accounts, no server — everything you type stays in your browser's `localStorage`.

> *Ankur* (अंकुर) means "sapling" — small things, tended daily.

## Features

**Tasks**
- Add tasks with an optional due date, priority and a short note
- Tick off, rename inline, delete (with an **Undo** toast)
- Filter by All / Active / Done, search, and sort by newest, due date, priority or A–Z
- Overdue and due-today dates are highlighted; finished tasks sink to the bottom

**Habits**
- One card per habit with the last 7 days as tappable dots
- Current streak, best streak and total check-ins per habit
- Streaks count back from today, so ticking *yesterday* still keeps a run alive

**Stats**
- Completion rate, open tasks, overdue count, check-ins this week
- A 7-day momentum chart of completed tasks
- Habit consistency across the week and a longest-streaks leaderboard

**Throughout**
- Light / dark / system theme, remembered between visits
- Keyboard-first: `1` `2` `3` switch views, `N` new task, `/` search
- Responsive down to small phones, visible focus rings, ARIA labels, reduced-motion support
- Friendly empty states plus one-click **sample data** if you want a tour

## Run it

No install, no dependencies. Either:

```bash
# open the file directly
open index.html        # macOS  (xdg-open on Linux, start on Windows)
```

or serve it (recommended, matches production):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy

It's a static site, so any static host works:

- **GitHub Pages** — Settings → Pages → deploy from branch `main`, folder `/ (root)`
- **Netlify / Vercel / Cloudflare Pages** — no build command, publish directory `.`

## Project structure

```
index.html   markup: header, three views (tasks / habits / stats), toast
styles.css   design tokens, light + dark themes, layout, components
app.js       state, persistence, rendering, streaks, stats, shortcuts
```

State is a single object saved under the `ankur.v1` key:

```js
{
  tasks:  [{ id, title, note, due, priority, done, created, completedAt }],
  habits: [{ id, name, created, history: { "YYYY-MM-DD": true } }],
  ui:     { view, filter, query, sort },
  theme:  "auto" | "light" | "dark"
}
```

## Privacy

Nothing is uploaded. There is no analytics, no network request after the page loads, and no backend. Clearing site data (or **Clear all data** on the Stats view) removes everything permanently.

## Roadmap ideas

- Export / import as JSON
- Week and month heatmaps per habit
- Optional reminders via the Notification API
- Installable PWA with offline caching

## License

MIT — do what you like with it.
