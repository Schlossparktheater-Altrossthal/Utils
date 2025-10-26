#!/usr/bin/env node
// record-playwright.js
// ESM script (package.json has "type": "module").
// Usage: node record-playwright.js [out.webm|out.mp4] [width] [height] [fps]

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { chromium } from 'playwright';

const outArg = process.argv[2] || 'demo-playwright.webm';
const WIDTH = parseInt(process.argv[3], 10) || 1280;
const HEIGHT = parseInt(process.argv[4], 10) || 720;
const FPS = parseInt(process.argv[5], 10) || 25;

const outExt = path.extname(outArg).toLowerCase();
const tmpDir = path.join(process.cwd(), 'playwright-videos');
if(!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

(async ()=>{
  // check ffmpeg availability for optional mp4 conversion
  const ffmpegCheck = spawnSync('ffmpeg', ['-version']);
  const hasFfmpeg = !ffmpegCheck.error;

  const indexPath = path.resolve(process.cwd(), 'index.html');
  const url = 'file://' + indexPath;

  console.log('Launching Chromium (Playwright)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: tmpDir, size: { width: WIDTH, height: HEIGHT } }
  });
  // note: recording starts when the context is created
  const recordingStart = Date.now();
  let demoStartTime = null;
  let demoEndTime = null;

  const page = await context.newPage();
  // listen for console markers from the page to trim the final video
  page.on('console', msg => {
    try{
      const txt = msg.text();
      if(txt === 'DEMO_START'){
        demoStartTime = Date.now();
        console.log('Detected DEMO_START at', new Date(demoStartTime).toISOString());
      }
      if(txt === 'DEMO_END'){
        demoEndTime = Date.now();
        console.log('Detected DEMO_END at', new Date(demoEndTime).toISOString());
      }
    }catch(e){}
  });
  console.log('Loading page:', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  // estimate duration from the demo array in the page
  const totalMs = await page.evaluate(() => {
    function typingDurationFor(text){
      const clean = String(text || '').trim();
      const len = Math.max(0, clean.length);
      const base = 350; const perChar = 45;
      let dur = base + perChar * len;
      if(len < 6) dur = Math.max(dur, 520);
      const mul = 1.05; dur = Math.round(dur * mul);
      dur = Math.max(350, Math.min(dur, 5000));
      return dur;
    }
    const sequence = window.offlineDemo || [];
    let t = 0;
    for(let i=0;i<sequence.length;i++){
      const it = sequence[i];
      const d = it.delay || 0; t += d;
      if(it.typing && !it.msg){
        const next = sequence.slice(i+1).find(x=>x.msg);
        if(next && next.msg){
          const dur = (it.typingDuration ?? next.typingDuration ?? next.msg.typingDuration) || typingDurationFor(next.msg.text||'');
          t += dur;
        } else { t += 800; }
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

  // start demo
  await page.evaluate(()=>{ if(typeof runDemo === 'function') runDemo(); });
  // record when demo started relative to recording start if console markers weren't emitted
  // (we rely on page console logs DEMO_START/DEMO_END to compute precise trim points)

  const bufferMs = 1200;
  const waitMs = Math.max(3000, totalMs + bufferMs);
  console.log(`Recording for ${Math.round(waitMs/1000)}s...`);
  await page.waitForTimeout(waitMs);

  // close page to finalize video file
  console.log('Finalizing video...');
  await page.close();
  await context.close();
  await browser.close();

  // find produced file in tmpDir
  const files = fs.readdirSync(tmpDir).filter(f=>/\.webm$/.test(f));
  if(!files.length){
    console.error('No video file produced in', tmpDir);
    process.exit(1);
  }
  // take the newest file
  files.sort((a,b)=> fs.statSync(path.join(tmpDir,b)).mtimeMs - fs.statSync(path.join(tmpDir,a)).mtimeMs);
  const src = path.join(tmpDir, files[0]);
  console.log('Produced video:', src);
  // If we detected demo start/end via console, trim the produced video to that segment
  let finalSrc = src;
  const preBuffer = 0.5; // seconds before demo start to keep
  const postBuffer = 0.6; // seconds after demo end to keep
  if(demoStartTime){
    if(!hasFfmpeg){
      console.warn('Detected demo start but ffmpeg not found — cannot trim. Using full video.');
    } else {
      const recStartSec = recordingStart / 1000;
      const startSec = Math.max(0, (demoStartTime/1000) - recStartSec - preBuffer);
      const endSec = (demoEndTime ? (demoEndTime/1000 - recStartSec + postBuffer) : (startSec + (totalMs/1000) + postBuffer));
      const duration = Math.max(0.1, endSec - startSec);
      const trimmed = path.join(tmpDir, 'trimmed' + outExt);
      console.log(`Trimming video: start=${startSec}s duration=${duration}s -> ${trimmed}`);
      // For mp4 target, re-encode to mp4; for webm, try stream copy
      if(outExt === '.mp4'){
        const ffargs = ['-y','-ss', String(startSec), '-i', src, '-t', String(duration), '-c:v','libx264','-crf','18','-pix_fmt','yuv420p', trimmed];
        const r = spawnSync('ffmpeg', ffargs, { stdio: 'inherit' });
        if(r.status === 0) finalSrc = trimmed; else console.warn('ffmpeg trimming failed — using full video');
      } else {
        // webm or other: copy segment (may be less accurate)
        const ffargs = ['-y','-ss', String(startSec), '-i', src, '-t', String(duration), '-c','copy', trimmed];
        const r = spawnSync('ffmpeg', ffargs, { stdio: 'inherit' });
        if(r.status === 0) finalSrc = trimmed; else console.warn('ffmpeg trimming failed — using full video');
      }
    }
  }

  // produce final output
  if(outExt === '.webm'){
    fs.copyFileSync(finalSrc, path.resolve(process.cwd(), outArg));
    console.log('Saved', outArg);
  } else if(outExt === '.mp4'){
    if(path.extname(finalSrc).toLowerCase() === '.mp4'){
      fs.copyFileSync(finalSrc, path.resolve(process.cwd(), outArg));
      console.log('Saved', outArg);
    } else {
      if(!hasFfmpeg){ console.error('ffmpeg is required to convert to mp4 but was not found in PATH. Saved webm at', finalSrc); process.exit(1); }
      console.log('Converting to MP4 with ffmpeg...');
      const ffargs = ['-y','-i', finalSrc, '-c:v','libx264','-crf','18','-pix_fmt','yuv420p', path.resolve(process.cwd(), outArg)];
      const r = spawnSync('ffmpeg', ffargs, { stdio: 'inherit' });
      if(r.status !== 0){ console.error('ffmpeg failed'); process.exit(1); }
      console.log('Saved', outArg);
    }
  } else {
    // unknown ext, just copy
    fs.copyFileSync(finalSrc, path.resolve(process.cwd(), outArg));
    console.log('Saved', outArg);
  }

  console.log('Done.');
})();
