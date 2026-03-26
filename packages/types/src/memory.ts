export interface MemoryFinding {
  title: string;
  directive: string;
  domain: string;
  status: string;
  targetFiles: string[];
  firstSeenExp: string | null;
  lastSeenExp: string | null;
  resolutionCommit: string | null;
  notes: string | null;
  updatedAt: string | null;
}

export interface ProjectMemory {
  project: string;
  summary: string | null;
  updatedAt: string | null;
  sourceCommit: string | null;
  hotspots: Array<{ path: string; count: number }>;
  openFindings: MemoryFinding[];
  resolvedFindings: MemoryFinding[];
  fileMemoryCount: number;
  totalFindings: number;
}
