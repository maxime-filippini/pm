# One Durable Object per Workspace

All data for a Workspace (every Project, Feature, Task, Comment, Topic, Meeting and Activity entry) lives in a single SQLite-backed Durable Object, addressed by the Workspace's id. A Workspace is a fixed group of people, so the data stays tiny and the write rate stays low. One object gives us transactional writes across Projects, plain SQL joins, and a single place to broadcast changes from. D1 holds only what has to live outside any one Workspace: the registry of Workspaces, Member emails, and which Workspaces each email belongs to.

## Considered Options

- **One DO per Project**: rejected. Meetings, Activity and "My Tasks" span Projects, so we would need cross-object queries and fan-out for no scaling benefit.
- **D1 for everything, DO only for WebSocket fan-out**: rejected. Two sources of truth, and every write would cross a network hop before it could be broadcast.

## Consequences

A new group of people means a new Workspace and a new DO, never a bigger one. If a Workspace ever outgrew one object (very unlikely at this scale), splitting it would be a data migration.
