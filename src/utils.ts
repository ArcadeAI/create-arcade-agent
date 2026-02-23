import spawn from "cross-spawn";

export function runAsync(
  cmd: string,
  args: string[],
  cwd: string
): Promise<{ status: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "pipe" });
    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.on("close", (code) => resolve({ status: code ?? 1, stderr }));
  });
}
