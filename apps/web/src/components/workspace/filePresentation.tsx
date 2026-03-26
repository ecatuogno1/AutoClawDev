import type { LucideIcon } from "lucide-react";
import {
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FileVideo,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  css: "CSS",
  go: "Go",
  graphql: "GraphQL",
  html: "HTML",
  ini: "INI",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  markdown: "Markdown",
  plaintext: "Plain Text",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  sql: "SQL",
  svelte: "Svelte",
  swift: "Swift",
  toml: "TOML",
  typescript: "TypeScript",
  vue: "Vue",
  xml: "XML",
  yaml: "YAML",
};

const FILE_ICON_BY_EXTENSION: Record<string, LucideIcon> = {
  c: FileCode2,
  cpp: FileCode2,
  css: FileCode2,
  csv: FileSpreadsheet,
  env: ShieldCheck,
  gif: FileImage,
  go: FileCode2,
  h: FileCode2,
  htm: FileCode2,
  html: FileCode2,
  ini: FileText,
  java: FileCode2,
  jpeg: FileImage,
  jpg: FileImage,
  js: FileCode2,
  json: FileJson2,
  jsx: FileCode2,
  md: FileText,
  mjs: FileCode2,
  mov: FileVideo,
  mp3: FileAudio,
  mp4: FileVideo,
  pdf: FileArchive,
  png: FileImage,
  py: FileCode2,
  rb: FileCode2,
  rs: FileCode2,
  sh: TerminalSquare,
  sql: FileCode2,
  svg: FileImage,
  toml: FileText,
  ts: FileCode2,
  tsx: FileCode2,
  txt: FileText,
  wav: FileAudio,
  xml: FileCode2,
  yaml: FileText,
  yml: FileText,
  zsh: TerminalSquare,
};

export function basenameOf(path: string) {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

export function extensionOf(path: string) {
  const fileName = basenameOf(path);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

export function getFileIcon(path: string, language?: string): LucideIcon {
  if (language === "json") return FileJson2;
  if (language === "bash") return TerminalSquare;

  const extension = extensionOf(path);
  return FILE_ICON_BY_EXTENSION[extension] ?? FileText;
}

export function getLanguageLabel(language: string | undefined) {
  if (!language) return "Unknown";
  return LANGUAGE_LABELS[language] ?? language[0]?.toUpperCase() + language.slice(1);
}

export function formatBytes(size: number | undefined) {
  if (!size || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
