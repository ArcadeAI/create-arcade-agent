export interface InstallStep {
  cmd: string;
  args: string[];
  label: string;
  winCmd?: string;
}

export interface TemplateMeta {
  name: string;
  displayName: string;
  hint: string;
  language: string;
  devCommand: string;
  port: number;
  sharedFiles: Record<string, string>;
  dotfileRenames: Record<string, string>;
  placeholders: Record<string, { field: string; format: string }>;
  install: InstallStep[];
  migrate: InstallStep[];
}
