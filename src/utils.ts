import spawn from "cross-spawn";

export function runAsync(
  cmd: string,
  args: string[],
  cwd: string
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.on("error", (err) => {
      resolve({ status: 1, stdout, stderr: stderr || err.message });
    });
    child.on("close", (code) => resolve({ status: code ?? 1, stdout, stderr }));
  });
}
