// Jogo Space Shooter AR ("Navinha vs Meteoros")
// Coordenadas normalizadas (u, v) de 0..1 dentro do quadrilátero AR da folha

export class SpaceARGame {
  constructor() {
    this.bestScore = Number(localStorage.getItem('space_ar_best') || 0);
    this.reset();
  }

  reset() {
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.elapsed = 0;
    this.playerU = 0.5;
    this.playerV = 0.87;
    this.bullets = [];
    this.enemies = [];
    this.meteors = [];
    this.particles = [];
    this.stars = Array.from({ length: 28 }, () => ({
      u: Math.random(),
      v: Math.random(),
      speed: 0.12 + Math.random() * 0.25,
      size: 1 + Math.random() * 1.8,
    }));
    this.fireCooldown = 0;
    this.enemyTimer = 0.6;
    this.meteorTimer = 1.4;
    this.invulnTimer = 0;
    this.gameOver = false;
  }

  update(dt, controlTilt, touchU) {
    if (this.gameOver) {
      this._updateParticles(dt);
      return;
    }

    this.elapsed += dt;
    this.wave = 1 + Math.floor(this.score / 100);

    // Movimento do jogador: inclinação da folha OU toque/teclado
    if (touchU !== null && touchU !== undefined) {
      this.playerU += (touchU - this.playerU) * Math.min(1, dt * 12);
    } else if (controlTilt !== 0) {
      this.playerU += controlTilt * dt * 1.15;
    }
    this.playerU = Math.max(0.08, Math.min(0.92, this.playerU));

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // Estrelas de fundo
    for (const s of this.stars) {
      s.v += s.speed * dt;
      if (s.v > 1) {
        s.v = 0;
        s.u = Math.random();
      }
    }

    // Tiro automático
    this.fireCooldown -= dt;
    const fireRate = Math.max(0.2, 0.35 - (this.wave - 1) * 0.02);
    if (this.fireCooldown <= 0) {
      this.bullets.push({ u: this.playerU, v: this.playerV - 0.045, speed: 1.05 });
      this.fireCooldown = fireRate;
    }

    // Atualiza tiros
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      this.bullets[i].v -= this.bullets[i].speed * dt;
      if (this.bullets[i].v < -0.05) this.bullets.splice(i, 1);
    }

    // Spawna navezinhas inimigas
    this.enemyTimer -= dt;
    if (this.enemyTimer <= 0) {
      this.enemies.push({
        u: 0.1 + Math.random() * 0.8,
        v: -0.05,
        speed: 0.18 + Math.random() * 0.08 + (this.wave - 1) * 0.025,
        swayAmp: this.wave >= 2 ? 0.08 : 0,
        swayFreq: 2.2 + Math.random(),
        phase: Math.random() * Math.PI * 2,
      });
      this.enemyTimer = Math.max(0.48, 1.25 - (this.wave - 1) * 0.1);
    }

