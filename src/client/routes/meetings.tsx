import { Link, useParams } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDashedIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { type Meeting, type Project, type Task, type TaskStatus, type Topic, TASK_STATUSES, taskKey } from "../../shared/entities";
import { uuidv7 } from "../../shared/ids";
import { byRank } from "../../shared/rank";
import { Empty, LinkifiedText, MemberAvatar, SectionHeading, STATUS_LABEL, StatusDot } from "@/components/common";
import { SortableList, type SortableRowProps } from "@/components/SortableList";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";

const useProject = (key: string) => useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === key));

/** The Project's open Meeting, if any. */
export function useOpenMeeting(projectId: string | undefined) {
  return useWorkspace((s) => (projectId ? Object.values(s.view.meetings).find((m) => m.projectId === projectId && m.endedAt === null) : undefined));
}

/** Agenda: unresolved Topics, plus those resolved in the open Meeting (so they stay visible while it runs). */
function useAgenda(projectId: string, openMeetingId: string | undefined) {
  const topics = useWorkspace((s) => s.view.topics);
  return useMemo(
    () =>
      Object.values(topics)
        .filter((t) => t.projectId === projectId && (t.resolvedAt === null || (openMeetingId !== undefined && t.resolvedInMeetingId === openMeetingId)))
        .sort(byRank),
    [topics, projectId, openMeetingId],
  );
}

function useActiveMembers() {
  const members = useWorkspace((s) => s.view.members);
  return useMemo(() => Object.values(members).filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)), [members]);
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const date = (at: number) => new Date(at).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });

// ---- Page ----

export function ProjectMeetingsPage() {
  const { slug, key } = useParams({ from: "/w/$slug/p/$key/meetings" });
  const project = useProject(key);
  const open = useOpenMeeting(project?.id);
  if (!project) return null;
  return open ? <MeetingInProgress slug={slug} project={project} meeting={open} /> : <NextMeeting slug={slug} project={project} />;
}

// ---- Between Meetings: build the agenda ----

function NextMeeting({ slug, project }: { slug: string; project: Project }) {
  const socket = useSocket();
  const agenda = useAgenda(project.id, undefined);
  const archived = project.archivedAt !== null;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate font-heading text-xl font-semibold">Next Meeting</h1>
        <Button disabled={archived} onClick={() => socket.send("meeting.start", { id: uuidv7(), projectId: project.id })}>
          <PlayIcon /> Start Meeting
        </Button>
      </header>

      <section className="space-y-2">
        <SectionHeading count={agenda.length}>Topics</SectionHeading>
        {agenda.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Nothing to discuss yet. Add a Topic below.</p>
        ) : (
          <SortableList
            items={agenda}
            label={(t) => t.title}
            onReorder={(t, rank) => socket.send("topic.move", { id: t.id, rank })}
            renderItem={(topic, row) => <TopicCard key={topic.id} slug={slug} project={project} topic={topic} row={row} />}
          />
        )}
        {!archived && <AddTopicForm project={project} />}
      </section>

      <PastMeetings slug={slug} project={project} />
    </div>
  );
}

