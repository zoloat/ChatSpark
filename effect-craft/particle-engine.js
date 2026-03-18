// particle-engine.js
// JSON-driven Matter.js particle engine
// API: new ParticleEngine(canvas) → play(config, imageResolver) / clear() / destroy() / resizeCanvas()

class ParticleEngine {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._objects = [];
    this._imageCache = {};
    this._streamTimers = [];
    this._floorBody = null;
    this._wallBodies = [];
    this._imageResolver = null;
    this._imageFallbackMap = {};
    this._running = false;
    this._animFrameId = null;
    this.onAfterDraw = null; // optional hook: () => void

    const { Engine, World, Bodies, Body } = Matter;
    this._Engine = Engine;
    this._World = World;
    this._Bodies = Bodies;
    this._Body = Body;

    this._engine = Engine.create({ gravity: { x: 0, y: 1 } });
    this._world = this._engine.world;

    this._startLoop();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  play(config, imageResolver) {
    this._imageResolver = imageResolver || null;
    const physics = config.physics || {};

    this._engine.gravity.y = physics.gravity ?? 1.0;
    this._setFloor(physics.floorDetection ?? true);
    this._setWalls(physics.wallCollision ?? false);

    const emitters = config.emitters?.length
      ? config.emitters
      : [{ origin: { x: 0.5, y: 0.0 }, target: { x: 0.5, y: 1.0 }, emissionType: 'directional', force: 8, spread: 40 }];

    const isStream = (config.emissionDuration ?? 0) > 0;
    const launchTime = Date.now();

    if (isStream) {
      this._spawnStream(config, emitters, launchTime);
    } else {
      this._spawnBurst(config, emitters, launchTime);
    }
  }

  clear() {
    this._streamTimers.forEach(t => clearTimeout(t));
    this._streamTimers = [];
    this._objects.forEach(obj => this._World.remove(this._world, obj.body));
    this._objects = [];
  }

  destroy() {
    this.clear();
    this._running = false;
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
  }

  resizeCanvas() {
    if (this._floorBody) {
      this._World.remove(this._world, this._floorBody);
      this._floorBody = null;
      this._setFloor(true);
    }
    if (this._wallBodies.length > 0) {
      this._wallBodies.forEach(b => this._World.remove(this._world, b));
      this._wallBodies = [];
      this._setWalls(true);
    }
  }

  // ── Spawning ──────────────────────────────────────────────────────────────

  _spawnBurst(config, emitters, launchTime) {
    const count = config.count ?? 15;
    const perEmitter = Math.max(1, Math.floor(count / emitters.length));
    const extra = count - perEmitter * emitters.length;
    const staggerMs = 50;
    const totalStagger = (count - 1) * staggerMs;
    const dismissBase = launchTime + totalStagger + (config.lifetime ?? 5) * 1000;

    emitters.forEach((emitter, idx) => {
      const c = idx === 0 ? perEmitter + extra : perEmitter;
      for (let i = 0; i < c; i++) {
        const t = setTimeout(() => {
          this._spawnParticle(config, emitter, dismissBase);
        }, staggerMs * i);
        this._streamTimers.push(t);
      }
    });
  }

  _spawnStream(config, emitters, launchTime) {
    const durationMs = (config.emissionDuration ?? 3) * 1000;
    const rate = config.emissionRate ?? 3;
    if (rate <= 0) return;
    const intervalMs = Math.max(50, 1000 / rate);
    const endTime = launchTime + durationMs;
    const dismissBase = endTime + (config.lifetime ?? 5) * 1000;

    emitters.forEach(emitter => {
      const tick = () => {
        const now = Date.now();
        if (now >= endTime) return;
        this._spawnParticle(config, emitter, dismissBase);
        const t = setTimeout(tick, intervalMs);
        this._streamTimers.push(t);
      };
      const t = setTimeout(tick, 0);
      this._streamTimers.push(t);
    });
  }

