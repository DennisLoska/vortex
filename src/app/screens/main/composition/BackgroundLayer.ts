import { Container, Sprite, Texture } from "pixi.js";

export class BackgroundLayer extends Container {
  // Only ever two sprites: one active, one temporary for crossfade
  private activeSprite: Sprite | null = null;
  private tempSprite: Sprite | null = null;
  private lastBounds = { width: 1920, height: 1080 };
  private transitioning = false;
  private transitionDuration = 2.5;
  private transitionElapsed = 0;

  // pool of persistent video elements — never destroyed by PixiJS
  private videos: HTMLVideoElement[] = [];
  private textures: Texture[] = [];

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

    // build persistent video elements for each texture
    for (const tex of textures) {
      const video = document.createElement("video");
      video.src = tex.source.resource?.src ?? "";
      video.loop = true;
      video.muted = false;
      video.playsInline = true;
      void video.play();

      // create a fresh texture from the persistent video element
      const persistentTex = Texture.from(video);
      this.videos.push(video);
      this.textures.push(persistentTex);
    }

    // pick a random starting index
    const startIdx = Math.floor(Math.random() * this.textures.length);

    this.activeSprite = new Sprite({
      texture: this.textures[startIdx],
      anchor: 0.5,
    });
    this.addChild(this.activeSprite);
    this.resize(this.lastBounds.width, this.lastBounds.height);

    // advance to next texture for the first auto-transition
    this.nextTextureIdx = (startIdx + 1) % this.textures.length;
  }

  private nextTextureIdx = 0;

  public resize(width: number, height: number) {
    this.lastBounds = { width, height };
    const sprites = [this.activeSprite, this.tempSprite].filter(
      Boolean,
    ) as Sprite[];
    for (const sprite of sprites) {
      const scale = Math.max(
        width / sprite.texture.width,
        height / sprite.texture.height,
      );
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
        // before destroying the old sprite, restart its video so it keeps looping
        const oldActive = this.activeSprite;
        const oldVideo = this.getVideoForSprite(oldActive);
        if (oldVideo) {
          void oldVideo.play();
        }

        this.removeChild(oldActive);
        // destroy only the sprite — NOT the underlying texture or video element
        oldActive.destroy({ children: false, texture: false });

        this.activeSprite = this.tempSprite!;
        this.activeSprite!.alpha = 1;
        this.tempSprite = null;

        this.transitioning = false;
        this.transitionElapsed = 0;

        // ensure current video is playing and looping
        const curVideo = this.getVideoForSprite(this.activeSprite);
        if (curVideo) {
          void curVideo.play();
        }

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

  private getVideoForSprite(sprite: Sprite): HTMLVideoElement | undefined {
    // find the video element whose texture matches this sprite's texture
    for (const video of this.videos) {
      const tex = Texture.from(video);
      if (tex === sprite.texture || tex.source === sprite.texture?.source) {
        return video;
      }
    }
    return undefined;
  }

  private async fadeToNew(texture: Texture) {
    if (this.transitioning) return;

    const newSprite = new Sprite({ texture, anchor: 0.5 });
    this.addChild(newSprite);
    this.tempSprite = newSprite;

    // ensure the target video is playing and looping
    const video = this.getVideoForSprite(newSprite);
    if (video) {
      void video.play();
    }

    this.transitioning = true;
    this.transitionDuration = 2 + Math.random() * 2;
    this.transitionElapsed = 0;
  }

  private transitionToNext() {
    if (this.activeSprite === null || this.transitioning) return;
    if (this.textures.length < 2) return;

    const nextTex = this.textures[this.nextTextureIdx];
    this.nextTextureIdx = (this.nextTextureIdx + 1) % this.textures.length;

    // create a clone sprite for the incoming video
    const newSprite = new Sprite({ texture: nextTex, anchor: 0.5 });
    this.addChild(newSprite);
    this.tempSprite = newSprite;

    // ensure the target video is playing and looping
    const video = this.getVideoForSprite(newSprite);
    if (video) {
      void video.play();
    }

    this.transitioning = true;
    this.transitionDuration = 2 + Math.random() * 2;
    this.transitionElapsed = 0;
  }
}
