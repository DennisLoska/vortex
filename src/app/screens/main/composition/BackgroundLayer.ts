import { Container, Sprite, Texture, VideoSource } from "pixi.js";

export class BackgroundLayer extends Container {
  private sprite: Sprite | undefined;
  private lastBounds = { width: 1920, height: 1080 };

  public async setBackground(texture: Texture) {
    if (this.sprite) {
      this.removeChild(this.sprite);
      this.sprite.destroy();
      this.sprite = undefined;
    }

    this.sprite = new Sprite({ texture, anchor: 0.5 });
    this.addChild(this.sprite);
    this.resize(this.lastBounds.width, this.lastBounds.height);
  }

  public resize(width: number, height: number) {
    this.lastBounds = { width, height };
    if (!this.sprite) return;

    const texture = this.sprite.texture;
    const isVideo = texture.source instanceof VideoSource;
    if (isVideo) {
      const video = (texture.source as VideoSource).resource;
      video?.play?.();
    }

    const scale = Math.max(width / texture.width, height / texture.height);
    this.sprite.scale.set(scale);
    this.sprite.position.set(width * 0.5, height * 0.5);
  }
}
