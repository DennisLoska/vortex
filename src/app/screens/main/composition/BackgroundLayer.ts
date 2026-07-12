import { Container, Sprite, Texture } from "pixi.js";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dynamically generated file by AssetPack
import manifest from "../../../../manifest.json";

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

  public async setMultipleBackgrounds() {
    const videoUrls: string[] = [];
    const imageUrls: string[] = [];

    for (const bundle of manifest.bundles) {
      for (const asset of bundle.assets) {
        const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
        const firstSrc = srcs[0];
        if (!firstSrc.startsWith("main/backgrounds/")) continue;

        const aliases = Array.isArray(asset.alias)
          ? asset.alias
          : [asset.alias];
        const ext = firstSrc.split(".").pop()?.toLowerCase();

        if (ext === "mp4" || ext === "webm" || ext === "ogg") {
          videoUrls.push(aliases[0] ?? firstSrc);
        } else if (
          ext === "png" ||
          ext === "jpg" ||
          ext === "jpeg" ||
          ext === "webp"
        ) {
          imageUrls.push(aliases[0] ?? firstSrc);
        }
      }
    }

    this.loadAllInBackground(videoUrls, imageUrls);

    while (this.textures.length === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }

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

  private async loadAllInBackground(videoUrls: string[], imageUrls: string[]) {
    const timeout = (ms: number) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), ms),
      );

    const concurrency = 5;

    const loadVideo = async (url: string) => {
      const video = document.createElement("video");
      video.src = `/assets/${url}`;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;

      await Promise.race([
        new Promise<void>((resolve, reject) => {
          video.addEventListener("loadedmetadata", () => resolve(), {
            once: true,
          });
          video.addEventListener("error", () => reject(), { once: true });
          video.load();
        }),
        timeout(8000),
      ]);

      const tex = Texture.from(video);
      this.videos.push(video);
      this.textures.push(tex);
      void video.play();
    };

    const loadImage = async (path: string) => {
      const url = `/assets/${path}`;
      const img = new Image();
      img.src = url;
      await Promise.race([img.decode(), timeout(8000)]);
      const tex = Texture.from(img);
      this.textures.push(tex);
    };

    const batchLoad = async <T>(
      items: T[],
      loader: (item: T) => Promise<void>,
    ) => {
      let idx = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (idx < items.length) {
          const item = items[idx++];
          try {
            await loader(item);
          } catch {
            // individual failures don't stop the batch
          }
        }
      });
      await Promise.all(workers);
    };

    await batchLoad(videoUrls, loadVideo);
    await batchLoad(imageUrls, loadImage);
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

    // --- initial fade-in (slow ramp from black) ---
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
    for (const video of this.videos) {
      const tex = Texture.from(video);
      if (tex === sprite.texture || tex.source === sprite.texture?.source) {
        return video;
      }
    }
    return undefined;
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
