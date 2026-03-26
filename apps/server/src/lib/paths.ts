import { homedir } from "node:os";
import { join } from "node:path";

export function getWorkspaceDir(): string {
  return (
    process.env.AUTOCLAWDEV_WORKSPACE ||
    join(homedir(), ".openclaw", "workspace", "autoresearch")
  );
}

export function getProjectsDir(): string {
  return (
    process.env.AUTOCLAWDEV_PROJECTS_DIR ||
    join(homedir(), ".local", "lib", "autoclawdev", "projects")
  );
}

export function getWorkspacePath(...segments: string[]): string {
  return join(getWorkspaceDir(), ...segments);
}

export function getProjectsPath(...segments: string[]): string {
  return join(getProjectsDir(), ...segments);
}
