#!/usr/bin/env node
// record-demo.js
// Usage: node record-demo.js [output.mp4] [width] [height] [fps]
// Requires: npm i puppeteer
// Requires ffmpeg available in PATH

const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const puppeteer = require('puppeteer');

(async ()=>{
  const outFile = process.argv[2] || 'demo-record.mp4';
  const W = parseInt(process.argv[3],10) || 1280;
  const H = parseInt(process.argv[4],10) || 720;
  const FPS = parseInt(process.argv[5],10) || 25;
  const tmp = path.join(__dirname, 'tmp-frames');
  if(!fs.existsSync(tmp)) fs.mkdirSync(tmp);
  // check ffmpeg
  const ff = spawnSync('ffmpeg', ['-version']);
  if(ff.error){
    console.error('ffmpeg not found in PATH. Please install ffmpeg.');
    process.exit(1);
  }

  const indexPath = path.resolve(__dirname, 'index.html');
  const url = 'file://' + indexPath;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({width: W, height: H});
  await page.goto(url, {waitUntil: 'networkidle2'});

  // compute estimated total duration from demo on the page
  const totalMs = await page.evaluate(() => {
    // copy of typingDurationFor used in page
    function typingDurationFor(text){
      const clean = String(text || '').trim();
      const len = Math.max(0, clean.length);
      const base = 350;
      const perChar = 45;
      let dur = base + perChar * len;
      if(len < 6) dur = Math.max(dur, 520);
      const mul = 1.05; // use a neutral multiplier for estimation
      dur = Math.round(dur * mul);
      dur = Math.max(350, Math.min(dur, 5000));
      return dur;
    }
    const sequence = window.offlineDemo || [];
    let t = 0;
    for(let i=0;i<sequence.length;i++){
      const it = sequence[i];
      const d = it.delay || 0;
      t += d;
      if(it.typing && !it.msg){
        // lookahead
        const next = sequence.slice(i+1).find(x=>x.msg);
        if(next && next.msg){
          const dur = (it.typingDuration ?? next.typingDuration ?? next.msg.typingDuration) || typingDurationFor(next.msg.text||'');
          t += dur;
        } else {
          t += 800;
        }
      }
      if(it.msg){
        const text = it.msg.text || '';
        const dur = (it.typingDuration ?? it.msg.typingDuration) || typingDurationFor(text);
        t += dur;
      }
    }
    return t;
  });

  console.log(`Estimated demo duration: ${Math.round(totalMs/1000)}s`);

  // start the demo on the page
  await page.evaluate(()=>{ if(typeof runDemo === 'function') runDemo(); });

  // capture frames
  const duration = Math.max(3000, totalMs + 1000); // add margin
  const frameDelay = Math.round(1000 / FPS);
  const frames = Math.ceil(duration / frameDelay);
  console.log(`Capturing ~${frames} frames at ${FPS} FPS to ${tmp}`);

  for(let i=0;i<frames;i++){
    const filename = path.join(tmp, `frame-${String(i).padStart(6,'0')}.png`);
    await page.screenshot({path: filename});
    await new Promise(r=>setTimeout(r, frameDelay));
  }

  await browser.close();

  // assemble with ffmpeg
  console.log('Assembling video with ffmpeg...');
  // ffmpeg -r FPS -f image2 -s WxH -i frame-%06d.png -vcodec libx264 -crf 18 -pix_fmt yuv420p out.mp4
  const ffmpegArgs = [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(tmp, 'frame-%06d.png'),
    '-s', `${W}x${H}`,
    '-c:v','libx264','-pix_fmt','yuv420p',outFile
  ];
  const ffproc = spawnSync('ffmpeg', ffmpegArgs, {stdio:'inherit'});
  if(ffproc.error){ console.error('ffmpeg failed', ffproc.error); process.exit(1); }

  console.log('Video saved to', outFile);
  // optional: cleanup
  // fs.rmSync(tmp, { recursive:true, force:true });
})();
