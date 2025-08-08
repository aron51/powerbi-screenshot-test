import { Hono } from "hono";
import { cors } from "hono/cors";
import { Browser, chromium, Page } from "playwright";

const app = new Hono();

app.use("*", cors());

const CONCURRENCY = 3;

let browser: Browser | null = null;
const pagePool: Page[] = [];
const busyPages = new Set<Page>();

async function initBrowser() {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  for (let i = 0; i < CONCURRENCY; i++) {
    const page = await browser.newPage();
    pagePool.push(page);
  }
  console.log(`Initialized browser with ${CONCURRENCY} pages`);
}

async function acquirePage(): Promise<Page> {
  while (true) {
    for (const page of pagePool) {
      if (!busyPages.has(page)) {
        busyPages.add(page);
        return page;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

function releasePage(page: Page) {
  busyPages.delete(page);
}

app.post("/screenshot", async (c) => {
  if (!browser) {
    await initBrowser();
  }

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

  console.log("RECEIVED REQUEST");

  const scale = 2; // simulate devicePixelRatio = 2

  const page = await acquirePage();

  try {
    // Set viewport scaled by the zoom factor
    await page.setViewportSize({
      width: width * scale,
      height: height * scale,
    });
    await page.goto("about:blank");

    // Evaluate script inside page to create iframe and wait for dashboard load event
    await page.evaluate(
      ({
        embedUrl,
        accessToken,
        dashboardId,
        workspaceId,
        width,
        height,
        scale,
      }) => {
        return new Promise<void>((resolve, reject) => {
          let startTime = performance.now();

          function messageHandler(event: MessageEvent) {
            if (event.source !== iframe.contentWindow) return;
            try {
              if (!event.data || typeof event.data !== "object") return;

              if (event.data.url === "/dashboards/defaultId/events/loaded") {
                const duration = performance.now() - startTime;
                console.log(`Loading finished in ${duration} ms`);
                window.removeEventListener("message", messageHandler);
                resolve();
              } else if (
                event.data.url === "/dashboards/defaultId/events/error"
              ) {
                window.removeEventListener("message", messageHandler);
                reject(
                  new Error(
                    event.data.body?.message || "Unknown Power BI error"
                  )
                );
              }
            } catch (err) {
              console.error("Error handling message", err);
            }
          }

          window.addEventListener("message", messageHandler);

          const iframe = document.createElement("iframe");
          iframe.style.width = `${width}px`;
          iframe.style.height = `${height}px`;
          iframe.style.border = "none";
          iframe.style.background = "transparent";
          iframe.style.pointerEvents = "none";

          // Apply zoom for higher DPI rendering
          iframe.style.zoom = scale.toString();

          iframe.src = embedUrl;
          document.body.appendChild(iframe);

          iframe.onload = () => {
            const loadDashboardMsg = {
              action: "loadDashboard",
              id: dashboardId,
              accessToken: accessToken,
              groupId: workspaceId,
              pageView: "fitToWidth",
              settings: {
                filterPaneEnabled: false,
                navContentPaneEnabled: false,
              },
            };
            iframe.contentWindow?.postMessage(loadDashboardMsg, "*");

            // After loadDashboard, send access token again after a short delay
            setTimeout(() => {
              const setTokenMsg = { action: "setAccessToken", accessToken };
              iframe.contentWindow?.postMessage(setTokenMsg, "*");
            }, 1000);
          };
        });
      },
      { embedUrl, accessToken, dashboardId, workspaceId, width, height, scale }
    );

    await new Promise((r) => setTimeout(r, 30_000));

    console.log("GOT SCREENSHOT");

    // Take screenshot clipped to scaled viewport size
    const screenshotBuffer = await page.screenshot({
      clip: { x: 0, y: 0, width: width * scale, height: height * scale },
      type: "png",
      fullPage: false,
    });

    return c.body(screenshotBuffer, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache",
    });
  } catch (error) {
    console.error("Screenshot error:", error);
    return c.text(
      "Failed to take screenshot: " + (error as Error).message,
      500
    );
  } finally {
    releasePage(page);
  }
});

process.on("SIGINT", async () => {
  if (browser) await browser.close();
  process.exit(0);
});

export default {
  port: 3001,
  fetch: app.fetch,
};