function TopicCard({ slug, project, topic, row }: { slug: string; project: Project; topic: Topic; row: SortableRowProps }) {
  const socket = useSocket();
  const me = useWorkspace((s) => s.memberId);
  const author = useWorkspace((s) => s.view.members[topic.authorId]);
  const [editing, setEditing] = useState(false);
  const { handle, moveButtons, className, ...li } = row;

  return (
    <li {...li} className={cn("flex items-start gap-3 rounded-lg border bg-card px-3 py-3 text-sm sm:py-2.5", className)}>
      <span className="mt-0.5 flex">{handle}</span>
      {editing ? (
        <TopicEditor project={project} topic={topic} onDone={() => setEditing(false)} />
      ) : (
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{topic.title}</p>
          {topic.body && <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{topic.body}</p>}
          <TaskRef slug={slug} project={project} topic={topic} />
        </div>
      )}
      {!editing && (
        <>
          {moveButtons}
          {author && <MemberAvatar name={author.name} />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${topic.title}`} onMouseDown={(e) => e.stopPropagation()}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}><PencilIcon /> Edit</DropdownMenuItem>
              {topic.authorId === me && (
                <DropdownMenuItem variant="destructive" onSelect={() => socket.send("topic.delete", { id: topic.id })}>
                  <Trash2Icon /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  );
}

/** Shows the Task a Topic points at, if any. */
function TaskRef({ slug, project, topic }: { slug: string; project: Project; topic: Topic }) {
  const task = useWorkspace((s) => (topic.refId ? s.view.tasks[topic.refId] : undefined));
  if (!task) return null;
  return (
    <Link
      to="/w/$slug/p/$key/t/$number"
      params={{ slug, key: project.key, number: String(task.number) }}
      draggable={false}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
    >
      <StatusDot status={task.status} />
      <span className="font-mono text-muted-foreground">{taskKey(project, task)}</span>
      <span className="truncate">{task.title}</span>
    </Link>
  );
}

function useOpenTasks(projectId: string) {
  const tasks = useWorkspace((s) => s.view.tasks);
  return useMemo(
    () => Object.values(tasks).filter((t) => t.projectId === projectId && (t.status === "todo" || t.status === "in_progress")).sort((a, b) => a.number - b.number),
    [tasks, projectId],
  );
}

/** Optional "about this Task" picker for a Topic. */
function TaskPicker({ project, value, onChange }: { project: Project; value: string; onChange: (v: string) => void }) {
  const tasks = useOpenTasks(project.id);
  const current = useWorkspace((s) => (value ? s.view.tasks[value] : undefined));
  const options = current && !tasks.includes(current) ? [current, ...tasks] : tasks;
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} aria-label="Related Task" className="w-full sm:w-auto">
      <NativeSelectOption value="">No related Task</NativeSelectOption>
      {options.map((t) => <NativeSelectOption key={t.id} value={t.id}>{taskKey(project, t)} {t.title}</NativeSelectOption>)}
    </NativeSelect>
  );
}

function AddTopicForm({ project }: { project: Project }) {
  const socket = useSocket();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [taskId, setTaskId] = useState("");
  const [more, setMore] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = taskId ? { type: "task" as const, id: taskId } : undefined;
    if (socket.send("topic.create", { id: uuidv7(), projectId: project.id, title, body: body || undefined, ref })) {
      setTitle("");
      setBody("");
      setTaskId("");
      setMore(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a Topic to discuss" aria-label="Topic title" className="h-9" />
        {!more && (
          <Button type="button" variant="ghost" className="h-9" onClick={() => setMore(true)} aria-label="Add details">
            <ListPlusIcon /> <span className="hidden sm:inline">Details</span>
          </Button>
        )}
        <Button type="submit" className="h-9" disabled={!title.trim()}><PlusIcon /> Add</Button>
      </div>
      {more && (
        <div className="space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Context, links, what you want to decide…" className="min-h-20" />
          <TaskPicker project={project} value={taskId} onChange={setTaskId} />
        </div>
      )}
    </form>
  );
}

function TopicEditor({ project, topic, onDone }: { project: Project; topic: Topic; onDone: () => void }) {
  const socket = useSocket();
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.body);
  const [taskId, setTaskId] = useState(topic.refId ?? "");
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    socket.send("topic.update", { id: topic.id, title, body, ref: taskId ? { type: "task", id: taskId } : null });
    onDone();
  };
  return (
    <form onSubmit={save} className="min-w-0 flex-1 space-y-2" onMouseDown={(e) => e.stopPropagation()}>
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Topic title" onKeyDown={(e) => e.key === "Escape" && onDone()} />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details" className="min-h-20" />
      <TaskPicker project={project} value={taskId} onChange={setTaskId} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!title.trim()}>Save</Button>
      </div>
    </form>
  );
}

// ---- During a Meeting ----

function MeetingInProgress({ slug, project, meeting }: { slug: string; project: Project; meeting: Meeting }) {
  const agenda = useAgenda(project.id, meeting.id);
  const starter = useWorkspace((s) => s.view.members[meeting.startedBy]);
  const resolved = agenda.filter((t) => t.resolvedInMeetingId === meeting.id).length;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
          </span>
          <h1 className="min-w-0 flex-1 truncate font-heading text-xl font-semibold">Meeting in progress</h1>
          <CloseMeetingButton meeting={meeting} unresolved={agenda.length - resolved} />
        </div>
        <p className="text-sm text-muted-foreground">
          Started {time(meeting.startedAt)}{starter && ` by ${starter.name}`} · {resolved} of {agenda.length} Topics discussed
        </p>
        <Attendees meeting={meeting} />
      </header>

      {agenda.length === 0 && <Empty>No Topics on the agenda. Add one below.</Empty>}
      <ol className="space-y-3">
        {agenda.map((topic, i) => (
          <MeetingTopic key={topic.id} index={i + 1} slug={slug} project={project} meeting={meeting} topic={topic} />
        ))}
      </ol>
      <AddTopicForm project={project} />
    </div>
  );
}

function Attendees({ meeting }: { meeting: Meeting }) {
  const socket = useSocket();
  const members = useActiveMembers();
  const attending = new Set(meeting.attendeeIds);
  const toggle = (id: string) => {
    const next = attending.has(id) ? meeting.attendeeIds.filter((x) => x !== id) : [...meeting.attendeeIds, id];
    socket.send("meeting.setAttendees", { id: meeting.id, memberIds: next });
  };
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Attendees">
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={attending.has(m.id)}
          onClick={() => toggle(m.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs transition-colors",
            attending.has(m.id) ? "border-foreground/30 bg-muted text-foreground" : "border-dashed text-muted-foreground opacity-60 hover:opacity-100",
          )}
        >
          <MemberAvatar name={m.name} className="size-5" />
          {m.name}
        </button>
      ))}
    </div>
  );
}

function CloseMeetingButton({ meeting, unresolved }: { meeting: Meeting; unresolved: number }) {
  const socket = useSocket();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline"><SquareIcon /> Close</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close this Meeting?</AlertDialogTitle>
          <AlertDialogDescription>
            {unresolved === 0
              ? "Every Topic has an Outcome. The Meeting will be saved to past Meetings."
              : `${unresolved} Topic${unresolved === 1 ? "" : "s"} without an Outcome will carry over to the next Meeting.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction onClick={() => socket.send("meeting.close", { id: meeting.id })}>Close Meeting</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MeetingTopic({ index, slug, project, meeting, topic }: { index: number; slug: string; project: Project; meeting: Meeting; topic: Topic }) {
  const socket = useSocket();
  const author = useWorkspace((s) => s.view.members[topic.authorId]);
  const resolved = topic.resolvedInMeetingId === meeting.id;
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  return (
    <li>
      <Card className={cn("gap-3 px-4", resolved && "bg-card/50")}>
        <div className="flex items-start gap-3">
          {resolved ? (
            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-400" aria-label="Discussed" />
          ) : (
            <CircleDashedIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Not discussed yet" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">
              <span className="mr-1.5 text-muted-foreground">{index}.</span>
              {topic.title}
            </p>
            {topic.body && <p className="whitespace-pre-wrap text-muted-foreground">{topic.body}</p>}
            {topic.refId && <RefTaskControls slug={slug} project={project} taskId={topic.refId} />}
          </div>
          {author && <MemberAvatar name={author.name} />}
        </div>

        {resolved && !editingOutcome ? (
          <div className="ml-8 space-y-2">
            <div className="rounded-md bg-muted/60 px-3 py-2">
              <LinkifiedText slug={slug} text={topic.outcome ?? ""} />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditingOutcome(true)}><PencilIcon /> Edit</Button>
              <Button variant="ghost" size="sm" onClick={() => setCreatingTask(true)}><PlusIcon /> Task</Button>
              <Button variant="ghost" size="sm" onClick={() => socket.send("meeting.clearOutcome", { topicId: topic.id })}><XIcon /> Clear</Button>
            </div>
          </div>
        ) : (
          <OutcomeEditor
            initial={topic.outcome ?? ""}
            onSave={(outcome) => {
              socket.send("meeting.recordOutcome", { topicId: topic.id, outcome });
              setEditingOutcome(false);
            }}
            onCancel={resolved ? () => setEditingOutcome(false) : undefined}
            onCreateTask={resolved ? undefined : () => setCreatingTask(true)}
          />
        )}

        {creatingTask && <CreateTaskForm topic={topic} onDone={() => setCreatingTask(false)} />}
      </Card>
    </li>
  );
}

function OutcomeEditor({ initial, onSave, onCancel, onCreateTask }: {
  initial: string;
  onSave: (outcome: string) => void;
  onCancel?: () => void;
  onCreateTask?: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <form
      className="ml-8 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave(text);
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Outcome: what did you decide?"
        aria-label="Outcome"
        className="min-h-16"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) onSave(text);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!text.trim()}>Record Outcome</Button>
        {onCreateTask && <Button type="button" variant="outline" size="sm" onClick={onCreateTask}><PlusIcon /> Create Task</Button>}
        {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

/** Creates a Task (optionally assigned) and adds "Created WEB-12 for Alice" to the Topic's Outcome. */
function CreateTaskForm({ topic, onDone }: { topic: Topic; onDone: () => void }) {
  const socket = useSocket();
  const members = useActiveMembers();
  const [title, setTitle] = useState(topic.title);
  const [assigneeId, setAssigneeId] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket.send("meeting.createTask", { topicId: topic.id, taskId: uuidv7(), title, assigneeId: assigneeId || null })) onDone();
  };
  return (
    <form onSubmit={submit} className="ml-8 space-y-2 rounded-md border border-dashed p-3">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">New Task</p>
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" onKeyDown={(e) => e.key === "Escape" && onDone()} />
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assignee">
          <NativeSelectOption value="">Unassigned</NativeSelectOption>
          {members.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.name}</NativeSelectOption>)}
        </NativeSelect>
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!title.trim()}>Create Task</Button>
      </div>
    </form>
  );
}

/** The Topic's related Task, with status and assignee editable right in the Meeting. */
function RefTaskControls({ slug, project, taskId }: { slug: string; project: Project; taskId: string }) {
  const socket = useSocket();
  const task = useWorkspace((s) => s.view.tasks[taskId]) as Task | undefined;
  const members = useActiveMembers();
  if (!task) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Link
        to="/w/$slug/p/$key/t/$number"
        params={{ slug, key: project.key, number: String(task.number) }}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted"
      >
        <span className="font-mono text-muted-foreground">{taskKey(project, task)}</span>
        <span className="truncate">{task.title}</span>
      </Link>
      <NativeSelect size="sm" value={task.status} aria-label="Task status" onChange={(e) => socket.send("task.setStatus", { id: task.id, status: e.target.value as TaskStatus })}>
        {TASK_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{STATUS_LABEL[s]}</NativeSelectOption>)}
      </NativeSelect>
      <NativeSelect size="sm" value={task.assigneeId ?? ""} aria-label="Task assignee" onChange={(e) => socket.send("task.update", { id: task.id, assigneeId: e.target.value || null })}>
        <NativeSelectOption value="">Unassigned</NativeSelectOption>
        {members.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.name}</NativeSelectOption>)}
      </NativeSelect>
    </div>
  );
}

