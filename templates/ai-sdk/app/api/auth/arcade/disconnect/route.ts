import { clearArcadeTokens } from "@/lib/arcade";
import { getSession } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  clearArcadeTokens();
  return Response.json({ success: true });
}
