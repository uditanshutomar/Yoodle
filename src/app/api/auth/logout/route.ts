import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { performLogout } from "@/lib/infra/auth/logout";

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");
  return performLogout(req);
});