  _spawnParticle(config, emitter, dismissBase) {
    const physics = config.physics || {};
    const canvas = this._canvas;
    const speedScale = canvas.height / 540;

    // Origin
    const ox = this._range(emitter.origin?.x ?? 0.5);
    const oy = this._range(emitter.origin?.y ?? 0.0);
    const x = ox * canvas.width;
    const y = oy * canvas.height;

    // Size
    const baseSize = canvas.height * 0.10;
    const size = (baseSize + Math.random() * baseSize * 0.5) * (config.size ?? 1.0);
    const radius = size / 2;
    const hitboxMask = config.hitboxMask ?? 0.5;
    const hitRadius = Math.max(3, canvas.height * 0.05 * (1 - hitboxMask));

    // Velocity
    const force = emitter.force ?? 8;
    const spread = emitter.spread ?? 30;
    const emissionType = emitter.emissionType ?? 'directional';
    const { vx, vy } = this._calcVelocity(emissionType, ox, oy, emitter, force, spread, speedScale);

    const body = this._Bodies.circle(x, y, hitRadius, {
      restitution: physics.bounce ?? 0.5,
      friction: physics.friction ?? 0.4,
      frictionAir: physics.resistance ?? 0.008,
      density: 0.002,
      isSensor: !(physics.collision ?? true),
      label: 'particle',
    });

    this._Body.setVelocity(body, { x: vx, y: vy });

    if (config.rotate ?? true) {
      const spin = (config.initialAngularVelocity ?? 0.3) * (Math.random() * 2 - 1);
      this._Body.setAngularVelocity(body, spin);
    }

    this._World.add(this._world, body);

    this._objects.push({
      body,
      image: config.image || null,
      size,
      spawnTime: Date.now(),
      dismissTime: dismissBase + Math.random() * 800,
      dismissDuration: 700 + Math.random() * 500,
      isDismissing: false,
      dismissStart: 0,
      rotate: config.rotate ?? true,
      fadeOut: config.fadeOut ?? true,
    });
  }

  _calcVelocity(emissionType, ox, oy, emitter, force, spread, speedScale) {
    const speed = (force + Math.random() * 2) * speedScale;

    if (emissionType === 'omnidirectional') {
      const angle = Math.random() * Math.PI * 2;
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
    }

    // slide type: direction から origin/target を自動決定
    if (emissionType === 'slide') {
      const direction = emitter.direction || 'left-right';
      let originPos, targetPos;

      switch (direction) {
        case 'up-down':
          originPos = { x: 0.5, y: 0 };
          targetPos = { x: 0.5, y: 1 };
          break;
        case 'left-right':
          originPos = { x: 0, y: [0, 1] };
          targetPos = { x: 1, y: [0, 1] };
          break;
        case 'down-up':
          originPos = { x: 0.5, y: 1 };
          targetPos = { x: 0.5, y: 0 };
          break;
        case 'right-left':
          originPos = { x: 1, y: [0, 1] };
          targetPos = { x: 0, y: [0, 1] };
          break;
        default:
          originPos = { x: 0, y: [0, 1] };
          targetPos = { x: 1, y: [0, 1] };
      }

      // 実際の origin/target 値に変換
      const originX = this._range(originPos.x);
      const originY = this._range(originPos.y);
      const targetX = this._range(targetPos.x);

      // target Y: origin Y と同じ比率をマップ
      let targetY;
      if (Array.isArray(targetPos.y)) {
        if (Array.isArray(originPos.y)) {
          const originRange = originPos.y[1] - originPos.y[0];
          const ratio = originRange > 0 ? (originY - originPos.y[0]) / originRange : 0.5;
          const targetRange = targetPos.y[1] - targetPos.y[0];
          targetY = targetPos.y[0] + ratio * targetRange;
        } else {
          targetY = this._range(targetPos.y);
        }
      } else {
        targetY = this._range(targetPos.y);
      }

      // 方向ベクトル: (originX, originY) → (targetX, targetY)
      const dx = targetX - originX;
      const dy = targetY - originY;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / len, ny = dy / len;

      // Apply spread rotation
      const spreadRad = (spread / 2) * (Math.PI / 180) * (Math.random() * 2 - 1);
      const cos = Math.cos(spreadRad), sin = Math.sin(spreadRad);
      const rnx = nx * cos - ny * sin;
      const rny = nx * sin + ny * cos;

      return { vx: rnx * speed, vy: rny * speed };
    }

    // directional type: 従来通り
    const tx = this._range(emitter.target?.x ?? 0.5);
    const ty = this._range(emitter.target?.y ?? 1.0);
    const dx = tx - ox;
    const dy = ty - oy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    let nx = dx / len, ny = dy / len;

    // Apply spread rotation
    const spreadRad = (spread / 2) * (Math.PI / 180) * (Math.random() * 2 - 1);
    const cos = Math.cos(spreadRad), sin = Math.sin(spreadRad);
    const rnx = nx * cos - ny * sin;
    const rny = nx * sin + ny * cos;

    return { vx: rnx * speed, vy: rny * speed };
  }

  // ── Physics Bodies ────────────────────────────────────────────────────────

  _setFloor(enabled) {
    if (enabled && !this._floorBody) {
      const canvas = this._canvas;
      this._floorBody = this._Bodies.rectangle(
        canvas.width / 2, canvas.height + 25,
        canvas.width * 3, 50,
        { isStatic: true, label: 'floor' }
      );
      this._World.add(this._world, this._floorBody);
    } else if (!enabled && this._floorBody) {
      this._World.remove(this._world, this._floorBody);
      this._floorBody = null;
    }
  }

