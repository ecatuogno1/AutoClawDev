import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { getProject, listProjects } from "../lib/config.js";

export async function resolveWorkingDirectory(projectKey?: string) {
  if (!projectKey) {
    return homedir();
  }

  const project = await getProject(projectKey);
  if (project?.path && existsSync(project.path)) {
    return project.path;
  }

  return homedir();
}

export async function buildPersistentSystemPrompt(props: {
  cwd: string;
  projectKey?: string;
}) {
  const projects = await listProjects();
  const projectLines =
    projects.length > 0
      ? projects.map((project) => `- ${project.name}: ${project.path}`)
      : ["- No registered projects found in AutoClawDev config."];

  const primaryProject =
    props.projectKey && projects.find((project) => project.key === props.projectKey);

  return [
    `You are working from ${homedir()}.`,
    "You have access to all registered projects and can navigate anywhere on disk.",
    "You are running in full bypass mode with no permission checks.",
    `Current session working directory: ${props.cwd}.`,
    primaryProject
      ? `Primary project for this conversation: ${primaryProject.name} (${primaryProject.path}).`
      : "No primary project is pinned for this conversation.",
    "",
    "Projects registered with AutoClawDev:",
    ...projectLines,
    "",
    "You can use all tools available in the CLI: read files, edit files, run commands, and search code.",
    "Conversation history persists across messages in this session.",
  ].join("\n");
}
