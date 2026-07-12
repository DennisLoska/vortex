import { Container, Sprite, Texture, VideoSource } from "pixi.js";

export class BackgroundLayer extends Container {
  // Only ever two sprites: one active, one temporary for crossfade
  private activeSprite: Sprite | null = null;
  private tempSprite: Sprite | null = null;
  private lastBounds = { width: 1920, height: 1080 };
  private transitioning = false;
  private transitionDuration = 2.5;
  private transitionElapsed = 0;

  // pool of loaded textures for cycling through backgrounds
  private bgTextures: Texture[] = [];
  private nextTextureIdx = 0;

  // ticker-based timer for next transition (replaces setTimeout)
  private autoTimer = 0;
  private nextAutoDelay = 30 + Math.random() * 60; // seconds

  public async setBackground(texture: Texture) {
    if (!this.activeSprite) {
      this.activeSprite = new Sprite({ texture, anchor: 0.5 });
      this.addChild(this.activeSprite);
      this.resize(this.lastBounds.width, this.lastBounds.height);
    } else {
      await this.fadeToNew(texture);
    }
  }

  public async setMultipleBackgrounds(textures: Texture[]) {
    if (textures.length === 0) return;

    this.bgTextures = textures;
    this.nextTextureIdx = Math.floor(Math.random() * textures.length);

    // start with the first texture
    const firstTex = textures[this.nextTextureIdx];
    this.activeSprite = new Sprite({ texture: firstTex, anchor: 0.5 });
    this.addChild(this.activeSprite);
    this.resize(this.lastBounds.width, this.lastBounds.height);

    // advance to next texture for the first auto-transition
    this.nextTextureIdx = (this.nextTextureIdx + 1) % textures.length;
  }

  public resize(width: number, height: number) {
    this.lastBounds = { width, height };
    const sprites = [this.activeSprite, this.tempSprite].filter(
      Boolean,
    ) as Sprite[];
    for (const sprite of sprites) {
      const texture = sprite.texture;
      const isVideo = texture.source instanceof VideoSource;
      if (isVideo) {
        const video = (texture.source as VideoSource).resource;
        video?.play?.();
      }

      const scale = Math.max(width / texture.width, height / texture.height);
      sprite.scale.set(scale);
      sprite.position.set(width * 0.5, height * 0.5);
    }
  }

  public update(dt: number) {
    // handle transition fade
    if (this.transitioning && this.activeSprite !== null) {
      const progress = Math.min(
        this.transitionElapsed / this.transitionDuration,
        1,
      );

      // ease-in-out for smoother feel
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      this.activeSprite.alpha = 1 - eased;
      if (this.tempSprite !== null) {
        this.tempSprite.alpha = eased;
      }

      if (progress >= 1) {
        // transition complete — swap roles
        const oldActive = this.activeSprite;
        this.removeChild(oldActive);
        oldActive.destroy();

        this.activeSprite = this.tempSprite!;
        this.activeSprite!.alpha = 1;
        this.tempSprite = null;

        this.transitioning = false;
        this.transitionElapsed = 0;

        // ensure current video is playing
        const source = this.activeSprite!.texture.source as VideoSource;
        const video = source.resource;
        video?.play?.();

        // reset auto timer for next transition
        this.autoTimer = 0;
        this.nextAutoDelay = 30 + Math.random() * 60;
      }
    } else {
      // ticker-based auto-transition (replaces setTimeout)
      if (this.activeSprite !== null && !this.transitioning) {
        this.autoTimer += dt;
        if (this.autoTimer >= this.nextAutoDelay) {
          this.transitionToNext();
        }
      }
    }
  }

  private async fadeToNew(texture: Texture) {
    if (this.transitioning) return;

    const newSprite = new Sprite({ texture, anchor: 0.5 });
    this.addChild(newSprite);
    this.tempSprite = newSprite;

    // ensure the target video is playing
    const source = newSprite.texture.source as VideoSource;
    const video = source.resource;
    video?.play?.();

    this.transitioning = true;
    this.transitionDuration = 2 + Math.random() * 2;
    this.transitionElapsed = 0;
  }

  private transitionToNext() {
    if (this.activeSprite === null || this.transitioning) return;
    if (this.bgTextures.length < 2) return;

    const nextTex = this.bgTextures[this.nextTextureIdx];
    this.nextTextureIdx = (this.nextTextureIdx + 1) % this.bgTextures.length;

    // create a clone sprite for the incoming video
    const newSprite = new Sprite({ texture: nextTex, anchor: 0.5 });
    this.addChild(newSprite);
    this.tempSprite = newSprite;

    // ensure the target video is playing
    const source = newSprite.texture.source as VideoSource;
    const video = source.resource;
    video?.play?.();

    this.transitioning = true;
    this.transitionDuration = 2 + Math.random() * 2;
    this.transitionElapsed = 0;
  }
}