  _setWalls(enabled) {
    if (enabled && this._wallBodies.length === 0) {
      const canvas = this._canvas;
      const left = this._Bodies.rectangle(-25, canvas.height / 2, 50, canvas.height * 3, { isStatic: true, label: 'wall' });
      const right = this._Bodies.rectangle(canvas.width + 25, canvas.height / 2, 50, canvas.height * 3, { isStatic: true, label: 'wall' });
      this._wallBodies = [left, right];
      this._World.add(this._world, this._wallBodies);
    } else if (!enabled && this._wallBodies.length > 0) {
      this._wallBodies.forEach(b => this._World.remove(this._world, b));
      this._wallBodies = [];
    }
  }

  // ── Animation Loop ────────────────────────────────────────────────────────

  _startLoop() {
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      this._update();
      this._animFrameId = requestAnimationFrame(loop);
    };
    this._animFrameId = requestAnimationFrame(loop);
  }

  _update() {
    this._Engine.update(this._engine, 1000 / 60);

    const ctx = this._ctx;
    const canvas = this._canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();

    for (let i = this._objects.length - 1; i >= 0; i--) {
      const obj = this._objects[i];
      const { x, y } = obj.body.position;

      // Out-of-bounds culling
      if (y > canvas.height + obj.size * 2 || y < -canvas.height ||
          x < -canvas.width || x > canvas.width * 2) {
        this._World.remove(this._world, obj.body);
        this._objects.splice(i, 1);
        continue;
      }

      // Start dismiss
      if (!obj.isDismissing && now >= obj.dismissTime) {
        obj.isDismissing = true;
        obj.dismissStart = now;
        if (obj.fadeOut) {
          this._Body.setVelocity(obj.body, {
            x: obj.body.velocity.x + (Math.random() - 0.5) * 4,
            y: obj.body.velocity.y - 4 - Math.random() * 3,
          });
        }
      }

      let opacity;
      if (obj.isDismissing) {
        if (!obj.fadeOut) {
          this._World.remove(this._world, obj.body);
          this._objects.splice(i, 1);
          continue;
        }
        const progress = (now - obj.dismissStart) / obj.dismissDuration;
        if (progress >= 1) {
          this._World.remove(this._world, obj.body);
          this._objects.splice(i, 1);
          continue;
        }
        opacity = 1 - progress;
      } else {
        opacity = Math.min(1, (now - obj.spawnTime) / 300);
      }

      this._drawObject(obj, opacity);
    }

    if (this.onAfterDraw) this.onAfterDraw();
  }

  _drawObject(obj, opacity) {
    const ctx = this._ctx;
    const { x, y } = obj.body.position;
    const angle = obj.rotate ? obj.body.angle : 0;

    ctx.save();
    ctx.globalAlpha = Math.max(0, opacity);
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (obj.image) {
      const url = this._imageResolver ? this._imageResolver(obj.image) : null;
      if (url) {
        if (!(url in this._imageCache)) {
          this._imageCache[url] = null;
          const img = new Image();
          img.onload = () => { this._imageCache[url] = img; };
          img.onerror = () => {
            const fallbackUrl = this._imageResolver ? this._imageResolver('none.png') : null;
            if (fallbackUrl && fallbackUrl !== url) {
              this._imageFallbackMap[url] = fallbackUrl;
              if (!(fallbackUrl in this._imageCache)) {
                this._imageCache[fallbackUrl] = null;
                const fb = new Image();
                fb.onload = () => { this._imageCache[fallbackUrl] = fb; };
                fb.onerror = () => { this._imageCache[fallbackUrl] = false; };
                fb.src = fallbackUrl;
              }
            } else {
              this._imageCache[url] = false;
            }
          };
          img.src = url;
        }
        const drawUrl = this._imageFallbackMap[url] || url;
        const img = this._imageCache[drawUrl];
        if (img && img !== false) {
          const ar = img.naturalWidth / img.naturalHeight;
          let dw = obj.size, dh = obj.size / ar;
          if (dh > obj.size) { dh = obj.size; dw = obj.size * ar; }
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        } else {
          this._drawFallback(ctx, obj, x, y);
        }
      } else {
        this._drawFallback(ctx, obj, x, y);
      }
    } else {
      this._drawFallback(ctx, obj, x, y);
    }

    ctx.restore();
  }

  _drawFallback(ctx, obj, x, y) {
    const hue = ((x * 3 + y * 2) % 360 + 360) % 360;
    ctx.fillStyle = `hsl(${hue}, 75%, 65%)`;
    ctx.beginPath();
    ctx.arc(0, 0, obj.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _range(val) {
    return Array.isArray(val) ? val[0] + Math.random() * (val[1] - val[0]) : val;
  }
}
