import { Container, Sprite, Texture, VideoSource } from "pixi.js";

export class BackgroundLayer extends Container {
  private sprites: Sprite[] = [];
  private currentIdx = -1;
  private lastBounds = { width: 1920, height: 1080 };
  private transitioning = false;
  private transitionDuration = 2.5;
  private transitionElapsed = 0;

  // ticker-based timer for next transition (replaces setTimeout)
  private autoTimer = 0;
  private nextAutoDelay = 30 + Math.random() * 60; // seconds

  public async setBackground(texture: Texture) {
    const sprite = new Sprite({ texture, anchor: 0.5 });
    this.addChild(sprite);
    this.sprites.push(sprite);
    this.resize(this.lastBounds.width, this.lastBounds.height);
  }

  public resize(width: number, height: number) {
    this.lastBounds = { width, height };
    for (const sprite of this.sprites) {
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
    if (this.transitioning && this.currentIdx >= 0) {
      this.transitionElapsed += dt;
      const progress = Math.min(
        this.transitionElapsed / this.transitionDuration,
        1,
      );

      // ease-in-out for smoother feel
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      if (this.currentIdx >= 0 && this.currentIdx < this.sprites.length) {
        this.sprites[this.currentIdx].alpha = 1 - eased;
      }
      if (this.nextSprite !== null && this.nextSprite !== undefined) {
        this.nextSprite.alpha = eased;
      }

      if (progress >= 1) {
        // transition complete — clean up old sprite
        const oldSprite = this.sprites[this.currentIdx];
        this.removeChild(oldSprite);
        oldSprite.destroy();
        this.sprites.splice(this.currentIdx, 1);

        // promote next to current and remove it from the array
        // (it was added as a temporary clone during transition)
        if (this.nextSprite !== null && this.nextSprite !== undefined) {
          const idx = this.sprites.indexOf(this.nextSprite!);
          if (idx >= 0) {
            this.sprites.splice(idx, 1);
          }
          this.removeChild(this.nextSprite!);
          // keep it as the active sprite — attach to currentIdx slot
          this.sprites.push(this.nextSprite!);
        }

        this.currentIdx = this.sprites.length - 1;
        this.transitioning = false;
        this.transitionElapsed = 0;
        this.nextSprite = null;

        // ensure current video is playing
        const curSprite = this.sprites[this.currentIdx];
        if (curSprite) {
          const source = curSprite.texture.source as VideoSource;
          const video = source.resource;
          video?.play?.();
        }

        // reset auto timer for next transition
        this.autoTimer = 0;
        this.nextAutoDelay = 30 + Math.random() * 60;
      }
    } else {
      // ticker-based auto-transition (replaces setTimeout)
      if (this.sprites.length >= 2 && !this.transitioning) {
        this.autoTimer += dt;
        if (this.autoTimer >= this.nextAutoDelay) {
          this.transitionToRandom();
        }
      }
    }
  }

  private nextSprite: Sprite | null = null;

  public transitionToRandom() {
    if (this.sprites.length < 2 || this.transitioning) return;

    // pick a different sprite index to fade in from the existing set
    let targetIdx = Math.floor(Math.random() * this.sprites.length);
    while (targetIdx === this.currentIdx && this.sprites.length > 1) {
      targetIdx = Math.floor(Math.random() * this.sprites.length);
    }

    // create a clone sprite for the incoming video
    const sourceTexture = this.sprites[targetIdx].texture;
    const newSprite = new Sprite({ texture: sourceTexture, anchor: 0.5 });
    this.addChild(newSprite);
    this.nextSprite = newSprite;

    // ensure the target video is playing
    const source = newSprite.texture.source as VideoSource;
    const video = source.resource;
    video?.play?.();

    this.transitioning = true;
    this.transitionDuration = 2 + Math.random() * 2;
    this.transitionElapsed = 0;
  }
}
