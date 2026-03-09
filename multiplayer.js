// ─────────────────────────────────────────────────────────────────────────────
// NEXUS STRIKE — PeerJS Multiplayer Manager v2.0 (Full Combat Sync)
// Fixed: damage/death sync, ability sync, remote hit detection, peerId tracking
// Added: kill events, respawn events, ability events, score sync, KOTH events
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PLAYERS = 8;

class NetManager {
  constructor(game) {
    this.game         = game;
    this.peer         = null;
    this.isHost       = false;
    this.isConnected  = false;
    this.myId         = null;
    this.myPeerId     = null;

    this.guestConns   = {};
    this.hostConn     = null;
    this.players      = {};
    this.lobbySlots   = {};

    this._remoteMeshes   = {};
    this._remoteHealths  = {};
    this._onMsg          = this._onMsg.bind(this);

    this._lastStateSend  = 0;
    this._stateInterval  = 50;
    this._lastPing       = 0;
    this._pingRtt        = 0;
  }

  _status(msg, color = '#00f5ff') {
    const el = document.getElementById('net-status');
    if (el) { el.textContent = msg; el.style.color = color; el.style.display = 'block'; }
    console.log('[NET]', msg);
  }

  _loadPeerJS() {
    return new Promise((resolve, reject) => {
      if (window.Peer) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Failed to load PeerJS'));
      document.head.appendChild(s);
    });
  }

  _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'NXS-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async host() {
    this._status('Loading PeerJS...', '#ffaa00');
    await this._loadPeerJS();
    this.isHost = true;
    const code  = this._genCode();
    this.myId   = code;

