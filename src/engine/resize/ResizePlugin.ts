import { ExtensionType, ResizePlugin } from "pixi.js";
import type {
  Application,
  ApplicationOptions,
  ExtensionMetadata,
} from "pixi.js";

import { resize } from "./resize";

declare module "pixi.js" {
  interface Application {
    resizeOptions: {
      minWidth: number;
      minHeight: number;
      letterbox: boolean;
    };
  }

  interface ApplicationOptions {
    resizeOptions?: {
      minWidth?: number;
      minHeight?: number;
      letterbox?: boolean;
    };
  }
}

export class CreationResizePlugin {
  public static extension: ExtensionMetadata = ExtensionType.Application;

  public static init(options: ApplicationOptions): void {
    // Let stock ResizePlugin set up resizeTo, queueResize,
    // cancelResize, event listeners, and basic resize
    ResizePlugin.init.call(this, options);

    const app = this as unknown as Application;

    const resizeOpts = (options as unknown as Record<string, unknown>)
      .resizeOptions as
      | { minWidth?: number; minHeight?: number; letterbox?: boolean }
      | undefined;

    app.resizeOptions = {
      minWidth: resizeOpts?.minWidth ?? 768,
      minHeight: resizeOpts?.minHeight ?? 1024,
      letterbox: resizeOpts?.letterbox ?? true,
    };

    app.resize = (): void => {
      const self = this as unknown as {
        _resizeTo: Window | HTMLElement | null;
        _cancelResize: () => void;
      };

      if (!self._resizeTo) return;

      self._cancelResize();

      let canvasWidth: number;
      let canvasHeight: number;

      if (self._resizeTo === globalThis.window) {
        canvasWidth = globalThis.innerWidth;
        canvasHeight = globalThis.innerHeight;
      } else {
        const { clientWidth, clientHeight } = self._resizeTo as HTMLElement;
        canvasWidth = clientWidth;
        canvasHeight = clientHeight;
      }

      const { width, height } = resize(
        canvasWidth,
        canvasHeight,
        app.resizeOptions.minWidth,
        app.resizeOptions.minHeight,
        app.resizeOptions.letterbox,
      );

      app.renderer.canvas.style.width = `${canvasWidth}px`;
      app.renderer.canvas.style.height = `${canvasHeight}px`;
      window.scrollTo(0, 0);
      app.renderer.resize(width, height);
    };
  }

  public static destroy(): void {
    ResizePlugin.destroy.call(this);
  }
}
