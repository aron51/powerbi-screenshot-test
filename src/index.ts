import { Hono } from "hono";
import { cors } from "hono/cors";
import { PowerBIScreenshotService } from "./powerbi-screenshot-service";

const app = new Hono();
const service = new PowerBIScreenshotService();

app.use(
  "*",
  cors(
    // origin: "http://localhost:5173",
    // allowMethods: ["GET", "POST", "OPTIONS"],
  )
);

app.post("/screenshot", async (c) => {
  type RequestBody = {
    accessToken: string;
    embedUrl: string;
    dashboardId: string;
    workspaceId: string;
    width: number;
    height: number;
  };

  const { accessToken, embedUrl, dashboardId, workspaceId, width, height } =
    await c.req.json<RequestBody>();

  if (!accessToken || !embedUrl || !dashboardId || !workspaceId) {
    return c.text("Missing required parameters", 400);
  }

  const buffer = await service.takeScreenshot({
    accessToken,
    dashboardId,
    embedUrl,
    height,
    width,
    workspaceId,
  });

  return c.body(buffer, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-cache",
  });
});

process.on("SIGINT", async () => {
  service.close();
  process.exit(0);
});

export default {
  port: 3001,
  fetch: app.fetch,
};
