import type { BGM, SFX } from "./engine/audio/audio";
import type { Navigation } from "./engine/navigation/navigation";

declare global {
  namespace PixiMixins {
    interface Application {
      resizeOptions: {
        minWidth: number;
        minHeight: number;
        letterbox: boolean;
      };
      audio: {
        bgm: BGM;
        sfx: SFX;
        getMasterVolume: () => number;
        setMasterVolume: (volume: number) => void;
      };
      navigation: Navigation;
    }
    interface ApplicationOptions {
      resizeTo?: Window | HTMLElement;
      resizeOptions?: {
        minWidth?: number;
        minHeight?: number;
        letterbox?: boolean;
      };
    }
  }
}

export {};
