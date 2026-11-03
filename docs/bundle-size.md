# Route bundle verification

Measured on 2026-11-03 with the same installed dependencies, default production minification and `pnpm build`. Before: `style/page-sections` (`a608d96`). After: route-splitting implementation.

Use `pnpm build && pnpm bundle:report` to reproduce the after measurements. The report follows only static imports in Vite’s manifest and sums the bytes and Node `gzipSync` size of each JavaScript file. Gzip figures can differ slightly from Vite’s build-log estimates. CSS, fonts and API data are excluded from these JavaScript figures.

- Before: one JavaScript file, **825,231 bytes / 254,205 gzip bytes** loaded on every route.
- After, entry plus all static imports: **341,172 bytes / 109,019 gzip bytes**; no route modules in that graph.
- After, Home plus its static imports: **390,618 bytes / 129,130 gzip bytes**, a **52.7%** raw / **49.2%** gzip reduction from the previous Home load.
- The entry file itself is 239,620 bytes; this alone is not the full initial payload.

All screen components use TanStack Router’s lazy route components. The Project layout is separate from Task list screens, shared Feature progress UI lives outside route modules, and plain Task cards no longer import drag-and-drop code.

## Browser evidence

A local production preview (`pnpm preview --host 0.0.0.0 --port 4173`) loaded Home. Resource timing showed only the entry/shared chunks plus Home, its API/header/common UI and last-Project code. Task, Feature and Meeting route chunks were absent.

Normal links then opened Projects, a Project Task list, Features, Meetings and settings. The Feature route chunk appeared only after navigation to Features; Task and Meeting route chunks were still absent at that point.

A temporary local proxy returned 503 for the Task route chunk: the screen displayed **This page could not load**, **Reload page** and **Go home**. Changing the proxy to a two-second chunk delay and selecting Reload showed **Loading page…**, then the Task screen. No build assets or repository files were altered for this simulation.

This is build/network verification, not a Lighthouse or Core Web Vitals measurement. No browser performance-trace tools were available in this session.