// ---- Past Meetings ----

function useResolvedCounts() {
  const topics = useWorkspace((s) => s.view.topics);
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of Object.values(topics)) if (t.resolvedInMeetingId) counts.set(t.resolvedInMeetingId, (counts.get(t.resolvedInMeetingId) ?? 0) + 1);
    return counts;
  }, [topics]);
}

function PastMeetings({ slug, project }: { slug: string; project: Project }) {
  const meetings = useWorkspace((s) => s.view.meetings);
  const counts = useResolvedCounts();
  const past = useMemo(
    () => Object.values(meetings).filter((m) => m.projectId === project.id && m.endedAt !== null).sort((a, b) => b.startedAt - a.startedAt),
    [meetings, project.id],
  );
  if (past.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHeading count={past.length}>Past Meetings</SectionHeading>
      <ul className="flex flex-col gap-1.5">
        {past.map((m) => (
          <li key={m.id}>
            <Link
              to="/w/$slug/p/$key/meetings/$meetingId"
              params={{ slug, key: project.key, meetingId: m.id }}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted"
            >
              <span className="flex-1 font-medium">{date(m.startedAt)}</span>
              <span className="text-xs text-muted-foreground">
                {counts.get(m.id) ?? 0} Topics · {m.attendeeIds.length} attended
              </span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PastMeetingPage() {
  const { slug, key, meetingId } = useParams({ from: "/w/$slug/p/$key/meetings/$meetingId" });
  const project = useProject(key);
  const meeting = useWorkspace((s) => s.view.meetings[meetingId]);
  const allTopics = useWorkspace((s) => s.view.topics);
  const members = useWorkspace((s) => s.view.members);
  const topics = useMemo(() => Object.values(allTopics).filter((t) => t.resolvedInMeetingId === meetingId).sort(byRank), [allTopics, meetingId]);

  if (!project || !meeting) return <Empty>Meeting not found.</Empty>;
  const minutes = meeting.endedAt ? Math.max(1, Math.round((meeting.endedAt - meeting.startedAt) / 60_000)) : null;

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link to="/w/$slug/p/$key/meetings" params={{ slug, key }}>← Meetings</Link>
        </Button>
      </div>
      <header className="space-y-1">
        <h1 className="font-heading text-xl font-semibold">{date(meeting.startedAt)}</h1>
        <p className="text-sm text-muted-foreground">
          {time(meeting.startedAt)}
          {meeting.endedAt && `–${time(meeting.endedAt)}`}
          {minutes && ` · ${minutes} min`}
        </p>
      </header>
      <section className="space-y-2">
        <SectionHeading count={meeting.attendeeIds.length}>Attendees</SectionHeading>
        <div className="flex flex-wrap gap-1.5">
          {meeting.attendeeIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs">
              <MemberAvatar name={members[id]?.name ?? "?"} className="size-5" />
              {members[id]?.name ?? "Unknown"}
            </span>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <SectionHeading count={topics.length}>Topics</SectionHeading>
        {topics.length === 0 && <p className="text-sm text-muted-foreground">No Topics were resolved in this Meeting.</p>}
        <ol className="space-y-2">
          {topics.map((t) => (
            <li key={t.id}>
              <Card className="gap-2 px-4">
                <p className="font-medium">{t.title}</p>
                {t.body && <p className="whitespace-pre-wrap text-muted-foreground">{t.body}</p>}
                <div className="rounded-md bg-muted/60 px-3 py-2">
                  <LinkifiedText slug={slug} text={t.outcome ?? ""} />
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
