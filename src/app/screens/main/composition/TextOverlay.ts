import { Container, Text } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";

const textModules = import.meta.glob("/public/texts/*.txt", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export class TextOverlay extends Container {
  private phrases: string[] = [];
  private currentIdx = 0;
  private currentText: Text | null = null;
  private fadeDuration = 0.6;
  private fadeElapsed = 0;
  private fadingIn = false;
  private fadingOut = false;
  public async loadPhrases() {
    const entries = Object.entries(textModules);
    if (entries.length === 0) return;

    const loaded = await Promise.all(
      entries.map(async ([, loader]) => {
        const raw = await loader();
        return raw.trimEnd();
      }),
    );
    this.phrases = loaded.filter((p) => p.length > 0);
  }

  private showPhrase(index: number) {
    const phrase = this.phrases[index];
    if (!phrase) return;

    const text = new Text({
      text: phrase,
      style: {
        fontFamily: "Caveat, cursive",
        fontSize: 48,
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: this.width * 0.6,
        dropShadow: {
          distance: 2,
          blur: 2,
          color: "#000000",
          alpha: 0.5,
        },
      },
    });
    text.anchor.set(0.5);
    const pad = 80;
    text.x = randomFloat(pad, Math.max(pad, this.width - pad));
    text.y = randomFloat(pad, Math.max(pad, this.height - pad));
    text.alpha = 0;
    this.addChild(text);
    this.currentText = text;
    this.fadeElapsed = 0;
    this.fadingIn = true;
    this.fadingOut = false;
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
    this.width = width;
    this.height = height;

    if (this.currentText) {
      this.currentText.style.wordWrapWidth = width * 0.6;
    }
  }
}