    this.peer = new Peer(code, {
      config: { iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]}
    });

    return new Promise((resolve, reject) => {
      this.peer.on('open', id => {
        this.myPeerId = id;
        const myChar = CHARACTERS.find(c => c.id === (this.game.selectedChar || 'vex')) || CHARACTERS[0];
        this.lobbySlots[id] = {
          peerId: id, name: 'HOST', charId: myChar.id, charName: myChar.name,
          team: this.game.playerTeam || 'a', isBot: false, isHost: true
        };
        this._status('Lobby open — code: ' + code, '#00ff88');
        this._showCode(code);
        this._broadcastLobby();
        resolve(code);
      });

      this.peer.on('connection', conn => this._onGuestConnect(conn));

      this.peer.on('error', err => {
        if (err.type === 'unavailable-id') {
          this.peer.destroy();
          const code2 = this._genCode() + Math.random().toString(36).substr(2,2).toUpperCase();
          this.myId = code2;
          this.peer = new Peer(code2, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
          this.peer.on('open', id => {
            this.myPeerId = id;
            this._showCode(id);
            this.peer.on('connection', c => this._onGuestConnect(c));
            resolve(id);
          });
          this.peer.on('error', e => reject(e));
        } else {
          this._status('Error: ' + err.type, '#ff4400');
          reject(err);
        }
      });
    });
  }

  _onGuestConnect(conn) {
    const pid = conn.peer;
    const humanCount = Object.values(this.lobbySlots).filter(s => !s.isBot).length;
    if (humanCount >= MAX_PLAYERS) {
      conn.on('open', () => conn.send({ type: 'lobby_full' }));
      return;
    }
    this._status('Player connecting...', '#ffaa00');
    conn.on('open', () => {
      this.guestConns[pid] = { conn, charId: 'vex', team: 'b', name: 'PLAYER' };
      this.isConnected = true;

      this.lobbySlots[pid] = {
        peerId: pid, name: 'PLAYER', charId: 'vex', charName: 'VEX',
        team: 'b', isBot: false, isHost: false
      };

      conn.send({
        type: 'lobby_welcome',
        yourPeerId: pid,
        hostPeerId: this.myPeerId,
        map: this.game.selectedMap,
        gameMode: this.game.gameMode || 'tdm',
        lobbySlots: this.lobbySlots,
        hostChar: this.game.selectedChar || 'vex',
        hostTeam: this.game.playerTeam || 'a'
      });

      conn.on('data', data => {
        if (!data) return;
        data._from = pid;
        this._onMsg(data);
      });

      conn.on('close', () => {
        delete this.guestConns[pid];
        delete this.lobbySlots[pid];
        delete this.players[pid];
        if (this._remoteMeshes[pid]) {
          this.game.renderer && this.game.renderer.scene && this.game.renderer.scene.remove(this._remoteMeshes[pid]);
          delete this._remoteMeshes[pid];
        }
        this._status('Player left. ' + Object.keys(this.guestConns).length + ' connected.', '#ff4400');
        this._broadcastLobby();
        if (this.game._updateLobbyDisplay) this.game._updateLobbyDisplay();
      });

      this._status('✓ ' + Object.keys(this.guestConns).length + '/' + (MAX_PLAYERS - 1) + ' players joined!', '#00ff88');
      this._broadcastLobby();
      if (this.game._updateLobbyDisplay) this.game._updateLobbyDisplay();
    });
  }

  _showCode(code) {
    const el = document.getElementById('lobby-code-display');
    if (el) el.textContent = code;
    document.getElementById('lobby-room') && document.getElementById('lobby-room').classList.remove('hidden');
    document.getElementById('lobby-options') && document.getElementById('lobby-options').classList.add('hidden');
    document.getElementById('btn-start-match') && document.getElementById('btn-start-match').classList.remove('hidden');
  }

  async join(code) {
    this._status('Loading PeerJS...', '#ffaa00');
    await this._loadPeerJS();
    this.isHost = false;
    const cleanCode = code.trim().toUpperCase();

    this.peer = new Peer(undefined, {
      config: { iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]}
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timed out after 15s')), 15000);

      this.peer.on('open', myId => {
        this.myPeerId = myId;
        this._status('Connecting to ' + cleanCode + '...', '#ffaa00');
        const conn = this.peer.connect(cleanCode, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          clearTimeout(timeout);
          this.hostConn = conn;
          this.isConnected = true;
          this._status('✓ Connected to lobby!', '#00ff88');
          conn.on('data', data => {
            if (!data) return;
            if (!data._from) data._from = cleanCode;
            this._onMsg(data);
          });
          conn.on('close', () => {
            this._status('Disconnected from host', '#ff4400');
            this.isConnected = false;
          });
          const myChar = CHARACTERS.find(c => c.id === (this.game.selectedChar || 'vex')) || CHARACTERS[0];
          conn.send({
            type: 'char_select',
            charId: myChar.id,
            charName: myChar.name,
            team: this.game.playerTeam || 'b',
            name: 'PLAYER',
            peerId: myId,
            _from: myId
          });
          resolve(conn);
        });
        conn.on('error', e => { clearTimeout(timeout); reject(e); });
      });
      this.peer.on('error', e => { clearTimeout(timeout); reject(e); });
    });
  }

  _sendToHost(data) {
    if (!data._from) data._from = this.myPeerId;
    if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(data); } catch(e) {}
    }
  }

  _sendToGuest(peerId, data) {
    const g = this.guestConns[peerId];
    if (g && g.conn && g.conn.open) {
      try { g.conn.send(data); } catch(e) {}
    }
  }

  _broadcast(data, excludeId) {
    for (const pid in this.guestConns) {
      if (pid === excludeId) continue;
      const g = this.guestConns[pid];
      if (g && g.conn && g.conn.open) { try { g.conn.send(data); } catch(e) {} }
    }
  }

  _broadcastLobby() {
    this._broadcast({ type: 'lobby_update', lobbySlots: this.lobbySlots });
  }

  _onMsg(data) {
    if (!data || !data.type) return;
    const fromId = data._from || data.peerId || data.id;

    switch (data.type) {

      case 'lobby_full':
        this._status('✗ Lobby is full (8/8)', '#ff4400');
        break;

      case 'lobby_welcome':
        this.myPeerId = data.yourPeerId;
        this.game.selectedMap = data.map || this.game.selectedMap;
        if (data.gameMode) this.game.gameMode = data.gameMode;
        this.game.remoteChar = data.hostChar;
        if (data.lobbySlots) this.lobbySlots = data.lobbySlots;
        this._status('✓ In lobby — ' + Object.keys(this.lobbySlots).length + '/' + MAX_PLAYERS + ' players', '#00ff88');
        if (this.game._updateLobbyDisplay) this.game._updateLobbyDisplay();
        break;

      case 'lobby_update':
        if (data.lobbySlots) this.lobbySlots = data.lobbySlots;
        if (this.game._updateLobbyDisplay) this.game._updateLobbyDisplay();
        break;

      case 'char_select':
        if (this.isHost) {
          const pid = fromId || this._findSenderPeer(data);
          if (pid && this.lobbySlots[pid]) {
            this.lobbySlots[pid].charId   = data.charId;
            this.lobbySlots[pid].charName = data.charName;
            if (data.team) this.lobbySlots[pid].team = data.team;
            if (data.name) this.lobbySlots[pid].name = data.name;
            if (this.guestConns[pid]) {
              this.guestConns[pid].charId = data.charId;
              this.guestConns[pid].team   = data.team;
            }
            this._broadcastLobby();
          }
        } else {
          this.game.remoteChar = data.charId;
          if (data.lobbySlots) this.lobbySlots = data.lobbySlots;
          if (this.game._updateLobbyDisplay) this.game._updateLobbyDisplay();
        }
        break;

      case 'team_select':
        if (this.isHost) {
          const pid = fromId || this._findSenderPeer(data);
          if (pid && this.lobbySlots[pid]) {
            this.lobbySlots[pid].team = data.team;
            this._broadcastLobby();
          }
        }
        break;

      case 'match_start':
        this.game.selectedMap = data.map || this.game.selectedMap;
        this.game.gameMode    = data.gameMode || 'tdm';
        if (data.lobbySlots) { this.lobbySlots = data.lobbySlots; }
        if (!this.isHost && this.game._startGame) {
          // Sync player team from lobby slot before starting
          if (this.myPeerId && this.lobbySlots[this.myPeerId]) {
            this.game.playerTeam = this.lobbySlots[this.myPeerId].team || 'b';
          }
          setTimeout(() => this.game._startGame(false), 300);
        }
        break;
      case 'player_state':
        if (data.id === this.myPeerId) break;
        this.players[data.id] = data;
        this._remoteHealths[data.id] = { hp: data.hp, sh: data.sh, maxHp: data.maxHp || 100, maxSh: data.maxSh || 50, alive: data.alive };
        if (this.isHost && data.id) {
          this._broadcast(data, data.id);
        }
        break;

      case 'shoot':
        if (data.id === this.myPeerId) break;
        if (this.game.bullets && data.bullets) {
          for (const b of data.bullets) {
            this.game.bullets.push({
              position:         new THREE.Vector3(b.px, b.py, b.pz),
              direction:        new THREE.Vector3(b.dx, b.dy, b.dz),
              ownerTeam:        data.team || 'b',
              ownerId:          data.id || 'remote',
              isRemote:         true,
              isMelee:          false,
              alive:            true,
              distanceTraveled: 0,
              speed:            b.speed || 140,
              damage:           b.damage || 28,
              range:            b.range  || 60,
              penetrating:      b.penetrating || false
            });
          }
        }
        if (this.isHost) this._broadcast(data, data.id);
        break;

      case 'damage_event':
        if (data.targetId === this.myPeerId && this.game.player && this.game.player.isAlive) {
          this.game.player.takeDamage(data.damage);
          // Visual damage feedback
          if (this.game.hud) this.game.hud.damageFlash && this.game.hud.damageFlash();
          if (window._onPlayerDamaged) window._onPlayerDamaged(data.damage);
          if (!this.game.player.isAlive) {
            const killEvt = {
              type:       'kill_event',
              _from:      this.myPeerId,
              killerId:   data.killerId,
              killerName: data.killerName || 'ENEMY',
              killerTeam: this.lobbySlots[data.killerId] ? this.lobbySlots[data.killerId].team : 'b',
              victimId:   this.myPeerId,
              victimName: this._getMyName(),
              weaponName: data.weaponName || 'WEAPON'
            };
            if (this.isHost) this._onMsg(killEvt);
            else             this._sendToHost(killEvt);
          }
        }
        if (this.isHost) this._broadcast(data, fromId);
        break;

      case 'kill_event':
        if (this.game.hud) {
          const isOurs = data.killerId === this.myPeerId;
          this.game.hud.killfeed(data.killerName || 'PLAYER', data.victimName || 'ENEMY', data.weaponName || 'WEAPON', isOurs);
          if (isOurs) {
            this.game.hud.killNotif(data.victimName || 'ENEMY');
            if (this.game.player) this.game.player.kills++;
            this.game._addScore(data.killerTeam || 'a', this.myPeerId);
          } else if (data.victimId !== this.myPeerId) {
            this.game._addScore(data.killerTeam || 'a', data.killerId);
          }
          if (data.victimId === this.myPeerId) {
            this.game._playerDied();
          }
        }
        if (this.isHost) this._broadcast(data, fromId);
        break;

      case 'death_event':
        if (data.victimId !== this.myPeerId && this._remoteMeshes[data.victimId]) {
          this._remoteMeshes[data.victimId].visible = false;
        }
        if (this.isHost) this._broadcast(data, fromId);
        break;

      case 'respawn_event':
        if (data.id !== this.myPeerId && this._remoteMeshes[data.id]) {
          this._remoteMeshes[data.id].visible = true;
        }
        if (this.isHost) this._broadcast(data, fromId);
        break;

      case 'ability_event':
        if (data.id === this.myPeerId) break;
        this._playRemoteAbility(data);
        if (this.isHost) this._broadcast(data, data.id);
        break;

      case 'melee_event':
        if (data.id === this.myPeerId) break;
        if (this.game.player && this.game.player.isAlive && data.team !== this.game.player.team) {
          const mPos = new THREE.Vector3(data.px, data.py, data.pz);
          const dist  = mPos.distanceTo(this.game.player.position);
          if (dist < (data.range || 2.5) + 0.5) {
            const dmg = data.damage || 80;
            this.game.player.takeDamage(dmg);
            if (window._onPlayerDamaged) window._onPlayerDamaged(dmg);
            if (!this.game.player.isAlive) {
              const killEvt = {
                type:       'kill_event',
                _from:      this.myPeerId,
                killerId:   data.id,
                killerName: this.lobbySlots[data.id] ? this.lobbySlots[data.id].name : 'ENEMY',
                killerTeam: data.team,
                victimId:   this.myPeerId,
                victimName: this._getMyName(),
                weaponName: 'MELEE'
              };
              if (this.isHost) this._onMsg(killEvt);
              else             this._sendToHost(killEvt);
            }
          }
        }
        if (this.isHost) this._broadcast(data, data.id);
        break;

      case 'koth_state':
        if (!this.isHost && this.game._onKothStateSync) {
          this.game._onKothStateSync(data);
        }
        break;

      case 'score_sync':
        if (!this.isHost) {
          this.game.scoreA = data.scoreA || 0;
          this.game.scoreB = data.scoreB || 0;
          if (this.game.hud) this.game.hud.score(this.game.scoreA, this.game.scoreB);
          // Also sync match time if host sends it
          if (data.timeLeft !== undefined && this.game.matchTimeLeft !== undefined) {
            this.game.matchTimeLeft = data.timeLeft;
            if (this.game.hud) this.game.hud.timer(data.timeLeft);
          }
        }
        break;

      case 'ping':
        const pongData = { type: 'pong', t: data.t };
        if (this.isHost) this._sendToGuest(fromId, pongData);
        else             this._sendToHost(pongData);
        break;

      case 'pong':
        this._pingRtt = performance.now() - data.t;
        break;
    }
  }

  _playRemoteAbility(data) {
    if (!this.game.renderer || !this.game.renderer.scene) return;
    const scene = this.game.renderer.scene;
    const flash = new THREE.PointLight(0x00f5ff, 4, 10);
    flash.position.set(data.px || 0, (data.py || 1) + 1, data.pz || 0);
    scene.add(flash);
    let t = 0;
    const fade = () => {
      t += 0.04;
      flash.intensity = Math.max(0, 4 - t * 20);
      if (t < 0.3) requestAnimationFrame(fade);
      else scene.remove(flash);
    };
    fade();
  }

  _findSenderPeer(data) {
    if (data._from) return data._from;
    if (data.peerId) return data.peerId;
    for (const pid in this.guestConns) return pid;
    return null;
  }

  startMatch(map) {
    if (!this.isHost) return;
    const myChar = CHARACTERS.find(c => c.id === (this.game.selectedChar || 'vex')) || CHARACTERS[0];
    if (this.myPeerId) {
      this.lobbySlots[this.myPeerId] = {
        peerId: this.myPeerId, name: 'HOST', charId: myChar.id, charName: myChar.name,
        team: this.game.playerTeam || 'a', isBot: false, isHost: true
      };
    }
    this._broadcast({ type: 'match_start', map, gameMode: this.game.gameMode || 'tdm', lobbySlots: this.lobbySlots });
  }

  syncGameState(player, newBullets, kothState) {
    if (!this.isConnected || !player) return;
    const now = performance.now();

    if (now - this._lastStateSend >= this._stateInterval) {
      this._lastStateSend = now;
      const msg = {
        type:  'player_state',
        id:    this.myPeerId || 'remote',
        _from: this.myPeerId,
        px: player.position.x, py: player.position.y, pz: player.position.z,
        yaw: player.yaw, pitch: player.pitch,
        hp:  player.health, sh: player.shield,
        maxHp: player.maxHealth || 100, maxSh: player.maxShield || 50,
        alive: player.isAlive,
        charId: this.game.selectedChar,
        team: player.team,
        moving: !!(player.velocity && (Math.abs(player.velocity.x)+Math.abs(player.velocity.z)) > 0.5)
      };
      if (this.isHost) this._broadcast(msg);
      else             this._sendToHost(msg);

      if (this.isHost && kothState) {
        this._broadcast({ type: 'koth_state', ...kothState });
      }
      if (this.isHost) {
        this._broadcast({ type: 'score_sync', scoreA: this.game.scoreA || 0, scoreB: this.game.scoreB || 0, timeLeft: this.game.matchTimeLeft || 0 });
      }

      if (now - this._lastPing > 5000) {
        this._lastPing = now;
        const pingMsg = { type: 'ping', t: now };
        if (this.isHost) this._broadcast(pingMsg);
        else             this._sendToHost(pingMsg);
      }
    }

    if (newBullets && newBullets.length) {
      const shootMsg = {
        type:  'shoot',
        id:    this.myPeerId || 'remote',
        _from: this.myPeerId,
        team:  player.team,
        bullets: newBullets.map(b => ({
          px: b.position.x, py: b.position.y, pz: b.position.z,
          dx: b.direction.x, dy: b.direction.y, dz: b.direction.z,
          speed: b.speed, damage: b.damage, range: b.range,
          penetrating: b.penetrating || false
        }))
      };
      if (this.isHost) this._broadcast(shootMsg, this.myPeerId);
      else             this._sendToHost(shootMsg);
    }
  }

  sendDamageEvent(targetPeerId, damage, killerName, weaponName) {
    if (!targetPeerId || !damage) return;
    const evt = {
      type:       'damage_event',
      _from:      this.myPeerId,
      targetId:   targetPeerId,
      killerId:   this.myPeerId,
      killerName: killerName || this._getMyName(),
      weaponName: weaponName || 'WEAPON',
      damage
    };
    if (this.isHost) {
      // Handle locally + relay to target if they're a guest
      this._onMsg({ ...evt, _from: this.myPeerId });
      this._sendToGuest(targetPeerId, evt); // direct send to target
    } else {
      // Guests always route through host
      this._sendToHost(evt);
    }
  }

  sendMeleeEvent(player, weaponStats) {
    const evt = {
      type:   'melee_event',
      id:     this.myPeerId,
      _from:  this.myPeerId,
      team:   player.team,
      px:     player.position.x,
      py:     player.position.y,
      pz:     player.position.z,
      damage: weaponStats ? weaponStats.damage : 80,
      range:  weaponStats ? weaponStats.meleeRadius || 2.5 : 2.5
    };
    if (this.isHost) this._broadcast(evt, this.myPeerId);
    else             this._sendToHost(evt);
  }

  sendAbilityEvent(player, abilityKey) {
    const evt = {
      type: 'ability_event',
      id:   this.myPeerId,
      _from: this.myPeerId,
      key:  abilityKey,
      px:   player.position.x,
      py:   player.position.y,
      pz:   player.position.z
    };
    if (this.isHost) this._broadcast(evt, this.myPeerId);
    else             this._sendToHost(evt);
  }

  updateRemoteVisuals(scene) {
    for (const id in this.players) {
      if (id === this.myPeerId) continue;
      const state = this.players[id];

      if (!state.alive) {
        if (this._remoteMeshes[id]) this._remoteMeshes[id].visible = false;
        continue;
      }

      if (!this._remoteMeshes[id]) {
        const charDef = CHARACTERS.find(c => c.id === state.charId) || CHARACTERS[0];
        const mesh = buildCharMesh(state.charId || 'apex', charDef, false);
        const isEnemy = state.team !== this.game.playerTeam;
        mesh.traverse(c => {
          if (c.isPointLight) c.color.setHex(isEnemy ? 0xff2200 : 0x00ff88);
        });
        scene.add(mesh);
        this._remoteMeshes[id] = mesh;
      }

      const mesh = this._remoteMeshes[id];
      mesh.visible = true;
      // Smooth position interpolation — prevents teleporting on packet loss
      const tx = state.px, ty = state.py - 1.75, tz = state.pz;
      mesh.position.x += (tx - mesh.position.x) * 0.35;
      mesh.position.y += (ty - mesh.position.y) * 0.35;
      mesh.position.z += (tz - mesh.position.z) * 0.35;
      // Smooth yaw rotation
      let dRot = (state.yaw || 0) - mesh.rotation.y;
      while (dRot >  Math.PI) dRot -= Math.PI * 2;
      while (dRot < -Math.PI) dRot += Math.PI * 2;
      mesh.rotation.y += dRot * 0.30;
      // Animate remote player with walk cycle if moving
      if (typeof animateCharMesh === 'function') {
        const spd = state.moving ? 7 : 0;
        animateCharMesh(mesh, spd, state.moving ? 'patrol' : 'idle', 16, 0, 0);
      }
    }
  }

  getLobbySlots()     { return this.lobbySlots; }
  getHumanCount()     { return Object.values(this.lobbySlots).filter(s => !s.isBot).length; }
  getSlotsRemaining() { return MAX_PLAYERS - this.getHumanCount(); }
  getPingMs()         { return Math.round(this._pingRtt); }
  getRemoteHealth(id) { return this._remoteHealths[id] || null; }

  _getMyName() {
    return (this.lobbySlots[this.myPeerId] && this.lobbySlots[this.myPeerId].name) || (this.isHost ? 'HOST' : 'PLAYER');
  }

  sendCharSelect(charId, charName, team) {
    const data = { type: 'char_select', charId, charName, team, peerId: this.myPeerId, _from: this.myPeerId };
    if (this.isHost) {
      if (this.myPeerId && this.lobbySlots[this.myPeerId]) {
        this.lobbySlots[this.myPeerId].charId   = charId;
        this.lobbySlots[this.myPeerId].charName = charName;
        this.lobbySlots[this.myPeerId].team     = team;
        this._broadcastLobby();
      }
    } else {
      this._sendToHost(data);
    }
  }

  destroy() {
    if (this.isHost) {
      for (const g of Object.values(this.guestConns)) { try { g.conn && g.conn.close(); } catch(_){} }
    } else {
      try { this.hostConn && this.hostConn.close(); } catch(_) {}
    }
    try { this.peer && this.peer.destroy(); } catch(_) {}
    this.guestConns  = {};
    this.hostConn    = null;
    this.peer        = null;
    this.isConnected = false;

    if (this._remoteMeshes) {
      for (const m of Object.values(this._remoteMeshes)) {
        if (m.parent) m.parent.remove(m);
      }
      this._remoteMeshes = {};
    }
    this.players = {};
    this._remoteHealths = {};
  }
}
