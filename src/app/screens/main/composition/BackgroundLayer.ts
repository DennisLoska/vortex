import { Container, Sprite, Texture, VideoSource } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";

export class BackgroundLayer extends Container {
  private sprites: Sprite[] = [];
  private currentIdx = -1;
  private lastBounds = { width: 1920, height: 1080 };
  private transitioning = false;
  private transitionDuration = randomFloat(1.5, 3);
  private transitionElapsed = 0;
  private nextIdx = -1;

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
    if (!this.transitioning || this.currentIdx < 0) return;

    this.transitionElapsed += dt;
    const progress = Math.min(
      this.transitionElapsed / this.transitionDuration,
      1,
    );

    // fade out current, fade in next
    const alphaOut = 1 - progress;
    const alphaIn = progress;

    if (this.currentIdx >= 0 && this.currentIdx < this.sprites.length) {
      this.sprites[this.currentIdx].alpha = alphaOut;
    }
    if (this.nextIdx >= 0 && this.nextIdx < this.sprites.length) {
      this.sprites[this.nextIdx].alpha = alphaIn;
    }

    if (progress >= 1) {
      // transition complete
      this.currentIdx = this.nextIdx;
      this.transitioning = false;
      this.transitionElapsed = 0;
      this.sprites.forEach((s, i) => {
        s.alpha = i === this.currentIdx ? 1 : 0;
      });

      // schedule next transition after a random interval (30–90 seconds)
      setTimeout(() => this.scheduleNextTransition(), 0);
    }
  }

  private scheduleNextTransition() {
    if (this.sprites.length < 2) return;

    const delay = randomFloat(30, 90) * 1000;
    setTimeout(() => {
      this.transitionToRandom();
    }, delay);
  }

  public transitionToRandom() {
    if (this.sprites.length < 2 || this.transitioning) return;

    let next = this.currentIdx;
    while (next === this.currentIdx) {
      next = Math.floor(Math.random() * this.sprites.length);
    }

    this.nextIdx = next;
    this.transitioning = true;
    this.transitionDuration = randomFloat(1.5, 3);
    this.transitionElapsed = 0;

    // ensure the target video is playing
    const targetSprite = this.sprites[next];
    if (targetSprite) {
      const source = targetSprite.texture.source as VideoSource;
      const video = source.resource;
      video?.play?.();
    }
  }

  public randomBackground() {
    if (this.sprites.length === 0) return;

    // pick a random index different from current
    let idx = this.currentIdx;
    while (idx === this.currentIdx && this.sprites.length > 1) {
      idx = Math.floor(Math.random() * this.sprites.length);
    }

    if (this.transitioning) return;

    this.nextIdx = idx;
    this.transitioning = true;
    this.transitionDuration = randomFloat(1.5, 3);
    this.transitionElapsed = 0;

    const targetSprite = this.sprites[idx];
    if (targetSprite) {
      const source = targetSprite.texture.source as VideoSource;
      const video = source.resource;
      video?.play?.();
    }
  }
}
