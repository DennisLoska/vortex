import { Container, Text } from "pixi.js";
import { sound } from "@pixi/sound";

import { engine } from "../../../getEngine";
import { randomFloat } from "../../../../engine/utils/random";

const textModules = import.meta.glob("/projects/*/texts/*.txt", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

const voiceModules = import.meta.glob(
  "/projects/*/voices/*.{mp3,wav,m4a,ogg}",
  {
    query: "?url",
    import: "default",
  },
) as Record<string, () => Promise<string>>;

export class TextOverlay extends Container {
  private phrases: { text: string; prefix: number }[] = [];
  private currentIdx = 0;
  private currentText: Text | null = null;
  private fadeDuration = 0.6;
  private fadeElapsed = 0;
  private fadingIn = false;
  private fadingOut = false;
  private boundsWidth = 1920;
  private boundsHeight = 1080;
  private projectName = "";
  private voiceMap = new Map<number, string>();

  public setProject(name: string) {
    this.projectName = name;
  }

  public get textPosition(): { x: number; y: number } | null {
    if (!this.currentText) return null;
    return { x: this.currentText.x, y: this.currentText.y };
  }

  public async loadPhrases() {
    const entries = Object.entries(textModules)
      .filter(([path]) =>
        path.startsWith(`/projects/${this.projectName}/texts/`),
      )
      .sort(([a], [b]) => {
        const numA = parseInt(a.split("/").pop()!.split("_")[0], 10);
        const numB = parseInt(b.split("/").pop()!.split("_")[0], 10);
        return numA - numB;
      });

    this.phrases = [];
    for (const [path, loader] of entries) {
      const raw = await loader();
      const text = raw.trimEnd();
      if (text.length === 0) continue;
      const basename = path.split("/").pop()!;
      const prefix = parseInt(basename.split("_")[0], 10) || 0;
      this.phrases.push({ text, prefix });
    }
  }

  public async loadVoices() {
    this.voiceMap.clear();
    const entries = Object.entries(voiceModules).filter(([path]) =>
      path.startsWith(`/projects/${this.projectName}/voices/`),
    );

    for (const [path, loader] of entries) {
      const basename = path.split("/").pop()!;
      const match = basename.match(/^(\d+)_/);
      if (!match) continue;
      const prefix = parseInt(match[1], 10);
      const url = await loader();
      const alias = `${this.projectName}/voices/${basename}`;
      sound.add(alias, url);
      this.voiceMap.set(prefix, alias);
    }
  }

  private showPhrase(index: number) {
    const entry = this.phrases[index];
    if (!entry) return;

    const text = new Text({
      text: entry.text,
      style: {
        fontFamily: "Caveat, cursive",
        fontSize: 32,
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: this.boundsWidth * 0.6,
        dropShadow: {
          distance: 2,
          blur: 2,
          color: "#000000",
          alpha: 0.5,
        },
      },
    });
    text.anchor.set(0.5);
    text.eventMode = "static";
    text.cursor = "grab";

    let dragging = false;
    let dragOffset = { x: 0, y: 0 };

    text.on("pointerdown", (e) => {
      dragging = true;
      text.cursor = "grabbing";
      const parent = text.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      dragOffset = { x: text.x - pos.x, y: text.y - pos.y };
    });

    text.on("globalpointermove", (e) => {
      if (!dragging) return;
      const parent = text.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      text.x = pos.x + dragOffset.x;
      text.y = pos.y + dragOffset.y;
    });

    const stopDrag = () => {
      dragging = false;
      text.cursor = "grab";
    };
    text.on("pointerup", stopDrag);
    text.on("pointerupoutside", stopDrag);

    const halfW = text.width * 0.5;
    const halfH = text.height * 0.5;
    const padX = halfW + 40;
    const padY = halfH + 40;
    text.x = randomFloat(padX, Math.max(padX, this.boundsWidth - padX));
    text.y = randomFloat(padY, Math.max(padY, this.boundsHeight - padY));
    text.alpha = 0;
    this.addChild(text);
    this.currentText = text;
    this.fadeElapsed = 0;
    this.fadingIn = true;
    this.fadingOut = false;

    const voiceAlias = this.voiceMap.get(entry.prefix);
    if (voiceAlias) {
      engine().audio.sfx.play(voiceAlias);
    }
  }

  public next() {
    if (this.phrases.length === 0) return;
    if (this.fadingOut) return;

    if (this.currentText !== null) {
      this.fadingOut = true;
      this.fadeElapsed = 0;
    } else {
      this.currentIdx = (this.currentIdx + 1) % this.phrases.length;
      this.showPhrase(this.currentIdx);
    }
  }

  public update(dt: number) {
    const safeDt = Math.min(dt, 0.1);

    if (this.fadingOut && this.currentText !== null) {
      this.fadeElapsed += safeDt;
      const t = Math.min(this.fadeElapsed / this.fadeDuration, 1);
      this.currentText.alpha = 1 - t;

      if (t >= 1) {
        this.removeChild(this.currentText);
        this.currentText.destroy();
        this.currentText = null;
        this.fadingOut = false;
        this.fadeElapsed = 0;

        this.currentIdx = (this.currentIdx + 1) % this.phrases.length;
        this.showPhrase(this.currentIdx);
      }
    }

    if (this.fadingIn && this.currentText !== null) {
      this.fadeElapsed += safeDt;
      const t = Math.min(this.fadeElapsed / this.fadeDuration, 1);
      this.currentText.alpha = t;

      if (t >= 1) {
        this.fadingIn = false;
      }
    }
  }

  public resize(width: number, height: number) {
    this.boundsWidth = width;
    this.boundsHeight = height;

    if (this.currentText) {
      this.currentText.style.wordWrapWidth = width * 0.6;
    }
  }
}