    // Spawna meteoros (indestrutíveis — precisa desviar!)
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.meteors.push({
        u: 0.09 + Math.random() * 0.82,
        v: -0.06,
        vy: 0.22 + Math.random() * 0.1 + (this.wave - 1) * 0.025,
        vx: (Math.random() - 0.5) * 0.12,
        r: 0.042 + Math.random() * 0.015,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 3.5,
      });
      this.meteorTimer = Math.max(0.75, 1.85 - (this.wave - 1) * 0.12);
    }

    // Atualiza inimigos e colisão com tiros
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.v += e.speed * dt;
      if (e.swayAmp > 0) {
        e.u += Math.sin(this.elapsed * e.swayFreq + e.phase) * e.swayAmp * dt;
        e.u = Math.max(0.08, Math.min(0.92, e.u));
      }

      // Colisão tiro x inimigo
      let destroyed = false;
      for (let b = this.bullets.length - 1; b >= 0; b--) {
        const bul = this.bullets[b];
        if (Math.hypot(bul.u - e.u, bul.v - e.v) < 0.055) {
          this.bullets.splice(b, 1);
          this._spawnExplosion(e.u, e.v, '#38bdf8', 10);
          this.score += 10;
          if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('space_ar_best', String(this.bestScore));
          }
          this.enemies.splice(i, 1);
          destroyed = true;
          break;
        }
      }
      if (destroyed) continue;

      // Colisão inimigo x jogador
      if (this.invulnTimer <= 0 && Math.hypot(e.u - this.playerU, e.v - this.playerV) < 0.068) {
        this._hitPlayer();
        this.enemies.splice(i, 1);
        continue;
      }

      if (e.v > 1.08) this.enemies.splice(i, 1);
    }

    // Atualiza meteoros e colisões
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.v += m.vy * dt;
      m.u += m.vx * dt;
      m.angle += m.spin * dt;
      if (m.u < 0.06 || m.u > 0.94) m.vx *= -1;

      // Tiros batem no meteoro e soltam faísca (não destroem)
      for (let b = this.bullets.length - 1; b >= 0; b--) {
        const bul = this.bullets[b];
        if (Math.hypot(bul.u - m.u, bul.v - m.v) < m.r + 0.015) {
          this.bullets.splice(b, 1);
          this._spawnExplosion(bul.u, bul.v, '#fb923c', 4);
        }
      }

      // Colisão meteoro x jogador
      if (this.invulnTimer <= 0 && Math.hypot(m.u - this.playerU, m.v - this.playerV) < m.r + 0.036) {
        this._hitPlayer();
        this.meteors.splice(i, 1);
        continue;
      }

      if (m.v > 1.1) this.meteors.splice(i, 1);
    }

    this._updateParticles(dt);
  }

  _hitPlayer() {
    this.lives--;
    this.invulnTimer = 1.5;
    this._spawnExplosion(this.playerU, this.playerV, '#ef4444', 16);
    if (this.lives <= 0) {
      this.lives = 0;
      this.gameOver = true;
    }
  }

  _spawnExplosion(u, v, color, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.08 + Math.random() * 0.25;
      this.particles.push({
        u,
        v,
        vu: Math.cos(ang) * spd,
        vv: Math.sin(ang) * spd,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        color,
      });
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.u += p.vu * dt;
      p.v += p.vv * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  _toScreen(quad, u, v) {
    const { tl, tr, br, bl } = quad;
    const topX = tl.x + (tr.x - tl.x) * u;
    const topY = tl.y + (tr.y - tl.y) * u;
    const botX = bl.x + (br.x - bl.x) * u;
    const botY = bl.y + (br.y - bl.y) * u;
    return {
      x: topX + (botX - topX) * v,
      y: topY + (botY - topY) * v,
    };
  }

  render(ctx, quad) {
    const { tl, tr, br, bl } = quad;
    const boardScale = Math.min(
      Math.hypot(tr.x - tl.x, tr.y - tl.y),
      Math.hypot(bl.x - tl.x, bl.y - tl.y)
    );
    const unit = Math.max(10, boardScale * 0.045);

    ctx.save();

    // Recorta e preenche o fundo espacial dentro do tabuleiro AR
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(7, 13, 28, 0.84)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#22d3ee';
    ctx.stroke();
    ctx.clip();

    // Estrelas
    ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
    for (const s of this.stars) {
      const p = this._toScreen(quad, s.u, s.v);
      ctx.fillRect(p.x, p.y, s.size, s.size);
    }

    // Tiros (lasers ciano)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(2.5, unit * 0.25);
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      const p1 = this._toScreen(quad, b.u, b.v);
      const p2 = this._toScreen(quad, b.u, b.v + 0.032);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Ângulo do tabuleiro para orientar sprites
    const boardAngle = Math.atan2(tr.y - tl.y, tr.x - tl.x);

    // Navezinhas inimigas
    for (const e of this.enemies) {
      const p = this._toScreen(quad, e.u, e.v);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(boardAngle);
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(0, unit * 0.85);
      ctx.lineTo(-unit * 0.85, -unit * 0.55);
      ctx.lineTo(-unit * 0.25, -unit * 0.25);
      ctx.lineTo(0, -unit * 0.7);
      ctx.lineTo(unit * 0.25, -unit * 0.25);
      ctx.lineTo(unit * 0.85, -unit * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(0, 0, unit * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Meteoros (indestrutíveis)
    for (const m of this.meteors) {
      const p = this._toScreen(quad, m.u, m.v);
      const rad = m.r * boardScale;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = '#78716c';
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sides = 7;
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const rr = rad * (k % 2 === 0 ? 1.0 : 0.76);
        const rx = Math.cos(ang) * rr;
        const ry = Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Partículas
    for (const pt of this.particles) {
      const p = this._toScreen(quad, pt.u, pt.v);
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Nave do jogador
    const blink = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 12) % 2 === 0;
    if (!blink && !this.gameOver) {
      const p = this._toScreen(quad, this.playerU, this.playerV);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(boardAngle);

      // Chama do propulsor
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(-unit * 0.25, unit * 0.6);
      ctx.lineTo(0, unit * (1.1 + Math.random() * 0.3));
      ctx.lineTo(unit * 0.25, unit * 0.6);
      ctx.closePath();
      ctx.fill();

      // Corpo da nave
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(0, -unit * 1.0);
      ctx.lineTo(unit * 0.9, unit * 0.65);
      ctx.lineTo(unit * 0.28, unit * 0.4);
      ctx.lineTo(0, unit * 0.65);
      ctx.lineTo(-unit * 0.28, unit * 0.4);
      ctx.lineTo(-unit * 0.9, unit * 0.65);
      ctx.closePath();
      ctx.fill();

      // Cabine
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.ellipse(0, -unit * 0.15, unit * 0.2, unit * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }
}
