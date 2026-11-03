# Project Management

A small shared tool for a handful of people to agree on what to build, split it into work, assign it, and keep a list of things to discuss at their next meeting.

## Language

### People and scope

**Workspace**:
A fixed group of people who work together and see the same data. Different groups of people get different Workspaces.
_Avoid_: Team, organization, tenant

**Member**:
A person belonging to a Workspace. Every change is attributed to a Member, even when an agent made it on their behalf.
_Avoid_: User, account

**Project**:
A body of work inside a Workspace (a product, a side project). A Workspace can hold several Projects; every Feature and Task belongs to exactly one.
_Avoid_: Board, space

**Project key**:
A short prefix unique to a Project within its Workspace (e.g. `WEB`), used to form Task keys. Fixed once the Project is created.

### Planning

**Feature**:
A proposal for something to build, discussed by Members and then accepted or rejected. Agreement is informal: any Member may accept or reject it. Status is one of _Proposed_, _Accepted_, _Rejected_, _Done_; _Done_ is set by a Member, never automatically.
_Avoid_: Epic, idea, request

**Task**:
A unit of work with at most one assignee Member. Usually part of an accepted Feature, but may stand alone (bugs, chores). Status is one of _Todo_, _In progress_, _Done_, _Canceled_. Priority is expressed by manual ordering, not a field.
_Avoid_: Issue, ticket, card

**Task key**:
The human-readable identifier of a Task: its Project key plus a per-Project number (e.g. `WEB-12`).
_Avoid_: Ticket number

**Comment**:
A message by a Member on a Feature or Task; where discussion and agreement happen.

**Activity**:
The recorded history of changes in a Workspace: what changed, when, and which Member did it, optionally noting the agent acting on their behalf.
_Avoid_: Log, audit trail, feed

### Meetings

**Topic**:
Something a Member wants to discuss at the next Meeting. May reference a Feature or Task. A Topic is resolved once it has an Outcome; a Topic left without one carries over to the next Meeting.
_Avoid_: Inbox item, to-sync, agenda item

**Meeting**:
A synchronous session of Members (call or in person) held at irregular intervals. Its agenda is the open Topics; once closed it remains as a record of what was decided.
_Avoid_: Sync, call, standup

**Outcome**:
The short written result of discussing a Topic in a Meeting (e.g. "agreed, WEB-12 created", "dropped, not worth it"). Postponing a Topic means leaving it without an Outcome.
_Avoid_: Decision, resolution

### GitHub

**Pull Request link**:
A reference from a Task to one GitHub pull request, added by a Member, showing the pull request's state (_Draft_, _Open_, _Merged_, _Closed_). The link lives on the Task only; nothing on the GitHub side points back.
_Avoid_: PR attachment
