import { Browser, chromium, Page } from "playwright";
import { RequestQueue } from "./request-quque";

export type ScreenshotParams = {
  accessToken: string;
  embedUrl: string;
  dashboardId: string;
  workspaceId: string;
  width: number;
  height: number;
};

export class PowerBIScreenshotService {
  private browser: Browser | null = null;
  private queue: RequestQueue;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.queue = new RequestQueue();
  }

  async init() {
    if (this.browser) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.browser = await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        });
      })();
    }

    await this.initPromise;
  }

  public async takeScreenshot(params: ScreenshotParams): Promise<Buffer> {
    return this.queue.push(() => this._takeScreenshot(params));
  }

  private async _takeScreenshot(params: ScreenshotParams): Promise<Buffer> {
    await this.init();

    console.log('taking screenshot');

    if (!this.browser) {
      throw new Error("Missing browser!");
    }

    const { accessToken, embedUrl, dashboardId, workspaceId, width, height } =
      params;

    const scale = 2;

    const page = await this.browser.newPage();

    await page.setViewportSize({
      width: width * scale,
      height: height * scale,
    });
    await page.goto("about:blank");

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
          function messageHandler(event: MessageEvent) {
            if (event.source !== iframe.contentWindow) return;
            try {
              if (!event.data || typeof event.data !== "object") return;

              if (event.data.url === "/dashboards/defaultId/events/loaded") {
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
          };
        });
      },
      { embedUrl, accessToken, dashboardId, workspaceId, width, height, scale }
    );

    await new Promise((r) => setTimeout(r, 30_000));

    return await page.screenshot({
      clip: { x: 0, y: 0, width: width * scale, height: height * scale },
      type: "png",
      fullPage: false,
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
