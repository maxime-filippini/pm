import type { Command } from "../../../shared/commands";
import type { CommandContext } from "../context";
import * as project from "./project";
import * as task from "./task";

export function apply(ctx: CommandContext, command: Command): void {
  switch (command.name) {
    case "project.create": return project.create(ctx, command.args);
    case "project.rename": return project.rename(ctx, command.args);
    case "project.archive": return project.setArchived(ctx, command.args, true);
    case "project.unarchive": return project.setArchived(ctx, command.args, false);
    case "task.create": return task.create(ctx, command.args);
    case "task.update": return task.update(ctx, command.args);
    case "task.setStatus": return task.setStatus(ctx, command.args);
    case "task.move": return task.move(ctx, command.args);
  }
}
