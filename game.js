// game.js — HUD, Menus, Game Loop, Bullet System
// UPGRADED: 8-player lobby, melee hit detection, smart bot spawning, damage flash

// ─────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────
class HUD {
  constructor() { this.minimapCtx = document.getElementById('minimap-canvas')?.getContext('2d'); }
  $(id) { return document.getElementById(id); }

  vitals(hp, maxHp, sh, maxSh) {
    const hPct = Math.max(0, hp/maxHp)*100, sPct = Math.max(0, sh/maxSh)*100;
    const hf = this.$('health-fill');
    if (hf) { hf.style.width=hPct+'%'; const hue=(hPct/100)*120; hf.style.background=`hsl(${hue},100%,45%)`; hf.style.boxShadow=`0 0 8px hsl(${hue},100%,45%)`; }
    const hv=this.$('health-val'); if(hv)hv.textContent=Math.ceil(hp);
    const sf=this.$('shield-fill'); if(sf)sf.style.width=sPct+'%';
    const sv=this.$('shield-val'); if(sv)sv.textContent=Math.ceil(sh);
  }

  ammo(cur, res, name, reloading, isMelee) {
    const ac=this.$('ammo-current');
    if(ac){ ac.textContent=isMelee?'∞':cur; ac.style.color=isMelee?'#00ff88':(cur<8?'#ff4400':'#e8f4ff'); }
    const ar=this.$('ammo-reserve'); if(ar)ar.textContent=isMelee?'∞':res;
    const wn=this.$('weapon-name');  if(wn)wn.textContent=name||'';
    const ri=this.$('reload-indicator'); if(ri)ri.classList.toggle('hidden',!reloading||isMelee);
  }

score(a,b) { const sa=this.$('score-a');if(sa)sa.textContent=a;const sb=this.$('score-b');if(sb)sb.textContent=b; }

  kothBar(progress, capturer, teamATime, teamBTime, winTime) {
    let el=document.getElementById('koth-bar-wrap');
    if(!el){
      el=document.createElement('div');el.id='koth-bar-wrap';
      el.style.cssText='position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:300;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;';
      el.innerHTML='<div style="font-family:Orbitron,monospace;font-size:10px;letter-spacing:.3em;color:#ffaa00;text-shadow:0 0 8px #ffaa00">◈ KING OF THE HILL</div><div style="display:flex;align-items:center;gap:8px"><span id="koth-a-time" style="font-family:Orbitron,monospace;font-size:11px;color:#00a8ff;min-width:36px;text-align:right">0s</span><div style="width:200px;height:8px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,170,0,0.5);border-radius:4px;overflow:hidden"><div id="koth-fill" style="height:100%;background:linear-gradient(90deg,#00a8ff,#ffaa00,#ff4400);transition:width .15s;width:0%"></div></div><span id="koth-b-time" style="font-family:Orbitron,monospace;font-size:11px;color:#ff4400;min-width:36px">0s</span></div><div id="koth-capturer" style="font-family:Orbitron,monospace;font-size:9px;letter-spacing:.2em;color:rgba(255,255,255,0.5)">UNCAPTURED</div>';
      const hudEl=document.getElementById('hud');if(hudEl)hudEl.appendChild(el);
    }
    const fill=document.getElementById('koth-fill');if(fill)fill.style.width=progress+'%';
    const at=document.getElementById('koth-a-time');if(at)at.textContent=Math.floor(teamATime)+'s';
    const bt=document.getElementById('koth-b-time');if(bt)bt.textContent=Math.floor(teamBTime)+'s';
    const cap=document.getElementById('koth-capturer');if(cap){
      if(capturer==='a')cap.innerHTML='<span style="color:#00a8ff">TEAM A HOLDING</span> — '+Math.floor(teamATime)+'/'+winTime+'s';
      else if(capturer==='b')cap.innerHTML='<span style="color:#ff4400">TEAM B HOLDING</span> — '+Math.floor(teamBTime)+'/'+winTime+'s';
      else cap.textContent='◈ ZONE CONTESTED — MOVE IN';
    }
  }

  timer(secs) {
    const el=this.$('match-timer'); if(!el)return;
    const m=Math.floor(secs/60), s=secs%60;
    el.textContent=`${m}:${String(s).padStart(2,'0')}`;
    el.style.color=secs<=30?'#ff1a2e':'';
  }

  abilities(charDef, cds) {
    if(!charDef)return;
    for (const k of ['e','q','f']) {
      const ab=charDef.abilities[k];
      const ic=this.$(`ability-${k}-icon`); if(ic&&ab)ic.textContent=ab.icon;
      const nm=this.$(`ability-${k}-name`); if(nm&&ab)nm.textContent=ab.name.split(' ')[0];
      const sl=this.$(`ability-${k}-slot`);
      const cd=this.$(`ability-${k}-cd`);
      if(cd){
        const rem=cds[k]||0;
        if(rem>0){cd.classList.add('active');cd.textContent=Math.ceil(rem/1000)+'s';if(sl)sl.classList.add('on-cd');}
        else{cd.classList.remove('active');if(sl)sl.classList.remove('on-cd');}
      }
    }
  }

  teamStatus(playerList, botList, playerTeam) {
    const update=(slotId,units,teamColor)=>{
      const el=document.getElementById(slotId); if(!el)return;
      el.innerHTML=units.slice(0,4).map(u=>`
        <div class="team-mini-slot ${u.isAlive?'':'dead'}">
          <span class="tms-name" style="color:${teamColor}">${u.name}</span>
          <div class="tms-bar"><div class="tms-fill" style="width:${Math.max(0,(u.health/u.maxHealth)*100)}%;background:${u.health/u.maxHealth>0.5?teamColor:'#ff4400'}"></div></div>
        </div>`).join('');
    };
    update('team-a-status',playerList,'var(--team-a)');
    update('team-b-status',botList,'var(--team-b)');
  }

  hitMarker(crit) {
    const el=this.$('hit-indicator'); if(!el)return;
    el.classList.remove('hidden'); el.style.borderColor=crit?'#ffaa00':'#ff1a2e';
    clearTimeout(this._ht); this._ht=setTimeout(()=>el.classList.add('hidden'),120);
  }

  killfeed(killer, victim, weapon, own) {
    const kf=this.$('killfeed'); if(!kf)return;
    const div=document.createElement('div'); div.className=`kill-entry${own?' own':''}`;
    div.innerHTML=`<span class="killer">${killer}</span><span class="weapon-tag"> [${weapon}] </span><span class="victim">${victim}</span>`;
    kf.appendChild(div);
    setTimeout(()=>{div.style.opacity='0';setTimeout(()=>div.remove(),500);},4500);
    while(kf.children.length>6)kf.children[0].remove();
  }

  killNotif(name) {
    const el=this.$('kill-notification'); if(!el)return;
    el.textContent=`✕ ${name} ELIMINATED`; el.classList.remove('hidden');
    el.style.animation='none'; el.offsetHeight; el.style.animation='killNotif 2s ease forwards';
    clearTimeout(this._knt); this._knt=setTimeout(()=>el.classList.add('hidden'),2100);
  }

  elimBanner(delay) {
    const el=this.$('elim-banner'); if(!el)return; el.classList.remove('hidden');
    let t=delay;
    const iv=setInterval(()=>{const rt=this.$('respawn-timer');if(rt)rt.textContent=--t;if(t<=0){clearInterval(iv);el.classList.add('hidden');}},1000);
  }

  matchEnd(won, stats) {
    const el=this.$('match-end'); if(!el)return; el.classList.remove('hidden');
    const mr=this.$('match-result'); if(mr){mr.textContent=won?'VICTORY':'DEFEAT';mr.className=`match-result ${won?'win':'loss'}`;}
    const ms=this.$('match-stats'); if(ms)ms.innerHTML=`K: ${stats.kills} &nbsp; D: ${stats.deaths} &nbsp; A: ${stats.assists}<br>Accuracy: ${stats.acc}%`;
  }

  minimap(playerState, units, mapSz) {
    const ctx=this.minimapCtx; if(!ctx)return;
    const sz=150;
    ctx.clearRect(0,0,sz,sz); ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(0,0,sz,sz);
    ctx.strokeStyle='rgba(0,245,255,0.1)'; ctx.lineWidth=0.5;
    for(let i=0;i<=5;i++){ctx.beginPath();ctx.moveTo(i*30,0);ctx.lineTo(i*30,sz);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*30);ctx.lineTo(sz,i*30);ctx.stroke();}
    const toM=p=>({x:((p.x+mapSz/2)/mapSz)*sz,y:((p.z+mapSz/2)/mapSz)*sz});
    for(const u of units){
      if(!u.isAlive)continue;
      const m=toM(u.position);
      ctx.beginPath();ctx.arc(m.x,m.y,u.isPlayer?5:3,0,Math.PI*2);
      ctx.fillStyle=u.isPlayer?'#00f5ff':u.team==='a'?'#00a8ff':'#ff4400';
      ctx.shadowColor=u.isPlayer?'#00f5ff':'transparent';ctx.shadowBlur=u.isPlayer?6:0;
      ctx.fill();ctx.shadowBlur=0;
    }
    if(playerState){
      const m=toM(playerState.position);
      ctx.strokeStyle='#00f5ff';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(m.x+Math.sin(playerState.yaw)*10,m.y+Math.cos(playerState.yaw)*10);ctx.stroke();
    }
    ctx.strokeStyle='rgba(0,245,255,0.4)';ctx.lineWidth=1;ctx.strokeRect(0,0,sz,sz);
  }
}

// ─────────────────────────────────────────────
// NEXUS STRIKE — MAIN
// ─────────────────────────────────────────────
class NexusStrike {
  constructor() {
    this.state='menu';
    this.renderer=null;this.player=null;this.bots=[];this.bullets=[];this.hud=null;
    this._colliders=[];this._spawnPoints={a:[],b:[]};
    this._loopId=null;this._lastTs=0;this._timerAccum=0;
    this.scoreA=0;this.scoreB=0;this._ffaScores={};
    this.scoreLimit=20;this.scoreLimit=30;
    this.matchDuration=5*60;this.matchTimeLeft=this.matchDuration;
    this.matchActive=false;this.respawnDelay=5;
    this.shotsF=0;this.shotsH=0;
    this.selectedChar='vex';this.selectedMap='neonCity';this.playerTeam='a';
    this.gameMode='tdm'; // 'tdm' | 'koth' | 'ffa'
    // KOTH state
    this._koth={captureRadius:12,capturePos:null,teamATime:0,teamBTime:0,timeToWin:120,capturer:null,captureProgress:0,maxProgress:100};
    this.settings={sensitivity:0.002,fov:90,invertY:false,quality:'medium',botDifficulty:'medium'};
    try{const s=localStorage.getItem('nxs');if(s)Object.assign(this.settings,JSON.parse(s));}catch(_){}
    this.net=new NetManager(this);
    this._buildUI();
    this._menuBg();
  }

