import { Assets, Container, Sprite, Texture, VideoSource } from "pixi.js";

import { getProjectBackgrounds } from "../../../assetManifest";

export class BackgroundLayer extends Container {
  private activeSprite: Sprite | null = null;
  private tempSprite: Sprite | null = null;
  private lastBounds = { width: 1920, height: 1080 };
  private transitioning = false;
  private transitionDuration = 10;
  private transitionElapsed = 0;

  private videos: HTMLVideoElement[] = [];
  private textures: Texture[] = [];

  private autoTimer = 0;
  private nextAutoDelay = 20;

  private currentIdx = 0;

  private fadeInAlpha = 0;
  private needsFadeIn = false;

  /** Fires when a new background texture becomes fully active */
  public onNewBackground?: (texture: Texture) => void;

  private zoomData = new Map<Sprite, { baseScale: number; age: number }>();
  private readonly zoomRate = 0.008;
  private loadGen = 0;

  public async setMultipleBackgrounds(projectName: string) {
    this.loadGen++;
    const gen = this.loadGen;
    this.textures = [];
    this.videos = [];

    const { videoAliases, imageAliases } = getProjectBackgrounds(projectName);
    const allAliases = [...videoAliases, ...imageAliases];

    if (allAliases.length === 0) return;

    const concurrency = 5;
    const timeoutMs = 8000;

    const loadAsset = async (alias: string) => {
      const result = await Promise.race([
        Assets.load(alias),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), timeoutMs),
        ),
      ]);
      if (gen !== this.loadGen) return null;
      return result as Texture;
    };

    let idx = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (idx < allAliases.length) {
        const alias = allAliases[idx++];
        try {
          const tex = await loadAsset(alias);
          if (!tex) continue;

          this.textures.push(tex);

          const source = tex.source;
          if (source instanceof VideoSource) {
            const videoEl = source.resource as HTMLVideoElement;
            if (videoEl) {
              videoEl.loop = true;
              videoEl.muted = true;
              videoEl.playsInline = true;
              this.videos.push(videoEl);
              void videoEl.play();
            }
          }
        } catch {
          // individual asset failures don't block
        }
      }
    });

    await Promise.all(workers);

    if (this.textures.length === 0) return;

    this.currentIdx = 0;

    this.activeSprite = new Sprite({
      texture: this.textures[0],
      anchor: 0.5,
      alpha: 0,
    });
    this.addChild(this.activeSprite);
    this.stretchToFill(this.activeSprite);

    this.needsFadeIn = true;
    this.fadeInAlpha = 0;
    this.autoTimer = 0;
    this.nextAutoDelay = 999;
  }

  public resize(width: number, height: number) {
    this.lastBounds = { width, height };
    for (const sprite of [this.activeSprite, this.tempSprite].filter(
      Boolean,
    ) as Sprite[]) {
      this.rebaseSprite(sprite);
    }
  }

  private rebaseSprite(sprite: Sprite) {
    const texW = sprite.texture.width;
    const texH = sprite.texture.height;
    if (texW === 0 || texH === 0) return;

    const baseScale = Math.max(
      this.lastBounds.width / texW,
      this.lastBounds.height / texH,
    );

    const data = this.zoomData.get(sprite);
    const age = data?.age ?? 0;
    this.zoomData.set(sprite, { baseScale, age });

    const zoom = 1 + age * this.zoomRate;
    sprite.scale.set(baseScale * zoom);
    sprite.position.set(
      this.lastBounds.width * 0.5,
      this.lastBounds.height * 0.5,
    );
  }

  private stretchToFill(sprite: Sprite) {
    const texW = sprite.texture.width;
    const texH = sprite.texture.height;
    if (texW === 0 || texH === 0) return;

    const baseScale = Math.max(
      this.lastBounds.width / texW,
      this.lastBounds.height / texH,
    );

    this.zoomData.set(sprite, { baseScale, age: 0 });
    sprite.scale.set(baseScale);
    sprite.position.set(
      this.lastBounds.width * 0.5,
      this.lastBounds.height * 0.5,
    );
  }

  private applyZoom(sprite: Sprite, dt: number) {
    const data = this.zoomData.get(sprite);
    if (!data) return;

    data.age += dt;
    const zoom = 1 + data.age * this.zoomRate;
    sprite.scale.set(data.baseScale * zoom);
    sprite.position.set(
      this.lastBounds.width * 0.5,
      this.lastBounds.height * 0.5,
    );
  }

  public update(dt: number) {
    const safeDt = Math.min(dt, 0.1);

    // --- initial fade-in ---
    if (this.needsFadeIn && this.activeSprite !== null) {
      this.applyZoom(this.activeSprite, safeDt);
      this.fadeInAlpha = Math.min(this.fadeInAlpha + safeDt / 2, 1);
      this.activeSprite.alpha = 1 - Math.pow(1 - this.fadeInAlpha, 9);
      if (this.fadeInAlpha >= 1) {
        this.needsFadeIn = false;
        this.autoTimer = 0;
        this.nextAutoDelay = 20;
        this.onNewBackground?.(this.activeSprite.texture);
      }
      return;
    }

    // --- crossfade transition ---
    if (this.transitioning && this.activeSprite !== null) {
      this.applyZoom(this.activeSprite, safeDt);
      if (this.tempSprite) this.applyZoom(this.tempSprite, safeDt);

      this.transitionElapsed += safeDt;
      const t = Math.min(this.transitionElapsed / this.transitionDuration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      this.activeSprite.alpha = 1 - eased;
      if (this.tempSprite) this.tempSprite.alpha = eased;

      if (t >= 1) {
        const old = this.activeSprite;
        const oldVideo = this.getVideoForSprite(old);
        if (oldVideo) void oldVideo.play();

        this.zoomData.delete(old);
        this.removeChild(old);
        old.destroy({ children: false, texture: false });

        this.activeSprite = this.tempSprite!;
        this.activeSprite.alpha = 1;
        this.onNewBackground?.(this.activeSprite.texture);
        this.tempSprite = null;
        this.transitioning = false;
        this.transitionElapsed = 0;
        this.autoTimer = 0;
        this.nextAutoDelay = 20;
      }
      return;
    }

    // --- auto-timer for next random transition ---
    if (this.textures.length < 2 || this.activeSprite === null) return;

    this.applyZoom(this.activeSprite, safeDt);
    this.autoTimer += safeDt;
    if (this.autoTimer >= this.nextAutoDelay) {
      this.transitionToRandom();
    }
  }

  private getVideoForSprite(sprite: Sprite): HTMLVideoElement | undefined {
    const source = sprite.texture.source;
    if (!(source instanceof VideoSource)) return undefined;
    return this.videos.find((v) => source.resource === v);
  }

  /** Crossfade to a specific background by alias. */
  public async setBackground(alias: string): Promise<boolean> {
    try {
      const texture = await Assets.load<Texture>(alias);

      const source = texture.source;
      if (source instanceof VideoSource) {
        const videoEl = source.resource as HTMLVideoElement;
        if (videoEl) {
          videoEl.loop = true;
          videoEl.muted = true;
          videoEl.playsInline = true;
          if (!this.videos.includes(videoEl)) this.videos.push(videoEl);
          void videoEl.play();
        }
      }

      if (!this.textures.includes(texture)) {
        this.textures.push(texture);
      }
      this.currentIdx = this.textures.indexOf(texture);

      const newSprite = new Sprite({
        texture,
        anchor: 0.5,
        alpha: 0,
      });
      newSprite.label = alias;
      this.stretchToFill(newSprite);
      this.addChild(newSprite);

      if (this.activeSprite === null) {
        this.activeSprite = newSprite;
        this.needsFadeIn = true;
        this.fadeInAlpha = 0;
        this.autoTimer = 0;
        this.nextAutoDelay = 999;
        return true;
      }

      // Finish any in-flight transition instantly so the new sprite
      // becomes the single crossfade target
      if (this.transitioning && this.tempSprite) {
        const stale = this.tempSprite;
        this.zoomData.delete(stale);
        this.removeChild(stale);
        stale.destroy({ children: false, texture: false });
        this.tempSprite = null;
        this.transitioning = false;
        this.transitionElapsed = 0;
      }

      this.tempSprite = newSprite;
      this.transitioning = true;
      this.transitionDuration = 10;
      this.transitionElapsed = 0;
      return true;
    } catch {
      return false;
    }
  }

  /** Trigger the same random crossfade the auto-timer runs. */
  public next(): void {
    if (this.textures.length < 2 || this.activeSprite === null) return;
    this.transitionToRandom();
  }

  private transitionToRandom() {
    if (this.transitioning) return;

    let nextIdx: number;
    do {
      nextIdx = Math.floor(Math.random() * this.textures.length);
    } while (nextIdx === this.currentIdx && this.textures.length > 1);

    this.currentIdx = nextIdx;

    const newSprite = new Sprite({
      texture: this.textures[nextIdx],
      anchor: 0.5,
      alpha: 0,
    });
    this.stretchToFill(newSprite);
    this.addChild(newSprite);
    this.tempSprite = newSprite;

    const video = this.getVideoForSprite(newSprite);
    if (video) void video.play();

    this.transitioning = true;
    this.transitionDuration = 10;
    this.transitionElapsed = 0;
  }
}
