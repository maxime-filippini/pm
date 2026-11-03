import type { Command } from "../../../shared/commands";
import type { CommandContext } from "../context";
import * as feature from "./feature";
import * as meeting from "./meeting";
import * as project from "./project";
import * as task from "./task";
import * as topic from "./topic";

export function apply(ctx: CommandContext, command: Command): void {
  switch (command.name) {
    case "project.create": return project.create(ctx, command.args);
    case "project.rename": return project.rename(ctx, command.args);
    case "project.archive": return project.setArchived(ctx, command.args, true);
    case "project.unarchive": return project.setArchived(ctx, command.args, false);
    case "feature.create": return feature.create(ctx, command.args);
    case "feature.update": return feature.update(ctx, command.args);
    case "feature.setStatus": return feature.setStatus(ctx, command.args);
    case "meeting.createFeature": return meeting.createFeature(ctx, command.args);
    case "task.create": return task.create(ctx, command.args);
    case "task.update": return task.update(ctx, command.args);
    case "task.setStatus": return task.setStatus(ctx, command.args);
    case "task.move": return task.move(ctx, command.args);
    case "task.delete": return task.remove(ctx, command.args);
    case "task.restore": return task.restore(ctx, command.args);
    case "topic.create": return topic.create(ctx, command.args);
    case "topic.update": return topic.update(ctx, command.args);
    case "topic.move": return topic.move(ctx, command.args);
    case "topic.delete": return topic.remove(ctx, command.args);
    case "meeting.start": return meeting.start(ctx, command.args);
    case "meeting.setAttendees": return meeting.setAttendees(ctx, command.args);
    case "meeting.recordOutcome": return meeting.recordOutcome(ctx, command.args);
    case "meeting.clearOutcome": return meeting.clearOutcome(ctx, command.args);
    case "meeting.createTask": return meeting.createTask(ctx, command.args);
    case "meeting.close": return meeting.close(ctx, command.args);
    case "meeting.delete": return meeting.remove(ctx, command.args);
    case "meeting.restore": return meeting.restore(ctx, command.args);
  }
}
