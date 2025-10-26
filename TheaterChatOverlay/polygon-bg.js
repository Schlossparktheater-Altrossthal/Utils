// polygon-bg.js
// Simple sci-fi low-poly moving background. Exposes window.polyBackground with control methods.
(function(){
  // Network-style sci-fi background: nodes + edges, edges occasionally jump to new targets
  const canvas = document.getElementById('polyCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let w=0,h=0, DPR = Math.max(1, window.devicePixelRatio||1);
  let enabled = false;
  let speed = 1;

  // Settings
  let NODE_COUNT = 80;
  const MAX_LINKS = 3; // per node
  const LINK_DIST = 220; // px threshold

  const nodes = [];
  let lastJump = 0;

  function resize(){
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    w = cssW; h = cssH;
    canvas.width = Math.max(1, Math.floor(cssW * DPR));
    canvas.height = Math.max(1, Math.floor(cssH * DPR));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }

  function rand(a,b){ return a + Math.random()*(b-a); }

  function makeNodes(){
    nodes.length = 0;
    for(let i=0;i<NODE_COUNT;i++){
      nodes.push({
        x: rand(0,w), y: rand(0,h),
        vx: rand(-0.15,0.15), vy: rand(-0.15,0.15),
        r: rand(1.2,2.6),
        hue: Math.floor(rand(200,260)),
        links: []
      });
    }
    computeLinks();
  }

  function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }

  function computeLinks(){
    // naive O(n^2) nearest neighbors
    for(let i=0;i<nodes.length;i++) nodes[i].links = [];
    for(let i=0;i<nodes.length;i++){
      const a = nodes[i];
      const dists = [];
      for(let j=0;j<nodes.length;j++){ if(i===j) continue; dists.push({j, d: (a.x-nodes[j].x)**2 + (a.y-nodes[j].y)**2}); }
      dists.sort((p,q)=>p.d-q.d);
      for(let k=0;k<Math.min(MAX_LINKS, dists.length); k++){
        const other = nodes[dists[k].j];
        if(Math.sqrt(dists[k].d) < LINK_DIST) a.links.push(other);
      }
    }
  }

  function step(now){
    if(!enabled){ requestAnimationFrame(step); return; }

    // clear
    ctx.clearRect(0,0,w,h);
    // subtle background
    ctx.fillStyle = 'rgba(6,8,14,0.14)';
    ctx.fillRect(0,0,w,h);

    // update nodes
    for(const n of nodes){
      n.x += n.vx * speed;
      n.y += n.vy * speed;
      // wrap
      if(n.x < -20) n.x = w+20; if(n.x > w+20) n.x = -20;
      if(n.y < -20) n.y = h+20; if(n.y > h+20) n.y = -20;
      // gentle drift
      n.vx += rand(-0.02,0.02) * 0.02;
      n.vy += rand(-0.02,0.02) * 0.02;
      n.vx = Math.max(-0.6, Math.min(0.6, n.vx));
      n.vy = Math.max(-0.6, Math.min(0.6, n.vy));
    }

    // occasionally rewire a link (jump): choose random node and replace one of its links
    const nowMs = performance.now();
    if(nowMs - lastJump > 600 + Math.random()*1400){
      lastJump = nowMs;
      const a = nodes[Math.floor(Math.random()*nodes.length)];
      if(a.links.length>0){
        const idx = Math.floor(Math.random()*a.links.length);
        // pick a new candidate far enough
        let candidate = nodes[Math.floor(Math.random()*nodes.length)];
        let tries = 0;
        while((candidate===a || a.links.includes(candidate)) && tries++ < 30) candidate = nodes[Math.floor(Math.random()*nodes.length)];
        if(candidate !== a && !a.links.includes(candidate)){
          // animate by temporarily storing a 'jump' edge that interpolates
          const old = a.links[idx];
          a.links[idx] = { _jumpFrom: old, _jumpTo: candidate, _t:0 };
        }
      }
    }

    // draw links
    ctx.lineWidth = 1.1;
    ctx.globalCompositeOperation = 'lighter';
    for(const a of nodes){
      for(const l of a.links){
        // support jump objects
        if(l && l._jumpFrom){
          l._t += 0.02 * speed;
          const p0 = l._jumpFrom;
          const p1 = l._jumpTo;
          const ix = p0.x * (1-l._t) + p1.x * l._t;
          const iy = p0.y * (1-l._t) + p1.y * l._t;
          // draw from a to intermediate
          const grad = ctx.createLinearGradient(a.x,a.y, ix, iy);
          grad.addColorStop(0, `hsla(${a.hue},80%,65%,0.18)`);
          grad.addColorStop(1, `hsla(${(a.hue+80)%360},70%,55%,0.04)`);
          ctx.strokeStyle = grad;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(ix,iy); ctx.stroke();
          if(l._t >= 1){
            // finalize: replace with actual node
            a.links = a.links.map(z => (z === l ? p1 : z));
          }
        } else {
          const b = l;
          const d = dist(a,b);
          const alpha = Math.max(0.03, 0.22 - (d / LINK_DIST) * 0.18);
          const glow = Math.max(8, 18 - d*0.03);
          ctx.shadowBlur = glow;
          ctx.shadowColor = `hsla(${a.hue},80%,65%,${alpha})`;
          ctx.strokeStyle = `hsla(${a.hue},80%,65%,${alpha})`;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        }
      }
    }

    // draw nodes
    ctx.shadowBlur = 12;
    for(const n of nodes){
      ctx.fillStyle = `hsl(${n.hue} 85% 60%)`;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r*1.6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,0.02)`;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r*0.7, 0, Math.PI*2); ctx.fill();
    }

    requestAnimationFrame(step);
  }

  // Public API
  window.polyBackground = {
    setEnabled(v){ enabled = !!v; if(enabled){ resize(); makeNodes(); lastJump = performance.now(); } },
    setSpeed(s){ speed = Math.max(0, s); },
    resize(){ resize(); },
  };

  // init
  function init(){ resize(); makeNodes(); requestAnimationFrame(step); }
  window.addEventListener('resize', ()=>{ resize(); computeLinks(); });
  init();
})();