  $(id){return document.getElementById(id);}
  on(id,fn){this.$(id)?.addEventListener('click',fn);}

  show(id){
    document.querySelectorAll('.screen').forEach(s=>{
      s.classList.remove('active');
      s.style.display=''; // clear inline, let CSS take over
    });
    const t=this.$(id);if(!t)return;
    t.classList.add('active');
    if(id==='game-screen'){t.style.display='block';}
  }

  _menuBg(){
    const canvas=this.$('menu-canvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');
    const resize=()=>{canvas.width=innerWidth;canvas.height=innerHeight;};
    resize();window.addEventListener('resize',resize);
    const pts=Array.from({length:110},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-0.5)*0.7,vy:(Math.random()-0.5)*0.7,r:Math.random()*1.8+0.4,h:180+Math.random()*60}));
    const draw=()=>{
      if(this.state==='playing')return;
      requestAnimationFrame(draw);
      ctx.fillStyle='rgba(5,8,20,.18)';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(const p of pts){
        p.x+=p.vx;p.y+=p.vy;
        if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;
        if(p.y<0)p.y=canvas.height;if(p.y>canvas.height)p.y=0;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`hsla(${p.h},100%,60%,.7)`;ctx.fill();
      }
      ctx.lineWidth=0.5;
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
        const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
        if(d<90){ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.strokeStyle=`rgba(0,245,255,${0.06*(1-d/90)})`;ctx.stroke();}
      }
    };
    draw();
  }

  // ── UI WIRING ──────────────────────────────────────────────────────────
  _buildUI(){
    this.on('btn-solo',       ()=>this._goChar(true));
    this.on('btn-multiplayer',()=>this._goLobby());
    this.on('btn-settings',   ()=>this.show('settings-screen'));
    this.on('back-from-chars',()=>{this.show('main-menu');this.state='menu';});
    this.on('back-from-lobby',()=>{this.show('main-menu');this.state='menu';});
    this.on('back-from-settings',()=>{
      this._saveSettings();
      if(this.state==='paused'){this.show('game-screen');this._showPause(true);}
      else this.show('main-menu');
    });
    this.on('btn-start-solo',()=>this._startGame(true));

    this.on('char-team-a-btn',()=>{this.playerTeam='a';this.$('char-team-a-btn')?.classList.add('primary');this.$('char-team-b-btn')?.classList.remove('primary');});
    // Game mode buttons
    for(const modeId of ['tdm','koth','ffa']){
      const btn=this.$('mode-'+modeId+'-btn');
      if(btn)btn.addEventListener('click',()=>{
        this.gameMode=modeId;
        ['tdm','koth','ffa'].forEach(m=>{const b=this.$('mode-'+m+'-btn');if(b)b.classList.toggle('primary',m===modeId);});
      });
    }
    this.on('char-team-b-btn',()=>{this.playerTeam='b';this.$('char-team-b-btn')?.classList.add('primary');this.$('char-team-a-btn')?.classList.remove('primary');});
    this.on('btn-create-lobby',async()=>{
      const statusEl=this.$('net-status');
      if(statusEl){statusEl.textContent='Creating lobby...';statusEl.style.display='block';statusEl.style.color='#ffaa00';}
      try{
        await this.net.host();
        this._fillLobbySlots();
      }catch(e){
        const s=this.$('net-status');if(s){s.textContent='Error: '+(e.message||e);s.style.color='#ff4400';}
      }
    });

    this.on('btn-join-lobby',async()=>{
      const input=this.$('lobby-code-input');
      const code=input?.value?.trim();
      if(!code){const s=this.$('net-status');if(s){s.textContent='Enter a lobby code first';s.style.color='#ff4400';s.style.display='block';}return;}
      const s=this.$('net-status');
      if(s){s.textContent=`Connecting to ${code}...`;s.style.color='#ffaa00';s.style.display='block';}
      try{
        await this.net.join(code);
        this.$('lobby-options')?.classList.add('hidden');
        this.$('lobby-room')?.classList.remove('hidden');
        if(s){s.textContent='✓ Joined! Waiting for host...';s.style.color='#00ff88';}
        const myChar=CHARACTERS.find(c=>c.id===this.selectedChar)||CHARACTERS[0];
        this.net.sendCharSelect(myChar.id,myChar.name,this.playerTeam||'b');
        this._fillLobbySlots();
      }catch(e){
        if(s){s.textContent='✗ Could not connect: '+(e.message||'check the code');s.style.color='#ff4400';}
      }
    });

    this.on('copy-code-btn',()=>{
      navigator.clipboard?.writeText(this.$('lobby-code-display')?.textContent).catch(()=>{});
      const btn=this.$('copy-code-btn');if(btn){btn.textContent='COPIED!';setTimeout(()=>btn.textContent='COPY',1500);}
    });

    this.on('btn-start-match',()=>{
      this.net.startMatch(this.selectedMap);
      this._startGame(false);
    });

    this.on('btn-resume',         ()=>this._resume());
    this.on('btn-settings-ingame',()=>{this._showPause(false);this.show('settings-screen');});
    this.on('btn-quit-game',      ()=>this._quit());
    this.on('btn-rematch',        ()=>this._rematch());
    this.on('btn-main-menu-end',  ()=>this._quit());

    document.addEventListener('keydown',e=>{
      if(e.code==='Escape'){
        if(this.state==='playing')this._pause();
        else if(this.state==='paused')this._resume();
        else if(this.state==='shop')this._closeShop();
      }
      if((e.code==='KeyB'||e.code==='Tab')&&(this.state==='playing'||this.state==='shop')){
        e.preventDefault();
        if(this._shopProximity||this._shopOpen){
          if(this._shopOpen)this._closeShop();else this._openShop();
        }
      }
    });

    this.$('pointer-lock-overlay')?.addEventListener('click',()=>{
      if(this.state==='playing')this.$('game-canvas')?.requestPointerLock();
    });
    document.addEventListener('pointerlockchange',()=>{
      const locked=document.pointerLockElement===this.$('game-canvas');
      this.$('pointer-lock-overlay')?.classList.toggle('hidden',locked);
    });

    this._slider('sens-slider','sens-val','',  n=>{this.settings.sensitivity=n*0.00025;if(this.player)this.player.config.sensitivity=n*0.00025;});
    this._slider('fov-slider', 'fov-val', '°', n=>{this.settings.fov=n;if(this.renderer){this.renderer.camera.fov=n;this.renderer.camera.updateProjectionMatrix();}});
    this.$('invert-y')?.addEventListener('change',e=>{this.settings.invertY=e.target.checked;if(this.player)this.player.config.invertY=e.target.checked;});
    this.$('quality-select')?.addEventListener('change',e=>{this.settings.quality=e.target.value;if(this.renderer)this.renderer.setQuality(e.target.value);});

    this._buildCharGrid();
    this._buildMapGrid();

    // Add CSS for damage flash if not present
    if(!document.getElementById('_nxs_extra_css')){
      const st=document.createElement('style');st.id='_nxs_extra_css';
      st.textContent=`
        @keyframes damageFlash{0%{opacity:1}100%{opacity:0}}
        @keyframes abilityPop{0%{opacity:1;transform:translateX(-50%) scale(1)}60%{transform:translateX(-50%) scale(1.15)}100%{opacity:0;transform:translateX(-50%) scale(0.9) translateY(-22px)}}
        @keyframes dmgFloat{0%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(-48px)}}
        @keyframes killNotif{0%{opacity:0;transform:translateX(-50%) scale(0.85)}15%{opacity:1;transform:translateX(-50%) scale(1.05)}85%{opacity:1}100%{opacity:0}}
        .lobby-slot-row{display:flex;align-items:center;gap:10px;padding:7px 12px;margin:4px 0;border-radius:5px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);}
        .lobby-slot-row.human{border-color:rgba(0,245,255,0.35);background:rgba(0,20,40,0.4);}
        .lobby-slot-row.bot{opacity:0.55;}
        .lobby-slot-row.empty{opacity:0.3;border-style:dashed;}
        .lobby-slot-icon{font-size:16px;width:22px;text-align:center;}
        .lobby-slot-name{flex:1;font-family:var(--font-d,monospace);font-size:12px;letter-spacing:.1em;}
        .lobby-slot-role{font-size:10px;opacity:0.55;font-family:var(--font-d,monospace);}
        .lobby-player-count{text-align:center;font-family:var(--font-d,monospace);font-size:12px;color:rgba(0,245,255,0.6);letter-spacing:.15em;margin-bottom:8px;}
      `;
      document.head.appendChild(st);
    }
  }

  _slider(id,valId,suffix,fn){
    this.$(id)?.addEventListener('input',e=>{const n=parseFloat(e.target.value);const v=this.$(valId);if(v)v.textContent=n+suffix;fn(n);});
  }
  _saveSettings(){try{localStorage.setItem('nxs',JSON.stringify(this.settings));}catch(_){}}

  // ── CHARACTER GRID ───────────────────────────────────────────────────────
  _buildCharGrid(){
    const grid=this.$('char-grid');if(!grid)return;
    grid.innerHTML='';

    // Single shared renderer for all 20 thumbnails
    const offCanvas=document.createElement('canvas');offCanvas.width=120;offCanvas.height=150;
    let sharedR=null;
    try{sharedR=new THREE.WebGLRenderer({canvas:offCanvas,alpha:true,antialias:false,preserveDrawingBuffer:true});}
    catch(e){console.warn('Shared char preview renderer failed:',e);}

    for(const ch of CHARACTERS){
      const card=document.createElement('div');card.className='char-card';card.style.setProperty('--char-color',ch.color);
      const img=document.createElement('canvas');img.width=120;img.height=150;img.style.cssText='width:100%;height:70%;display:block;';
      card.appendChild(img);
      card.insertAdjacentHTML('beforeend',`<div class="char-card-info"><div class="char-card-name">${ch.name}</div><div class="char-card-role">${ch.role}</div></div>`);
      card.addEventListener('click',()=>{
        grid.querySelectorAll('.char-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');this.selectedChar=ch.id;this._showCharInfo(ch);
      });
      grid.appendChild(card);

      // Render static thumbnail into a regular canvas
      if(sharedR){
        try{
          sharedR.setSize(120,150,false);sharedR.setClearColor(0,0);
          const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(42,120/150,0.1,50);
          cam.position.set(0,1.15,2.8);cam.lookAt(0,0.95,0);
          sc.add(new THREE.AmbientLight(0x404070,1.0));
          const kl=new THREE.PointLight(new THREE.Color(ch.color),3,10);kl.position.set(1.5,2.5,2.5);sc.add(kl);
          const fill=new THREE.PointLight(0x222244,1.5,8);fill.position.set(-1,1,-1);sc.add(fill);
          const mesh=buildCharMesh(ch.id,ch,true);sc.add(mesh);
          // Render 3 frames at different angles and pick best
          for(let f=0;f<3;f++){mesh.rotation.y=f*0.4;sharedR.render(sc,cam);}
          // Copy to the card canvas
          const ctx=img.getContext('2d');ctx.clearRect(0,0,120,150);ctx.drawImage(offCanvas,0,0);
          // Start live spin animation using the card canvas with a 2D approach
          this._animCharCard(img,ch,mesh.rotation.y);
        }catch(e){this._drawFallbackPortrait(img,ch);}
      } else {
        this._drawFallbackPortrait(img,ch);
      }
    }
    grid.firstElementChild?.click();
  }

  _animCharCard(canvas,ch,startAngle){
    // Lightweight spin: just redraw the static portrait with a subtle color cycle
    // Full 3D spin on hover only to save GPU
    canvas.addEventListener('mouseenter',()=>{
      if(canvas._spinRaf)return;
      let ang=startAngle;
      const spin=()=>{
        if(!canvas._hovered){canvas._spinRaf=null;return;}
        ang+=0.04;
        this._drawFallbackPortrait(canvas,ch,ang);
        canvas._spinRaf=requestAnimationFrame(spin);
      };
      canvas._hovered=true;canvas._spinRaf=requestAnimationFrame(spin);
    });
    canvas.addEventListener('mouseleave',()=>{canvas._hovered=false;});
  }

  _drawFallbackPortrait(canvas,ch,angle=0.3){
    // Draw a stylized 2D character portrait using canvas 2D API
    const ctx=canvas.getContext('2d');
    const w=canvas.width,h=canvas.height;
    const col=ch.color||'#00f5ff';
    const r=parseInt(col.slice(1,3)||'00',16),g=parseInt(col.slice(3,5)||'f5',16),b=parseInt(col.slice(5,7)||'ff',16);
    // Background
    const bg=ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,`rgba(${r},${g},${b},0.18)`);bg.addColorStop(1,'rgba(5,8,20,0.95)');
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    // Silhouette
    const cx=w/2,bodyY=h*0.55;
    // Head
    ctx.fillStyle=`rgba(${r},${g},${b},0.85)`;
    ctx.beginPath();ctx.ellipse(cx,h*0.28,14,17,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=`rgba(${r},${g},${b},1)`;ctx.lineWidth=1.5;ctx.stroke();
    // Visor
    ctx.fillStyle=`rgba(${Math.min(r+60,255)},${Math.min(g+60,255)},${Math.min(b+60,255)},0.9)`;
    ctx.beginPath();ctx.ellipse(cx,h*0.265,9,5,0,0,Math.PI*2);ctx.fill();
    // Body
    const bw=22+Math.min(ch.maxHealth/12,14);
    ctx.fillStyle=`rgba(${r},${g},${b},0.7)`;
    ctx.fillRect(cx-bw/2,h*0.38,bw,h*0.3);
    ctx.strokeStyle=`rgba(${r},${g},${b},0.9)`;ctx.lineWidth=1;ctx.stroke();
    // Accent stripe
    ctx.fillStyle=`rgba(${Math.min(r+80,255)},${Math.min(g+80,255)},${Math.min(b+80,255)},0.8)`;
    ctx.fillRect(cx-bw/2,h*0.44,bw,3);
    // Arms
    ctx.strokeStyle=`rgba(${r},${g},${b},0.65)`;ctx.lineWidth=7;
    ctx.beginPath();ctx.moveTo(cx-bw/2,h*0.42);ctx.lineTo(cx-bw/2-10,h*0.58);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+bw/2,h*0.42);ctx.lineTo(cx+bw/2+10,h*0.58);ctx.stroke();
    // Legs
    ctx.lineWidth=9;ctx.strokeStyle=`rgba(${r},${g},${b},0.75)`;
    ctx.beginPath();ctx.moveTo(cx-8,h*0.68);ctx.lineTo(cx-10,h*0.9);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+8,h*0.68);ctx.lineTo(cx+10,h*0.9);ctx.stroke();
    // Name initial glow
    ctx.fillStyle=`rgba(${r},${g},${b},0.55)`;
    ctx.font=`bold 28px Orbitron,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(ch.name[0],cx,h*0.54);
    // Scanlines overlay
    ctx.fillStyle='rgba(0,0,0,0.06)';
    for(let y=0;y<h;y+=3)ctx.fillRect(0,y,w,1);
    // Glow border
    const grad=ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,`rgba(${r},${g},${b},0.5)`);grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.strokeStyle=grad;ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);
  }

  _showCharInfo(ch){
    const el=this.$('char-info');if(!el)return;
    const wId=ch.weapon||'assaultRifle';
    const wStats=WEAPON_STATS[wId]||WEAPON_STATS.assaultRifle;
    const wType=wStats.type==='melee'?'⚔ MELEE':'🔫 '+wStats.name;
    el.innerHTML=`<h3 style="color:${ch.color}">${ch.name}</h3>
      <div style="color:${ch.color};opacity:.7;font-family:var(--font-d);font-size:11px;letter-spacing:.3em;margin-bottom:6px">${ch.role}</div>
      <div style="color:#aaa;font-size:11px;margin-bottom:8px;font-family:var(--font-d);letter-spacing:.1em">${wType}</div>
      <p class="char-lore">${ch.lore}</p>
      <div class="ability-list">${Object.entries(ch.abilities).map(([k,ab])=>`<div class="ability-item"><span class="ability-key-badge">${k.toUpperCase()}</span><div><div class="ability-name">${ab.icon} ${ab.name} <span style="opacity:.4;font-size:10px">${ab.cooldown}s CD</span></div><div class="ability-desc">${ab.desc}</div></div></div>`).join('')}</div>`;
  }

  // ── MAP GRID ──────────────────────────────────────────────────────────────
  _buildMapGrid(){
    const grid=this.$('map-grid');if(!grid)return;
    grid.innerHTML='';
    for(const m of MAP_CONFIGS){
      const card=document.createElement('div');card.className='map-card';card.style.setProperty('--map-color',m.color);
      const cv=document.createElement('canvas');cv.width=160;cv.height=90;cv.className='map-card-canvas';
      card.appendChild(cv);this._drawMapPreview(cv,m);
      card.insertAdjacentHTML('beforeend',`<div class="map-card-overlay"><div class="map-card-name" style="color:${m.color}">${m.name}</div><div class="map-card-mode">TDM · 4V4</div></div>`);
      card.addEventListener('click',()=>{
        grid.querySelectorAll('.map-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');this.selectedMap=m.id;
      });
      grid.appendChild(card);
    }
    grid.firstElementChild?.click();
  }

  _drawMapPreview(canvas,map){
    const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;const c=map.color;
    const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16);
    ctx.fillStyle='#04080f';ctx.fillRect(0,0,w,h);
    const sky=ctx.createLinearGradient(0,0,0,h*0.6);sky.addColorStop(0,`rgba(${r},${g},${b},0.2)`);sky.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h*0.6);
    ctx.fillStyle=`rgba(${r},${g},${b},0.13)`;
    if(map.id==='neonCity'){const blds=[[8,55,16,35],[26,48,14,42],[42,40,20,50],[64,50,16,40],[82,42,22,48],[108,54,14,36],[124,44,18,46],[144,50,14,40]];blds.forEach(([x,y,bw,bh])=>ctx.fillRect(x,h-bh,bw,bh));ctx.fillStyle=`rgba(${r},${g},${b},0.65)`;blds.forEach(([x,y,bw,bh])=>{for(let row=4;row<bh-6;row+=9)for(let col=3;col<bw-3;col+=6)if((row+col)%11>3)ctx.fillRect(x+col,h-bh+row,2,3);});ctx.strokeStyle=`rgba(${r},${g},${b},0.4)`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h-18);ctx.lineTo(w,h-18);ctx.stroke();}
    else if(map.id==='jungle'||map.id==='neonJungle'){for(let i=0;i<14;i++){const tx=i*(w/12),tr=14+Math.sin(i*1.7)*7;ctx.beginPath();ctx.arc(tx,h-16+Math.cos(i*0.8)*5,tr,Math.PI,0);ctx.fill();}ctx.fillRect(0,h-12,w,12);ctx.fillStyle=`rgba(${r},${g},${b},0.35)`;for(let i=0;i<10;i++)ctx.fillRect(i*17+2,h-6,6,6);}
    else if(map.id==='desertRuins'||map.id==='cyberDesert'){ctx.beginPath();ctx.moveTo(0,h);ctx.quadraticCurveTo(w*0.2,h-26,w*0.4,h-16);ctx.quadraticCurveTo(w*0.65,h-6,w*0.8,h-20);ctx.quadraticCurveTo(w*0.92,h-30,w,h-14);ctx.lineTo(w,h);ctx.closePath();ctx.fill();ctx.fillStyle=`rgba(${r},${g},${b},0.3)`;[[18,h-52,10,52],[55,h-38,12,38],[104,h-56,10,56],[140,h-36,10,36]].forEach(([x,y,rw,rh])=>ctx.fillRect(x,y,rw,rh));}
    else if(map.id==='factory'){ctx.fillRect(0,h-28,w,28);ctx.fillStyle=`rgba(${r},${g},${b},0.3)`;[[12,h-68,38,40],[62,h-58,48,30],[120,h-72,34,44]].forEach(([x,y,fw,fh])=>ctx.fillRect(x,y,fw,fh));}
    else{[[8,h-60,42,8],[62,h-40,50,8],[118,h-64,40,8],[14,h-28,28,8],[88,h-18,36,8]].forEach(([x,y,pw,ph])=>{const pg=ctx.createLinearGradient(x,y,x,y+ph);pg.addColorStop(0,`rgba(${r},${g},${b},0.55)`);pg.addColorStop(1,`rgba(${r},${g},${b},0.1)`);ctx.fillStyle=pg;ctx.fillRect(x,y,pw,ph);ctx.fillStyle=`rgba(${r},${g},${b},0.25)`;ctx.fillRect(x,y+ph,pw,3);});}
    ctx.fillStyle=`rgba(${r},${g},${b},0.25)`;ctx.fillRect(0,h-4,w,4);
    const vig=ctx.createRadialGradient(w/2,h/2,w*0.15,w/2,h/2,w*0.8);vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(0,0,0,0.6)');ctx.fillStyle=vig;ctx.fillRect(0,0,w,h);
  }

  // ── LOBBY — 8 PLAYER SLOTS ────────────────────────────────────────────────
  _fillLobbySlots(){ this._updateLobbyDisplay(); }

  _updateLobbyDisplay(){
    const sa=this.$('team-a-slots'),sb=this.$('team-b-slots');
    if(!sa||!sb)return;

    const playerTeam=this.playerTeam||'a';
    const myChar=CHARACTERS.find(c=>c.id===this.selectedChar)||CHARACTERS[0];

    // Gather all human slots from NetManager
    const slots=this.net.getLobbySlots();
    const humanSlots=Object.values(slots);

    // Build slot HTML
    const mkHuman=(ch,label,isMe)=>`
      <div class="lobby-slot-row human">
        <span class="lobby-slot-icon" style="color:${ch?.color||'#00f5ff'}">${isMe?'▶':'◈'}</span>
        <span class="lobby-slot-name" style="color:${ch?.color||'#fff'}">${ch?.name||label}${isMe?' (YOU)':''}</span>
        <span class="lobby-slot-role">${ch?.role||''}</span>
      </div>`;
    const mkBot=(n)=>`
      <div class="lobby-slot-row bot">
        <span class="lobby-slot-icon">🤖</span>
        <span class="lobby-slot-name">${n}</span>
        <span class="lobby-slot-role">BOT</span>
      </div>`;
    const mkEmpty=()=>`
      <div class="lobby-slot-row empty">
        <span class="lobby-slot-icon">○</span>
        <span class="lobby-slot-name" style="opacity:.35">WAITING FOR PLAYER...</span>
      </div>`;

    // Split humans by team
    const teamA=humanSlots.filter(s=>s.team==='a');
    const teamB=humanSlots.filter(s=>s.team==='b');
    const totalHumans=humanSlots.length;
    const remaining=Math.max(0,8-totalHumans);

    // Count display
    const countEl=this.$('lobby-player-count')||this._ensureLobbyCount();
    if(countEl)countEl.textContent=`${totalHumans}/8 PLAYERS · ${remaining} BOT${remaining!==1?'S':''} WILL FILL`;

    // Team A slots (4 total)
    let aHTML='';
    for(let i=0;i<4;i++){
      const slot=teamA[i];
      if(slot){
        const ch=CHARACTERS.find(c=>c.id===slot.charId);
        const isMe=slot.isHost&&this.net.isHost||slot.peerId===this.net.myPeerId;
        aHTML+=mkHuman(ch,slot.name||'PLAYER',isMe);
      } else if(i<teamA.length+Math.ceil(remaining/2)){
        aHTML+=mkBot(`BOT ${i+1}`);
      } else {
        aHTML+=mkEmpty();
      }
    }

    // Team B slots (4 total)
    let bHTML='';
    for(let i=0;i<4;i++){
      const slot=teamB[i];
      if(slot){
        const ch=CHARACTERS.find(c=>c.id===slot.charId);
        const isMe=slot.peerId===this.net.myPeerId;
        bHTML+=mkHuman(ch,slot.name||'PLAYER',isMe);
      } else if(i<teamB.length+Math.floor(remaining/2)){
        bHTML+=mkBot(`BOT ${i+5}`);
      } else {
        bHTML+=mkEmpty();
      }
    }

    sa.innerHTML=aHTML;
    sb.innerHTML=bHTML;

    // Show start button only for host
    const startBtn=this.$('btn-start-match');
    if(startBtn)startBtn.classList.toggle('hidden',!this.net.isHost);

    // Team switch button
    let sw=this.$('team-switch-btn');
    if(sw){
      sw.textContent=`⇄ SWITCH TO TEAM ${playerTeam==='a'?'B':'A'}`;
      sw.onclick=()=>{
        this.playerTeam=this.playerTeam==='a'?'b':'a';
        if(this.net?.isConnected)this.net.sendCharSelect(this.selectedChar,(CHARACTERS.find(c=>c.id===this.selectedChar)||CHARACTERS[0]).name,this.playerTeam);
        this._updateLobbyDisplay();
      };
    }
  }

  _ensureLobbyCount(){
    let el=this.$('lobby-player-count');
    if(!el){
      el=document.createElement('div');el.id='lobby-player-count';el.className='lobby-player-count';
      const room=this.$('lobby-room');
      if(room){const teams=room.querySelector('.lobby-teams');if(teams)room.insertBefore(el,teams);}
    }
    return el;
  }

  // ── LOBBY CHARACTER SELECT ────────────────────────────────────────────────
  _goChar(solo){this.isSolo=solo;this.state='charselect';this.show('char-select-screen');}
  _goLobby(){
    this.state='lobby';this.show('lobby-screen');
    this.$('lobby-options')?.classList.remove('hidden');
    this.$('lobby-room')?.classList.add('hidden');
    this._buildLobbyCharGrid();
  }

  _buildLobbyCharGrid(){
    const grid=this.$('lobby-char-grid');if(!grid)return;
    grid.innerHTML='';
    for(const ch of CHARACTERS){
      const chip=document.createElement('div');chip.className='lobby-char-chip';chip.style.setProperty('--char-color',ch.color);chip.style.borderColor=ch.color+'55';
      const cv=document.createElement('canvas');cv.width=42;cv.height=52;chip.appendChild(cv);
      const nameEl=document.createElement('div');nameEl.className='lobby-char-chip-name';nameEl.style.color=ch.color;nameEl.textContent=ch.name;chip.appendChild(nameEl);
      chip.addEventListener('click',()=>{
        grid.querySelectorAll('.lobby-char-chip').forEach(c=>c.classList.remove('selected'));
        chip.classList.add('selected');chip.style.borderColor=ch.color;this.selectedChar=ch.id;
        const chosen=this.$('lobby-char-chosen');
        if(chosen){chosen.textContent=ch.name+' — '+ch.role;chosen.style.color=ch.color;}
        if(this.net?.isConnected)this.net.sendCharSelect(ch.id,ch.name,this.playerTeam||'a');
        this._updateLobbyDisplay();
      });
      grid.appendChild(chip);
      // Use 2D canvas portrait (no new WebGL context)
      this._drawFallbackPortrait(cv,ch);
    }
    grid.firstElementChild?.click();
  }

  // ── START GAME ────────────────────────────────────────────────────────────
  _startGame(solo){
    this.isSolo=solo;this.state='loading';
    // Show game-screen FIRST so canvas has dimensions before Renderer is created
    document.querySelectorAll('.screen').forEach(s=>{s.classList.remove('active');s.style.display='none';});
    const gs=this.$('game-screen');
    if(gs){gs.style.display='block';gs.classList.add('active');}
    if(!this.renderer)this.renderer=new Renderer(this.$('game-canvas'));
    // Force renderer to correct size after canvas is visible
    if(this.renderer){this.renderer.renderer.setSize(window.innerWidth,window.innerHeight);this.renderer.camera.aspect=window.innerWidth/window.innerHeight;this.renderer.camera.updateProjectionMatrix();}
    const ls=this.$('loading-screen');
    if(ls){ls.classList.remove('hidden');ls.classList.add('active');ls.style.cssText='display:flex !important;position:fixed;inset:0;z-index:1000;background:var(--dark-bg,#04080f);flex-direction:column;align-items:center;justify-content:center;';}
    this._setupLoadingScreen();
    this._loadAnim(()=>this._init());
  }

  _animLoadingBg(){
    const canvas=this.$('loading-bg-canvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');
    canvas.width=window.innerWidth;canvas.height=window.innerHeight;
    const pts=Array.from({length:80},()=>({x:Math.random()*canvas.width,y:Math.random()*canvas.height,vx:(Math.random()-0.5)*0.4,vy:(Math.random()-0.5)*0.4,r:Math.random()*1.5+0.3,h:180+Math.random()*60}));
    const draw=()=>{
      if(this.state!=='loading')return;
      requestAnimationFrame(draw);
      ctx.fillStyle='rgba(4,8,15,0.15)';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(const p of pts){
        p.x+=p.vx;p.y+=p.vy;
        if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;
        if(p.y<0)p.y=canvas.height;if(p.y>canvas.height)p.y=0;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle='hsla('+p.h+',100%,60%,.6)';ctx.fill();
      }
      ctx.lineWidth=0.4;
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
        const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
        if(d<70){ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.strokeStyle='rgba(0,245,255,'+(0.05*(1-d/70))+')';ctx.stroke();}
      }
    };draw();
  }

  _setupLoadingScreen(){
    const ch=CHARACTERS.find(c=>c.id===this.selectedChar)||CHARACTERS[0];
    const map=MAP_CONFIGS.find(m=>m.id===this.selectedMap)||MAP_CONFIGS[0];
    const an=this.$('loading-agent-name');if(an){an.textContent=ch.name;an.style.color=ch.color;}
    const ar=this.$('loading-agent-role');if(ar){ar.textContent=ch.role;ar.style.color=ch.color;ar.style.opacity='0.7';}
    const mn=this.$('loading-map-name');if(mn){mn.textContent='◈ '+map.name;mn.style.color=map.color;}
    const glow=this.$('loading-char-glow');if(glow)glow.style.background=`radial-gradient(ellipse at center,${ch.color}44 0%,transparent 70%)`;
    // Mode badge
    const mb=this.$('loading-mode-badge');if(mb){if(this.gameMode==='koth')mb.textContent='KOTH';else if(this.gameMode==='ffa')mb.textContent='FFA';else mb.textContent='TDM';}
    this._animLoadingBg();
    const cv=this.$('loading-char-canvas');
    if(cv){
      if(this._loadingRenderer){try{this._loadingRenderer.dispose();}catch(_){}this._loadingRenderer=null;}
      try{
        const r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false});r.setSize(200,260);r.setClearColor(0,0);this._loadingRenderer=r;
        const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(40,200/260,0.1,50);cam.position.set(0,1.1,3);cam.lookAt(0,0.9,0);
        sc.add(new THREE.AmbientLight(0x404070,1.2));const kl=new THREE.PointLight(new THREE.Color(ch.color),4,12);kl.position.set(2,3,3);sc.add(kl);
        const mesh=buildCharMesh(ch.id,ch,false);sc.add(mesh);let ang=0,prevT=performance.now();
        const tick=()=>{if(!this._loadingRenderer)return;requestAnimationFrame(tick);const now=performance.now(),dt=now-prevT;prevT=now;ang+=0.012;mesh.rotation.y=ang;animateCharMesh(mesh,5,'patrol',dt,0,0);r.render(sc,cam);};tick();
      }catch(e){
        // Fallback: draw 2D portrait on loading canvas
        const ctx=cv.getContext('2d');
        if(ctx&&this._drawFallbackPortrait){
          cv.width=200;cv.height=260;
          this._drawFallbackPortrait(cv,ch);
        }
      }
    }
    this._populateLoadingTeams(ch,map);
  }

  _populateLoadingTeams(myChar,map){
    const playerTeam=this.playerTeam||'a';
    const ids=CHARACTERS.map(c=>c.id).filter(id=>id!==myChar.id);let ci=0;
    const pick=()=>CHARACTERS.find(c=>c.id===ids[ci++%ids.length]);
    const mkSlot=(ch,isMe)=>{const d=document.createElement('div');d.className='ltp-slot'+(isMe?' ltp-me':'');d.style.borderColor=ch.color+'88';d.innerHTML=`<span style="color:${ch.color};font-size:11px;font-family:var(--font-d,monospace);letter-spacing:.1em">${ch.name}</span><div class="ltp-role" style="color:${ch.color};opacity:.6">${ch.role}</div>`;return d;};
    const mkBot=()=>{const ch=pick();const d=document.createElement('div');d.className='ltp-slot ltp-bot';d.innerHTML=`<span style="color:#666;font-size:11px;font-family:var(--font-d,monospace)">🤖 ${ch?.name||'BOT'}</span><div class="ltp-role" style="color:#444">${ch?.role||''}</div>`;return d;};
    const sa=this.$('ltp-a-slots'),sb=this.$('ltp-b-slots');
    if(sa){sa.innerHTML='';sa.appendChild(playerTeam==='a'?mkSlot(myChar,true):mkBot());for(let i=0;i<3;i++)sa.appendChild(mkBot());}
    if(sb){sb.innerHTML='';sb.appendChild(playerTeam==='b'?mkSlot(myChar,true):mkBot());for(let i=0;i<3;i++)sb.appendChild(mkBot());}
  }

  _loadAnim(onDone){
    const bar=this.$('loading-bar'),barGlow=this.$('loading-bar-glow');
    const text=this.$('loading-text'),pct=this.$('loading-pct');
    const tips=this.$('loading-tips');
    const steps=['INITIALIZING NEXUS…','LOADING MAP GEOMETRY…','SPAWNING AGENTS…','CALIBRATING WEAPONS…','DEPLOYING BOT AI…','READY TO DEPLOY'];
    const tipList=[
      'TIP: Headshots deal 1.5× damage','TIP: Press [E] [Q] [F] to activate abilities',
      'TIP: Bots react to damage — hit them to change their behavior!',
      'TIP: Melee weapons have unlimited ammo but require close range',
      'TIP: Parkour to reach high ground — jump on any ledge or roof',
      'TIP: Use the weapon shop [B] to swap weapons mid-match',
      'TIP: Bots will flee when injured and hunt you when healthy',
      'TIP: Strafe and jump to make yourself harder to hit',
    ];
    let step=0,p=0;
    if(bar)bar.style.width='0%';
    const iv=setInterval(()=>{
      if(p>=100){clearInterval(iv);if(bar)bar.style.width='100%';setTimeout(onDone,300);return;}
      p=Math.min(100,p+100/steps.length);
      if(bar)bar.style.width=p+'%';
      if(barGlow)barGlow.style.left=Math.max(0,p-3)+'%';
      if(pct)pct.textContent=Math.floor(p)+'%';
      if(text)text.textContent=steps[Math.min(step,steps.length-1)];
      if(tips)tips.textContent=tipList[step%tipList.length];
      step++;
    },230);
  }

  // ── INIT ───────────────────────────────────────────────────────────────────
  _init(){
    if(this._loadingRenderer){try{this._loadingRenderer.dispose();}catch(_){}this._loadingRenderer=null;}
    const ls=this.$('loading-screen');
    if(ls){ls.style.cssText='display:none !important';ls.classList.add('hidden');ls.classList.remove('active');}

    this.renderer.clearScene();
    this.renderer.setQuality(this.settings.quality);
    this.renderer.camera.fov=this.settings.fov;
    // Force correct canvas size
    this.renderer.renderer.setSize(window.innerWidth,window.innerHeight,true);
    this.renderer.camera.aspect=window.innerWidth/window.innerHeight;
    this.renderer.camera.updateProjectionMatrix();

    this.hud=new HUD();
    const mb=new MapBuilder(this.renderer.scene);
    const{colliders,spawnPoints,shopPositions}=mb.build(this.selectedMap);
    this._colliders=colliders;this._spawnPoints=spawnPoints;this._shopPositions=shopPositions||[];
    this._shopOpen=false;this._shopProximity=false;

    const playerTeam=this.playerTeam||'a';
    const sp=((playerTeam==='b'?spawnPoints.b:spawnPoints.a)[0]||new THREE.Vector3(0,2,0)).clone();

    if(this.player)this.player.destroy();
    this.player=new PlayerController(this.renderer.camera,this.renderer.scene,this.selectedChar,
      {sensitivity:this.settings.sensitivity,fov:this.settings.fov,invertY:this.settings.invertY});
    this.player.position.copy(sp);
    this.player.team=playerTeam;
    this.player.weaponSystem._ownerTeam=playerTeam;

    const ch=CHARACTERS.find(c=>c.id===this.selectedChar);
    if(ch){
      const badge=this.$('hud-player-badge');if(badge){badge.style.borderColor=ch.color;badge.style.borderLeftColor=ch.color;}
      const sl=this.$('ability-f-slot');if(sl)sl.style.borderColor=ch.color+'88';
    }

    this.bots=[];this._spawnBots(spawnPoints);
    if(this.gameMode==='koth'){
      this._koth.teamATime=0;this._koth.teamBTime=0;this._koth.capturer=null;
      // Remove old KOTH visual if it exists
      if(this._koth._zoneMesh){this.renderer.scene.remove(this._koth._zoneMesh);this._koth._zoneMesh=null;}
      if(this._koth._decal){this.renderer.scene.remove(this._koth._decal);this._koth._decal=null;}
      if(this._koth._zoneLight){this.renderer.scene.remove(this._koth._zoneLight);this._koth._zoneLight=null;}
      this._initKothZone();
    }
    this.scoreA=0;this.scoreB=0;
    this.matchTimeLeft=this.matchDuration;this._timerAccum=0;
    this.matchActive=true;this.bullets=[];this.shotsF=0;this.shotsH=0;
    // Update HUD mode label
    const modeLabel=document.getElementById('match-mode-label');
    if(modeLabel){
      if(this.gameMode==='koth') modeLabel.textContent='KOTH · HOLD ZONE TO WIN';
      else if(this.gameMode==='ffa') modeLabel.textContent='FFA · FIRST TO '+(this.scoreLimit||20)+' KILLS';
      else modeLabel.textContent='TDM · FIRST TO '+this.scoreLimit+' KILLS';
    }
    // Reset FFA scores on new match
    this._ffaScores={};
    this._lastTs=performance.now();
    this.state='playing';
    this.$('match-end')?.classList.add('hidden');
    this.$('esc-menu')?.classList.add('hidden');
    this.$('elim-banner')?.classList.add('hidden');
    this.$('pointer-lock-overlay')?.classList.remove('hidden');
    this._buildShopUI();
    setTimeout(()=>this.$('game-canvas')?.requestPointerLock(),600);
    cancelAnimationFrame(this._loopId);
    this._loopId=requestAnimationFrame(ts=>this._loop(ts));
  }

  // ── BOT SPAWNING — fills all 7 empty slots ────────────────────────────────
  _spawnBots(sp){
    const ids=CHARACTERS.map(c=>c.id).filter(id=>id!==this.selectedChar);let ci=0;
    const pick=()=>ids[ci++%ids.length];
    const sA=sp.a||[],sB=sp.b||[];
    const playerTeam=this.playerTeam||'a';
    const allyTeam=playerTeam,enemyTeam=playerTeam==='a'?'b':'a';
    const isFFA=this.gameMode==='ffa';
    // Combine all spawn points for FFA
    const allSp=[...sA,...sB];
    const allySp=isFFA?allSp:(playerTeam==='a'?sA:sB);
    const enemySp=isFFA?allSp:(playerTeam==='a'?sB:sA);
    const groundY=this._colliders.filter(c=>c.isGround).reduce((m,c)=>Math.max(m,c.y||0),0);
    const diff=this.settings.botDifficulty||'medium';

    const spawnBot=(charId,team,spawnPt,patrolPts)=>{
      const p=spawnPt.clone(); p.y=groundY+0.9;
      const b=new BotAI(this.renderer.scene,charId,team,p,diff);
      b.setGroundY(groundY);
      b.setColliders(this._colliders);
      b.setPatrolPoints(patrolPts.length>=2?patrolPts:[p,p.clone().add(new THREE.Vector3(10,0,10))]);
      this.bots.push(b);
      return b;
    };

    if(isFFA){
      // FFA: 7 bots all on unique teams so they fight everyone
      for(let i=0;i<7;i++){
        const pt=allSp[i%allSp.length]||new THREE.Vector3((i-3)*12,groundY+0.9,(i%2)*12);
        spawnBot(pick(),'ffa_'+i,pt,allSp);
      }
    } else {
      // TDM / KOTH: 3 allies + 4 enemies
      for(let i=0;i<3;i++){
        const pt=allySp[i+1]||allySp[0]||new THREE.Vector3(-8,groundY+0.9,-8);
        spawnBot(pick(),allyTeam,pt,allySp);
      }
      for(let i=0;i<4;i++){
        const pt=enemySp[i]||enemySp[0]||new THREE.Vector3(8,groundY+0.9,8);
        spawnBot(pick(),enemyTeam,pt,enemySp);
      }
    }
  }

  // ── SHOP UI ───────────────────────────────────────────────────────────────
  _buildShopUI(){
    let shopEl=this.$('shop-overlay');
    if(!shopEl){
      shopEl=document.createElement('div');shopEl.id='shop-overlay';
      shopEl.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(5,10,25,0.97);border:2px solid #00f5ff;border-radius:8px;padding:24px 32px;z-index:9999;display:none;min-width:560px;font-family:Orbitron,monospace;max-height:80vh;overflow-y:auto;';
      this.$('game-screen')?.appendChild(shopEl);
    }
    const weapons=Object.entries(WEAPON_STATS);
    shopEl.innerHTML=`
      <div style="text-align:center;color:#00f5ff;font-size:18px;letter-spacing:.3em;margin-bottom:4px">⚙ WEAPON SHOP</div>
      <div style="text-align:center;color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:.2em;margin-bottom:18px">PRESS [B] OR [TAB] TO CLOSE</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        ${weapons.map(([id,w])=>`
          <div class="shop-item" data-wid="${id}" style="background:rgba(0,245,255,0.06);border:1px solid rgba(0,245,255,0.25);border-radius:6px;padding:10px;cursor:pointer;transition:all .15s;" onmouseover="this.style.background='rgba(0,245,255,0.14)';this.style.borderColor='#00f5ff'" onmouseout="this.style.background='rgba(0,245,255,0.06)';this.style.borderColor='rgba(0,245,255,0.25)'">
            <div style="color:#00f5ff;font-size:11px;letter-spacing:.15em;margin-bottom:5px">${w.type==='melee'?'⚔ ':'🔫 '}${w.name}</div>
            <div style="color:rgba(255,255,255,0.6);font-size:10px;line-height:1.7">
              DMG: <span style="color:#fff">${w.damage}${w.pellets>1?`×${w.pellets}`:''}</span><br>
              ${w.type==='melee'?'RNG: <span style="color:#fff">'+w.range.toFixed(1)+'m MELEE</span>':'RPM: <span style="color:#fff">'+w.fireRate+'</span><br>MAG: <span style="color:#fff">'+w.magSize+'</span>'}
            </div>
            <div style="margin-top:8px;text-align:center;color:#ffdd00;font-size:10px;letter-spacing:.2em">[CLICK TO EQUIP]</div>
          </div>
        `).join('')}
      </div>
    `;
    shopEl.querySelectorAll('.shop-item').forEach(el=>{
      el.addEventListener('click',()=>{
        const wid=el.dataset.wid;
        if(this.player){
          this.player.weaponSystem.equip(wid);
          this.player.weaponSystem._ownerTeam=this.player.team||'a';
          this.player._setupViewmodel();
          el.style.background='rgba(0,255,100,0.25)';el.style.borderColor='#00ff88';
          setTimeout(()=>{el.style.background='rgba(0,245,255,0.06)';el.style.borderColor='rgba(0,245,255,0.25)';},300);
        }
      });
    });
  }

  _openShop(){if(this._shopOpen)return;this._shopOpen=true;const el=this.$('shop-overlay');if(el)el.style.display='block';document.exitPointerLock();this.state='shop';}
  _closeShop(){if(!this._shopOpen)return;this._shopOpen=false;const el=this.$('shop-overlay');if(el)el.style.display='none';this.state='playing';setTimeout(()=>this.$('game-canvas')?.requestPointerLock(),100);}
  _checkShopProximity(){
    if(!this.player||!this._shopPositions?.length)return;
    const p=this.player.position;let near=false;
    for(const s of this._shopPositions){const dx=p.x-s.x,dz=p.z-s.z;if(Math.sqrt(dx*dx+dz*dz)<4.5){near=true;break;}}
    if(near!==this._shopProximity){
      this._shopProximity=near;
      let hint=this.$('shop-hint');
      if(!hint){hint=document.createElement('div');hint.id='shop-hint';hint.style.cssText='position:fixed;bottom:180px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);border:1px solid #00f5ff;padding:8px 20px;border-radius:4px;font-family:Orbitron,monospace;font-size:12px;color:#00f5ff;letter-spacing:.2em;pointer-events:none;z-index:200;display:none;';this.$('game-screen')?.appendChild(hint);}
      hint.style.display=near?'block':'none';
      if(near)hint.textContent='⚙ PRESS [B] TO OPEN WEAPON SHOP';
    }
  }

  // ── GAME LOOP ──────────────────────────────────────────────────────────────
  _loop(ts){
    if(this.state!=='playing'&&this.state!=='shop')return;
    const delta=Math.min(ts-this._lastTs,50);this._lastTs=ts;

    if(this.state==='playing'&&this.player?.isAlive){
      const res=this.player.update(delta,this._colliders);
      if(res?.shot){
        if(!res.bullets[0]?.isMelee)this.shotsF+=res.bullets.length;
        res.bullets.forEach(b=>this.bullets.push(b));
        if(!this._newBulletsThisFrame)this._newBulletsThisFrame=[];
        this._newBulletsThisFrame.push(...res.bullets.filter(b=>!b.isMelee));
      }
    }

    this._checkShopProximity();

    // Bot updates — bots fight each other + player
    for(const bot of this.bots){
      if(!bot.isAlive)continue;
      // All enemies = everyone on the opposite team (player + bots)
      const enemies=[];
      if(this.player?.isAlive && this.player.team!==bot.team) enemies.push(this.player);
      for(const b2 of this.bots){ if(b2.isAlive && b2.team!==bot.team) enemies.push(b2); }
      // Pass allies for scatter behavior
      const allies=this.bots.filter(b2=>b2!==bot&&b2.isAlive&&b2.team===bot.team);
      bot._allyPositions = allies.map(a=>a.position);
      bot._squadAllyNear = allies.some(a=>a.position.distanceTo(bot.position)<18);
      // KOTH: give bots the zone position so they patrol toward it
      if(this.gameMode==='koth' && this._koth?.capturePos){
        bot._kothZonePos = this._koth.capturePos;
      } else {
        bot._kothZonePos = null;
      }
      // FFA: all living characters are enemies in free-for-all
      let foes = enemies;
      if(this.gameMode==='ffa'){
        foes=[];
        if(this.player?.isAlive && this.player.id!==bot.id) foes.push(this.player);
        for(const b2 of this.bots){ if(b2.isAlive && b2.id!==bot.id) foes.push(b2); }
      }
      const newBullets=bot.update(delta,foes);
      if(newBullets) for(const b of newBullets) this.bullets.push(b);
    }

    this._tickBullets(delta);
    this._tickParticles();

    // Animate shop rings in the main loop (no separate rAF per ring)
    if (MapBuilder._shopRings?.length) {
      const dt2 = delta / 1000;
      for (const r of MapBuilder._shopRings) r.rotation.z += dt2 * 1.2;
    }

    if(this.matchActive){
      this._timerAccum+=delta;
      if(this._timerAccum>=1000){this._timerAccum-=1000;this.matchTimeLeft=Math.max(0,this.matchTimeLeft-1);this.hud.timer(this.matchTimeLeft);if(this.matchTimeLeft===0)this._endMatch(this.scoreA>=this.scoreB?'a':'b');}
    }
    if(this.matchActive&&this.gameMode==='koth')this._tickKoth(delta);
    // Bot grenade AOE damage
    if(window._botGrenades?.length){
      const now=performance.now();
      window._botGrenades=window._botGrenades.filter(g=>{
        if(now-g.t>200)return false;
        if(this.player?.isAlive&&this.player.position.distanceTo(g.pos)<g.radius) this._applyDamage(this.player,g.damage,g.pos);
        for(const bot of this.bots){ if(bot.isAlive&&bot.position.distanceTo(g.pos)<g.radius) this._applyDamage(bot,g.damage,g.pos); }
        return false;
      });
    }

    this._refreshHUD();
    this.renderer.render();

    if(this.net?.isConnected){
      const kothState=this.gameMode==='koth'?this._getKothState():null;
      this.net.syncGameState(this.player,this._newBulletsThisFrame,kothState);
      this._newBulletsThisFrame=[];
      this.net.updateRemoteVisuals(this.renderer.scene);
    }
    this._loopId=requestAnimationFrame(ts=>this._loop(ts));
  }

  // ── BULLET SYSTEM — handles both guns and melee ───────────────────────────
  _tickBullets(delta){
    const dt=delta/1000;
    const toRemove=[];

    for(let i=this.bullets.length-1;i>=0;i--){
      const b=this.bullets[i];
      if(!b.alive){toRemove.push(i);continue;}

      // ── MELEE — instant check, no movement ──
      if(b.isMelee){
        b.alive=false;toRemove.push(i);
        const origin=b.position;
        const targets=this._getMeleeTargets(b);
        for(const t of targets){
          if(t.id===b.ownerId)continue;
          const dist=origin.distanceTo(t.position);
          if(dist>b.range+0.5)continue;
          // Check if roughly in front (arc check)
          const toTarget=t.position.clone().sub(origin).normalize();
          const dot=toTarget.dot(b.direction);
          if(dot<0.1&&dist>1.2)continue; // behind, skip unless very close
          const headshot=false;
          const dmg=Math.round(b.damage*(b.ownerId==='local'?(this.player?.damageMult||1):1));
          const killed=this._applyDamage(t,dmg);
          this._particles(t.position.clone().add(new THREE.Vector3(0,1,0)),false);
          if(b.ownerId==='local'){
            this.hud.hitMarker(false);
            if(t.peerId&&this.net&&this.net.isConnected){
              this.net.sendDamageEvent(t.peerId,dmg,this.net._getMyName(),'MELEE');
            }
            if(killed){
              this.player.kills++;
              this.hud.killNotif(t.name||'ENEMY');
              this.hud.killfeed('YOU', t.name||'ENEMY', 'MELEE', true);
              this._addScore(this.player.team||'a', this.player.id||'local');
            }
          } else {
            const killer=this.bots.find(x=>x.id===b.ownerId);
            if(killed){
              if(killer) killer.kills++;
              this.hud.killfeed(killer?.name||'BOT', t.isPlayer?'YOU':(t.name||'BOT'), 'MELEE', false);
              this._addScore(b.ownerTeam, b.ownerId);
              if(t.isPlayer) this._playerDied();
            }
          }
        }
        continue;
      }

      // ── PROJECTILE ──
      b.position.addScaledVector(b.direction,b.speed*dt);
      b.distanceTraveled+=b.speed*dt;

      if(b.distanceTraveled>b.range){b.alive=false;toRemove.push(i);continue;}

      // World collision — skip on very first tick to avoid origin self-hits
      let worldHit=false;
      if(b.distanceTraveled > 0.5){
        for(const c of this._colliders){
          if(!c.box)continue;
          if(c.box.containsPoint(b.position)){this._impactDecal(b.position);b.alive=false;worldHit=true;break;}
        }
      }
      if(worldHit){toRemove.push(i);continue;}

      // Entity hit
      const targets=[];
      const isFfaBullet = b.ownerTeam && b.ownerTeam.startsWith('ffa_');
      for(const bot of this.bots){
        if(!bot.isAlive)continue;
        // FFA: any different ffa_ team is valid target; TDM: opposite team
        const isEnemy = isFfaBullet ? (bot.team!==b.ownerTeam) : (bot.team!==b.ownerTeam);
        if(isEnemy)targets.push(bot);
      }
      // Player is always a valid target for any enemy bullet
      const playerIsTarget = isFfaBullet ? true : (b.ownerTeam!==(this.player?.team||'a'));
      if(playerIsTarget&&this.player?.isAlive)targets.push(this.player);

      let hit=false;
      for(const t of targets){
        if(t.id===b.ownerId)continue;
        const dx=b.position.x-t.position.x, dz=b.position.z-t.position.z;
        const xzDist=Math.sqrt(dx*dx+dz*dz);
        if(xzDist>1.1)continue; // quick reject
        // Bot position.y = waist height (~groundY+0.9). Player position.y = eye height (~1.8).
        const isBot=!t.isPlayer;
        const bodyBase = isBot ? t.position.y - 0.9 : t.position.y - 1.7;
        const bodyTop  = isBot ? t.position.y + 1.1 : t.position.y + 0.2;
        const bodyRadius = 0.65;

        if(xzDist<bodyRadius && b.position.y>=bodyBase && b.position.y<=bodyTop){
          const headzone = bodyBase + (bodyTop-bodyBase)*0.72;
          const headshot = b.position.y > headzone;
          const dmgMult = (headshot ? 1.5 : 1) * (b.ownerId==='local' ? (this.player?.damageMult||1) : 1);
          const dmg = Math.round(b.damage * dmgMult);
          const killed=this._applyDamage(t,dmg);
          this._particles(b.position,headshot);

          if(b.ownerId==='local'){
            this.shotsH++; this.hud.hitMarker(headshot);
            // Send damage to remote peer if target has a peerId
            if(t.peerId&&this.net&&this.net.isConnected){
              this.net.sendDamageEvent(t.peerId,dmg,this.net._getMyName(),this.player?.weaponSystem?.stats?.name||'WEAPON');
            }
            if(killed){
              this.player.kills++;
              this.hud.killNotif(t.name||'ENEMY');
              this.hud.killfeed('YOU', t.name||'ENEMY', this.player?.weaponSystem?.stats?.name||'WEAPON', true);
              this._addScore(this.player.team||'a');
            }
          } else {
            const killer=this.bots.find(x=>x.id===b.ownerId);
            if(killed){
              if(killer) killer.kills++;
              const kname = killer?.name||'BOT';
              const tname = t.isPlayer ? 'YOU' : (t.name||'BOT');
              this.hud.killfeed(kname, tname, killer?.weaponId||'WEAPON', false);
              this._addScore(b.ownerTeam, b.ownerId);
              if(t.isPlayer) this._playerDied();
            }
          }
          if(!b.penetrating){b.alive=false;hit=true;break;}
        }
      }
      if(hit)toRemove.push(i);
    }

    for(let i=toRemove.length-1;i>=0;i--)this.bullets.splice(toRemove[i],1);
  }

  _getMeleeTargets(b){
    const targets=[];
    for(const bot of this.bots){if(!bot.isAlive)continue;if(bot.team!==b.ownerTeam)targets.push(bot);}
    if(b.ownerTeam!==(this.player?.team||'a')&&this.player?.isAlive)targets.push(this.player);
    return targets;
  }

  _applyDamage(target,amount,fromPos){
    const wasAlive=target.isAlive;
    const fromDir = fromPos && !target.isPlayer ? fromPos.clone().sub(target.position).normalize() : null;
    target.takeDamage(amount, fromDir);
    const died=wasAlive&&!target.isAlive;
    if(died){
      if(!target.isPlayer){
        let pts;
        if(this.gameMode==='ffa'){
          // FFA: respawn at random spawn from either team
          const allPts=[...(this._spawnPoints.a||[]),...(this._spawnPoints.b||[])];
          pts = allPts.length ? allPts : this._spawnPoints.a || [];
        } else {
          pts=target.team==='a'?this._spawnPoints.a:this._spawnPoints.b;
        }
        const sp=(pts[Math.floor(Math.random()*pts.length)]||new THREE.Vector3(0,2,0)).clone();
        setTimeout(()=>{
          if(!this.matchActive)return;
          target.respawn(sp);
          // Re-supply colliders after respawn (in case they were cleared)
          if(target.setColliders) target.setColliders(this._colliders);
        },this.respawnDelay*1000);
      }
    }
    return died;
  }

  _addScore(team, killerId){
    if(this.gameMode==='ffa'){
      // FFA: track individual scores
      if(!this._ffaScores) this._ffaScores={};
      const id = killerId || team;
      this._ffaScores[id] = (this._ffaScores[id]||0)+1;
      const ffaLimit = this.scoreLimit || 20;
      // Check if any player hit limit
      const maxScore = Math.max(...Object.values(this._ffaScores));
      const winner = Object.keys(this._ffaScores).find(k=>this._ffaScores[k]>=ffaLimit);
      // Show combined score as total kills
      const myScore = this._ffaScores['local']||this._ffaScores[this.player?.id]||0;
      const topBotScore = maxScore;
      this.hud.score(myScore, topBotScore);
      if(winner) this._endMatch(winner==='local'||winner===this.player?.id?'a':'b');
      return;
    }
    if(team==='a')this.scoreA++;else this.scoreB++;
    this.hud.score(this.scoreA,this.scoreB);
    if(this.scoreA>=this.scoreLimit)this._endMatch('a');
    if(this.scoreB>=this.scoreLimit)this._endMatch('b');
  }

  _playerDied(){
    this.hud.elimBanner(this.respawnDelay);
    document.exitPointerLock();
    setTimeout(()=>{
      if(!this.matchActive)return;
      const groundY=this._colliders.filter(c=>c.isGround).reduce((m,c)=>Math.max(m,c.y||0),0);
      const pts=this.playerTeam==='a'?this._spawnPoints.a:this._spawnPoints.b;
      const sp=(pts[Math.floor(Math.random()*pts.length)]||new THREE.Vector3(0,groundY+2,0)).clone();
      sp.y=Math.max(sp.y,groundY+1.8);
      this.player.respawn(sp);
      if(this.state==='playing')this.$('game-canvas')?.requestPointerLock();
    },this.respawnDelay*1000);
  }

  // ── EFFECTS ──────────────────────────────────────────────────────────────
  _particles(pos, headshot) {
    if (!this._pPool) { this._pPool = []; this._pMeshes = []; }
    const col = headshot ? 0xffaa00 : 0xff3300;
    const cnt = headshot ? 6 : 4; // reduced count
    const scene = this.renderer.scene;
    const now = performance.now();
    for (let i = 0; i < cnt; i++) {
      // Reuse a dead particle mesh if available, else create one
      let entry = this._pPool.find(p => !p.alive);
      if (!entry) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 3, 3), new THREE.MeshBasicMaterial({ color: col, transparent: true }));
        entry = { mesh: m, vel: new THREE.Vector3(), t0: 0, alive: false };
        this._pPool.push(entry);
        scene.add(m);
      }
      entry.mesh.material.color.setHex(col);
      entry.mesh.material.opacity = 1;
      entry.mesh.position.copy(pos);
      entry.vel.set((Math.random() - 0.5) * 9, Math.random() * 6 + 1, (Math.random() - 0.5) * 9);
      entry.t0 = now;
      entry.alive = true;
      entry.mesh.visible = true;
    }
  }

  _tickParticles() {
    if (!this._pPool) return;
    const now = performance.now();
    for (const p of this._pPool) {
      if (!p.alive) continue;
      const t = (now - p.t0) / 1000;
      if (t > 0.7) { p.alive = false; p.mesh.visible = false; continue; }
      p.mesh.position.x += p.vel.x * 0.016;
      p.mesh.position.y += p.vel.y * 0.016;
      p.mesh.position.z += p.vel.z * 0.016;
      p.vel.y -= 16 * 0.016;
      p.mesh.material.opacity = Math.max(0, 1 - t * 2.5);
    }
  }

  _impactDecal(pos){
    if(!this._decalCount)this._decalCount=0;
    if(this._decalCount>30)return; // cap
    const scene=this.renderer.scene;
    const d=new THREE.Mesh(new THREE.CircleGeometry(0.06,5),new THREE.MeshBasicMaterial({color:0x111111,side:THREE.DoubleSide,depthWrite:false}));
    d.position.copy(pos);d.position.y=Math.max(0.02,d.position.y);d.rotation.x=-Math.PI/2;
    scene.add(d);this._decalCount++;
    setTimeout(()=>{scene.remove(d);this._decalCount=Math.max(0,(this._decalCount||1)-1);},8000);
  }

  _refreshHUD(){
    // Net ping display
    if(this.net&&this.net.isConnected){
      let pingEl=this.$('net-ping');
      if(!pingEl){pingEl=document.createElement('div');pingEl.id='net-ping';document.getElementById('hud')&&document.getElementById('hud').appendChild(pingEl);}
      const ms=this.net.getPingMs();
      pingEl.textContent=(ms<1?'':ms+'ms');
      pingEl.style.color=ms>100?'#ff4400':ms>50?'#ffaa00':'rgba(0,245,255,0.4)';
    }
    if(!this.hud||!this.player)return;
    const isMelee=this.player.weaponSystem.isMelee();
    this.hud.vitals(this.player.health,this.player.maxHealth,this.player.shield,this.player.maxShield);
    this.hud.ammo(this.player.weaponSystem.ammo,this.player.weaponSystem.reserve,this.player.weaponSystem.stats?.name||'',this.player.weaponSystem.isReloading,isMelee);
    const ch=CHARACTERS.find(c=>c.id===this.selectedChar);
    this.hud.abilities(ch,this.player.abilityCooldowns);
    const units=[{position:this.player.position,team:this.player.team||'a',isPlayer:true,isAlive:this.player.isAlive},...this.bots.map(b=>({position:b.position,team:b.team,isPlayer:false,isAlive:b.isAlive}))];
    this.hud.minimap({position:this.player.position,yaw:this.player.yaw},units,200);
    if(ch){
      const badge=this.$('hud-player-badge');if(badge){badge.style.borderColor=ch.color+'88';}
      const pname=this.$('hud-player-name');if(pname){pname.textContent=ch.name;pname.style.color=ch.color;}
      const prole=this.$('hud-player-role');if(prole){prole.textContent=ch.role;prole.style.color=ch.color;prole.style.opacity='0.6';}
      const picon=this.$('hud-player-icon');if(picon){picon.textContent=isMelee?'⚔':(ch.abilities?.e?.icon||'◈');picon.style.color=ch.color;}
    }
    const playerTeam=this.player.team||'a';
    const allyBots=this.bots.filter(b=>b.team===playerTeam);
    const enemyBots=this.bots.filter(b=>b.team!==playerTeam);
    const allyUnits=[{name:'YOU',health:this.player.health,maxHealth:this.player.maxHealth,isAlive:this.player.isAlive},...allyBots.map(b=>({name:b.name,health:b.health,maxHealth:b.maxHealth,isAlive:b.isAlive}))];
    const enemyUnits=enemyBots.map(b=>({name:b.name,health:b.health,maxHealth:b.maxHealth,isAlive:b.isAlive}));
    this.hud.teamStatus(allyUnits,enemyUnits,playerTeam);
    this._tickDamageNumbers();
  }

  _tickDamageNumbers(){
    if(!window._dmgQueue?.length)return;
    const now=performance.now();
    const cam=this.renderer?.camera;
    const canvas=this.$('game-canvas');
    if(!cam||!canvas){window._dmgQueue=[];return;}
    // Cap active damage number DOM elements to avoid pile-up
    if(!this._dmgEls)this._dmgEls=0;
    let spawned=0;
    const keep=[];
    for(const dq of window._dmgQueue){
      if(now-dq.t>80){continue;} // expired
      if(spawned>=2||this._dmgEls>=6){keep.push(dq);continue;} // throttle
      const v=dq.pos.clone().project(cam);
      if(v.z>1){continue;}
      const x=(v.x*0.5+0.5)*canvas.clientWidth;
      const y=(-v.y*0.5+0.5)*canvas.clientHeight;
      const el=document.createElement('div');
      el.textContent=dq.amount;
      el.style.cssText=`position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:500;font-family:Orbitron,monospace;font-size:${14+Math.min(dq.amount/20,8)}px;color:#ff4400;text-shadow:0 0 6px #ff2200;font-weight:900;animation:dmgFloat 0.8s ease forwards;transform:translateX(-50%)`;
      document.body.appendChild(el);
      spawned++;this._dmgEls++;
      setTimeout(()=>{el.remove();this._dmgEls=Math.max(0,(this._dmgEls||1)-1);},800);
    }
    window._dmgQueue=keep;
  }

  // ── MATCH END ──────────────────────────────────────────────────────────────
  _endMatch(winner){
    if(!this.matchActive)return;
    this.matchActive=false;this.state='ended';
    document.exitPointerLock();cancelAnimationFrame(this._loopId);
    const acc=this.shotsF>0?Math.round((this.shotsH/this.shotsF)*100):0;
    this.hud?.matchEnd(winner==='a',{kills:this.player?.kills||0,deaths:this.player?.deaths||0,assists:0,acc});
  }

  // ── KOTH GAME MODE ────────────────────────────────────────────────────────
  _initKothZone(){
    if(!this.renderer)return;
    const scene=this.renderer.scene;
    const k=this._koth;
    // Pick center of map
    // Place zone at map ground level
    const groundYK = this._colliders?.filter(c=>c.isGround).reduce((m,c)=>Math.max(m,c.y||0),0) || 0;
    k.capturePos=new THREE.Vector3(0, groundYK+0.1, 0);
    // Visual zone ring
    if(k._zoneMesh){scene.remove(k._zoneMesh);}
    const geo=new THREE.CylinderGeometry(k.captureRadius,k.captureRadius,0.3,32,1,true);
    const mat=new THREE.MeshBasicMaterial({color:0xffaa00,transparent:true,opacity:0.35,side:THREE.DoubleSide,depthWrite:false});
    k._zoneMesh=new THREE.Mesh(geo,mat);
    k._zoneMesh.position.copy(k.capturePos);
    scene.add(k._zoneMesh);
    // Floor decal
    const decGeo=new THREE.CircleGeometry(k.captureRadius,32);
    const decMat=new THREE.MeshBasicMaterial({color:0xffaa00,transparent:true,opacity:0.12,depthWrite:false});
    k._decal=new THREE.Mesh(decGeo,decMat);
    k._decal.rotation.x=-Math.PI/2;
    k._decal.position.copy(k.capturePos);
    k._decal.position.y=0.05;
    scene.add(k._decal);
    // Pulsing point light
    k._zoneLight=new THREE.PointLight(0xffaa00,2,k.captureRadius*2);
    k._zoneLight.position.copy(k.capturePos);
    k._zoneLight.position.y=2;
    scene.add(k._zoneLight);
  }

  _tickKoth(delta){
    const k=this._koth;
    const dt=delta/1000;
    // Animate zone
    if(k._zoneMesh){k._zoneMesh.rotation.y+=dt*0.5;}
    if(k._zoneLight){k._zoneLight.intensity=1.5+Math.sin(performance.now()*0.003)*0.8;}

    // Find who is in zone
    if(!k.capturePos)return;
    const units=[];
    if(this.player&&this.player.isAlive){
      const dx=this.player.position.x-k.capturePos.x,dz=this.player.position.z-k.capturePos.z;
      if(Math.sqrt(dx*dx+dz*dz)<k.captureRadius)units.push({team:this.player.team,isPlayer:true});
    }
    for(const b of this.bots){
      if(!b.isAlive)continue;
      const dx=b.position.x-k.capturePos.x,dz=b.position.z-k.capturePos.z;
      if(Math.sqrt(dx*dx+dz*dz)<k.captureRadius)units.push({team:b.team,isPlayer:false});
    }

    const aCount=units.filter(u=>u.team==='a').length;
    const bCount=units.filter(u=>u.team==='b').length;
    let capturer=null;

    if(aCount>0&&bCount===0){
      capturer='a';
      k.teamATime+=dt;
      if(k._zoneMesh)k._zoneMesh.material.color.setHex(0x00a8ff);
      if(k._decal)k._decal.material.color.setHex(0x00a8ff);
      if(k._zoneLight)k._zoneLight.color.setHex(0x00a8ff);
    } else if(bCount>0&&aCount===0){
      capturer='b';
      k.teamBTime+=dt;
      if(k._zoneMesh)k._zoneMesh.material.color.setHex(0xff4400);
      if(k._decal)k._decal.material.color.setHex(0xff4400);
      if(k._zoneLight)k._zoneLight.color.setHex(0xff4400);
    } else {
      // Contested
      if(k._zoneMesh)k._zoneMesh.material.color.setHex(0xffaa00);
      if(k._decal)k._decal.material.color.setHex(0xffaa00);
      if(k._zoneLight)k._zoneLight.color.setHex(0xffaa00);
    }
    k.capturer=capturer;

    // Update HUD
    const progress=Math.min(100,(capturer==='a'?k.teamATime:k.teamBTime)/k.timeToWin*100);
    if(this.hud)this.hud.kothBar(progress,capturer,k.teamATime,k.teamBTime,k.timeToWin);

    // Check win
    if(k.teamATime>=k.timeToWin){this._endMatch('a');return;}
    if(k.teamBTime>=k.timeToWin){this._endMatch('b');return;}

    // Sync KOTH state to guests
    if(this.net&&this.net.isConnected&&this.net.isHost){
      // Sync via syncGameState which includes kothState
    }
  }

  _onKothStateSync(data){
    const k=this._koth;
    if(data.teamATime!==undefined)k.teamATime=data.teamATime;
    if(data.teamBTime!==undefined)k.teamBTime=data.teamBTime;
    if(data.capturer!==undefined)k.capturer=data.capturer;
    if(this.hud){
      const progress=Math.min(100,(k.capturer==='a'?k.teamATime:k.teamBTime)/k.timeToWin*100);
      this.hud.kothBar(progress,k.capturer,k.teamATime,k.teamBTime,k.timeToWin);
    }
  }

  _getKothState(){
    const k=this._koth;
    return{teamATime:k.teamATime,teamBTime:k.teamBTime,capturer:k.capturer};
  }

  _pause(){
    if(this.state!=='playing')return;
    this.state='paused';this._showPause(true);
    document.exitPointerLock();cancelAnimationFrame(this._loopId);
  }
  _resume(){
    if(this.state!=='paused')return;
    this.state='playing';this._showPause(false);
    this._lastTs=performance.now();
    this._loopId=requestAnimationFrame(ts=>this._loop(ts));
    setTimeout(()=>this.$('game-canvas')?.requestPointerLock(),100);
  }
  _showPause(visible){
    const el=this.$('esc-menu');if(!el)return;
    if(visible)el.classList.remove('hidden');else el.classList.add('hidden');
  }
  _quit(){
    this.matchActive=false;cancelAnimationFrame(this._loopId);
    document.exitPointerLock();
    this.net?.destroy();this.player?.destroy();
    this.player=null;this.bots=[];this.bullets=[];
    if(this.renderer)this.renderer.clearScene();
    if(this._loadingRenderer){try{this._loadingRenderer.dispose();}catch(_){}this._loadingRenderer=null;}
    this.$('match-end')?.classList.add('hidden');
    this.$('esc-menu')?.classList.add('hidden');
    this.$('pointer-lock-overlay')?.classList.add('hidden');
    const ls=this.$('loading-screen');
    if(ls){ls.style.cssText='display:none !important';ls.classList.add('hidden');ls.classList.remove('active');}
    const gs=this.$('game-screen');
    if(gs){gs.classList.remove('active');gs.style.display='none';}
    this.state='menu';this.show('main-menu');this._menuBg();
  }
  _rematch(){this.$('match-end')?.classList.add('hidden');this._startGame(this.isSolo);}
}

// ── BOOT ──────────────────────────────────────
const game=new NexusStrike();
window.__nexus=game;
