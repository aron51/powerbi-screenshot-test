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
  private page: Page | null = null;
  private queue: RequestQueue;

  constructor() {
    this.queue = new RequestQueue();
  }

  async init() {
    if (this.browser) {
      return;
    }
    this.browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    this.page = await this.browser.newPage();
  }

  public async takeScreenshot(params: ScreenshotParams): Promise<Buffer> {
    return this.queue.push(() => this._takeScreenshot(params));
  }

  private async _takeScreenshot(params: ScreenshotParams): Promise<Buffer> {
    this.init();
    if (!this.page) {
      throw new Error("Missing page");
    }

    const { accessToken, embedUrl, dashboardId, workspaceId, width, height } =
      params;

    const scale = 2;

    await this.page.setViewportSize({
      width: width * scale,
      height: height * scale,
    });
    await this.page.goto("about:blank");

    await this.page.evaluate(
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

    return await this.page.screenshot({
      clip: { x: 0, y: 0, width: width * scale, height: height * scale },
      type: "png",
      fullPage: false,
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
