'use strict';
const $ = id => document.getElementById(id);
let state, settingsOpen = false, pending = Promise.resolve(), recording=false, selectedSection='display', edits={}, saving=false;
const sectionScroll=new Map();
const tabs=[...document.querySelectorAll('[data-section]')];
const compactNavigation=window.matchMedia('(max-width:900px)');
function navigationOrientation(){document.querySelector('.settings-nav').setAttribute('aria-orientation',compactNavigation.matches?'horizontal':'vertical');}
navigationOrientation();compactNavigation.addEventListener('change',navigationOrientation);
function feedback(message,error=false){$('feedback').textContent=message;$('feedback').dataset.error=String(error);}
const audioBuses=['player','music','environment','creatures'];
function paintVolume(slider) {
  const value=Number(slider.value), min=Number(slider.min), max=Number(slider.max);
  slider.style.setProperty('--range-fill',`${100*(value-min)/(max-min)}%`);
}
async function call(name, value) {
  const result = await window.blitz.action(name, value);
  if (result?.error) feedback(result.error,true);
  return result;
}
function draft(){return {...state.settings,...edits};}
function edit(patch){
  for(const [key,value] of Object.entries(patch)){
    if(JSON.stringify(value)===JSON.stringify(state.settings[key]))delete edits[key];else edits[key]=value;
  }
  render(state);feedback(Object.keys(edits).length?'Unsaved changes. Save to apply; closing discards them.':'Changes apply when you press Save.');
}
async function save(){
  if(saving||!Object.keys(edits).length)return;
  const patch=structuredClone(edits);saving=true;render(state);feedback('Saving…');
  pending=(async()=>{
    try{
      const result=await call('save-settings',patch);
      if(result.ok){edits={};render(await window.blitz.action('state'));}
      feedback(result.error||result.message||'Saved',!!result.error);
    }catch{feedback('Could not save settings. Your changes are still pending.',true);}
    finally{saving=false;render(state);}
  })();
  return pending;
}
function crosshairPreview(s){
  const image=window.blitzCrosshair.pixels(s),canvas=$('crosshair-preview'),ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const data=new ImageData(new Uint8ClampedArray(image.rgba),image.width,image.width);
  ctx.putImageData(data,(canvas.width-image.width)/2,(canvas.height-image.width)/2);
  if(s.style==='default'){
    ctx.beginPath();ctx.moveTo(66,59);ctx.lineTo(66,82);ctx.lineTo(72,76);ctx.lineTo(78,85);ctx.lineTo(82,82);ctx.lineTo(76,73);ctx.lineTo(85,73);ctx.closePath();
    ctx.fillStyle='#f0e9d1';ctx.strokeStyle='#121820';ctx.lineWidth=2;ctx.fill();ctx.stroke();
  }
  $('crosshair-preview-label').textContent=s.style==='default'?'Default game pointer':`${s.style[0].toUpperCase()+s.style.slice(1)} · ${s.size} px`;
}
function render(next) {
  state = next;
  const entering=state.modal==='settings'&&!settingsOpen;
  if(entering||state.modal!=='settings')edits={};
  const s=draft();
  document.body.classList.toggle('fullscreen', state.fullscreen);
  $('change-character').disabled=state.loading||!!state.error;
  $('waiting-text').textContent = state.error || 'Opening Dungeon Blitz…';
  $('overlay').hidden = !state.modal;
  $('settings-content').hidden = state.modal !== 'settings'; $('error-content').hidden = state.modal !== 'error';
  $('settings-body').hidden=state.modal!=='settings';
  $('panel-title').textContent = state.modal === 'error' ? 'Could not connect' : 'Settings'; $('error-text').textContent = state.error;
  $('version').textContent = `v${state.version}`;
  $('compatibility').hidden = state.clientIntegration !== false && state.audioIntegration !== false;
  if (state.modal === 'settings') {
    $('volume').value = $('volume-number').value = s.volume;
    for(const bus of audioBuses){$('audio-'+bus).value=s.audioMix[bus];$('audio-value-'+bus).textContent=s.audioMix[bus]+'%';}
    for(const slider of document.querySelectorAll('input[type=range]'))paintVolume(slider);
    $('game-zoom').value = s.gameZoom; $('hardware-acceleration').checked = s.hardwareAcceleration; $('keep-awake').checked = s.keepGameAwake;
    $('render-resolution').value=s.renderResolution;
    $('show-fps').checked=s.showFPS;
    $('experimental-widescreen').checked=s.experimentalWidescreen;
    $('centered-hotbar').checked=s.centeredHotbar;
    $('centered-camera').checked=s.centeredCamera;
    $('auto-updates').checked=s.autoUpdates;
    if(document.activeElement!==$('game-url'))$('game-url').value = s.gameURL;
    $('crosshair-style').value=s.crosshair.style;$('crosshair-color').value=s.crosshair.color;
    $('crosshair-size').value=s.crosshair.size;$('crosshair-outline').checked=s.crosshair.outline;
    for(const id of ['crosshair-color','crosshair-size','crosshair-outline'])$(id).disabled=s.crosshair.style==='default';
    crosshairPreview(s.crosshair);
    if(entering){feedback('Changes apply when you press Save.');selectSection(selectedSection);$('dismiss').focus();}
  }
  settingsOpen = state.modal === 'settings';
  $('settings-body').inert=saving;
  $('save-settings').disabled=!settingsOpen||saving||!Object.keys(edits).length;
  $('discard').disabled=!settingsOpen||saving||!Object.keys(edits).length;
  $('save-settings').hidden=$('discard').hidden=!settingsOpen;
  if(!settingsOpen)recording=false;
  if(!recording){$('unlock-key').textContent=window.blitzShortcuts.label(s.unlockKey);$('unlock-key').dataset.code=s.unlockKey;}
  $('cursor-lock').checked = s.cursorLock;
  $('shift-mount').checked=s.shiftMount;
  $('shift-mount').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('cursor-status').textContent = s.cursorLock ? 'Locks after saving and returning to the game.' : 'Cursor lock is off.';
  $('audio-status').textContent = state.audio?.error ? 'Audio control unavailable. Reconnect to retry.' : "Controls this game's sound only.";
  $('audio-mix-status').textContent=state.audioIntegration===false?'Separate sound controls need a launcher update. Master volume still works.':'Player includes abilities and menu sounds. Environment includes ambient and world sounds. Master volume scales every category.';
  for(const bus of audioBuses)$('audio-'+bus).disabled=state.audioIntegration===false;
  $('render-resolution').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('show-fps').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('experimental-widescreen').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('centered-hotbar').disabled=!s.experimentalWidescreen||state.clientIntegration===false||state.audioIntegration===false;
  $('hotbar-hint').textContent=s.experimentalWidescreen?'Keep the compact hotbar beneath the wider world.':'Enable 16:9 to use this layout. Your preference is kept.';
  $('centered-camera').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('url-status').textContent = Object.hasOwn(edits,'gameURL')?'Unsaved address. Press Save below before reconnecting.':state.pendingURL ? 'Saved. Reconnect to use the new game URL.' : '';
  $('reconnect').disabled=saving||!!Object.keys(edits).length;
  const update=state.update||{};
  $('compatibility').textContent=update.phase==='ready'?'Some enhancements need a compatibility update. A verified launcher update is ready; open Updates to install it.':'Some enhancements are unavailable for this game version. '+(s.autoUpdates?'The launcher checks for a compatible update automatically.':'Open Updates to check for a compatible launcher.')+' Your game keeps running.';
  $('update-status').textContent=update.phase==='ready'?`v${update.version} downloaded and verified. ${s.autoUpdates?'Installs when you close the launcher.':'Use Install & restart when convenient.'}`:update.phase==='downloading'?`Downloading v${update.version} · ${update.percent}%`:update.phase==='verifying'?`Verifying v${update.version} · ${update.percent}%`:update.phase==='error'?update.error:({current:'Up to date.',checking:'Checking GitHub…',development:'Updates are disabled in development builds.'}[update.phase]||(s.autoUpdates?'Checks GitHub automatically.':'Automatic updates are off.'));
  if(update.phase==='unavailable')$('update-status').textContent=update.error;
  $('install-update').hidden=update.phase!=='ready';$('check-updates').disabled=['development','unavailable','checking','downloading','verifying'].includes(update.phase);
  $('reconnect').textContent = state.pendingURL ? 'Apply URL & reconnect' : 'Reconnect game';
}
$('settings').onclick = () => call('settings'); $('fullscreen').onclick = () => call('fullscreen');
$('change-character').onclick=async()=>{await pending;await call('change-character');};
function selectSection(name){
  if(!tabs.some(tab=>tab.dataset.section===name))return;
  sectionScroll.set(selectedSection,$('settings-content').scrollTop);
  selectedSection=name;
  document.querySelectorAll('[data-pane]').forEach(section=>{section.hidden=section.dataset.pane!==name;});
  for(const button of tabs){const selected=button.dataset.section===name;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
  $('settings-content').scrollTop=sectionScroll.get(name)||0;
}
for(const button of tabs){
  button.onclick=()=>selectSection(button.dataset.section);
  button.onkeydown=e=>{
    const previous=compactNavigation.matches?'ArrowLeft':'ArrowUp',next=compactNavigation.matches?'ArrowRight':'ArrowDown';
    if(![previous,next,'Home','End'].includes(e.key))return;
    e.preventDefault();
    const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(tabs.indexOf(button)+(e.key===next?1:-1)+tabs.length)%tabs.length;
    tabs[index].focus();selectSection(tabs[index].dataset.section);
  };
}
for (const id of ['dismiss', 'done']) $(id).onclick = async () => { await pending;await call('dismiss'); };
$('save-settings').onclick=save;
$('discard').onclick=()=>{edits={};$('game-url').value=state.settings.gameURL;render(state);feedback('Unsaved changes discarded.');};
$('retry').onclick = () => call('restart-game'); $('reconnect').onclick = async () => { await pending; await call('restart-game'); };
$('game-url').oninput=()=>edit({gameURL:$('game-url').value.trim()});
$('singleplayer-url').onclick=()=>{$('game-url').value='http://localhost:8000/';edit({gameURL:$('game-url').value});$('game-url').focus();};
$('multiplayer-url').onclick=()=>{$('game-url').value='https://dungeonblitzr.theminesa.studio/';edit({gameURL:$('game-url').value});$('game-url').focus();};
$('cursor-lock').onchange = () => edit({ cursorLock: $('cursor-lock').checked });
$('shift-mount').onchange=()=>edit({shiftMount:$('shift-mount').checked});
$('unlock-key').onclick = async () => {
  recording=!recording;await call('capture-shortcut',recording);
  $('unlock-key').setAttribute('aria-pressed',String(recording));
  $('unlock-key').textContent=recording?'Press a key…':window.blitzShortcuts.label(draft().unlockKey);
  $('shortcut-hint').textContent=recording?'Press one key. Escape cancels.':'Click the shortcut, then press a key. Escape cancels.';
};
document.addEventListener('keydown',async e=>{
 if(!recording)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(e.repeat)return;
 if(e.code==='Escape'){
  recording=false;await call('capture-shortcut',false);$('unlock-key').setAttribute('aria-pressed','false');
  $('unlock-key').textContent=window.blitzShortcuts.label(draft().unlockKey);$('shortcut-hint').textContent='Shortcut unchanged.';return;
 }
 const modifier=/^(Alt|Control|Shift)(Left|Right)$/.test(e.code);
 if(!Object.hasOwn(window.blitzShortcuts.codes,e.code)||(!modifier&&(e.ctrlKey||e.altKey||e.metaKey||e.shiftKey))){$('shortcut-hint').textContent='Press one key by itself. F11 and Escape are reserved.';return;}
 recording=false;await call('capture-shortcut',false);edit({unlockKey:e.code});
 $('unlock-key').setAttribute('aria-pressed','false');$('shortcut-hint').textContent='Shortcut selected. Press Save to apply it.';
},true);
document.addEventListener('pointerdown',e=>{if(e.target.closest('#unlock-key'))return;if(recording){recording=false;call('capture-shortcut',false);$('unlock-key').setAttribute('aria-pressed','false');$('unlock-key').textContent=window.blitzShortcuts.label(draft().unlockKey);}},true);
$('game-zoom').onchange = () => edit({ gameZoom: Number($('game-zoom').value) });
$('render-resolution').onchange=()=>edit({renderResolution:Number($('render-resolution').value)});
$('show-fps').onchange=()=>edit({showFPS:$('show-fps').checked});
$('experimental-widescreen').onchange=()=>edit({experimentalWidescreen:$('experimental-widescreen').checked});
$('centered-hotbar').onchange=()=>edit({centeredHotbar:$('centered-hotbar').checked});
$('centered-camera').onchange=()=>edit({centeredCamera:$('centered-camera').checked});
$('auto-updates').onchange=()=>edit({autoUpdates:$('auto-updates').checked});
$('check-updates').onclick=()=>call('check-updates');$('install-update').onclick=()=>call('install-update');
$('hardware-acceleration').onchange = () => edit({ hardwareAcceleration: $('hardware-acceleration').checked });
$('keep-awake').onchange = () => edit({ keepGameAwake: $('keep-awake').checked });
for(const id of ['crosshair-style','crosshair-color','crosshair-size','crosshair-outline'])$(id).oninput=()=>edit({crosshair:{style:$('crosshair-style').value,color:$('crosshair-color').value,size:Number($('crosshair-size').value),outline:$('crosshair-outline').checked}});
function volumeInput(source) {
  const v = Number(source.value);
  if (!Number.isInteger(v) || v < 0 || v > 100 || source.value === '') return;
  $('volume').value = $('volume-number').value = v;edit({volume:v});
  paintVolume($('volume'));
}
$('volume').oninput = () => volumeInput($('volume')); $('volume-number').oninput = () => volumeInput($('volume-number'));
for(const bus of audioBuses)$('audio-'+bus).oninput=()=>{
  paintVolume($('audio-'+bus));
  $('audio-value-'+bus).textContent=$('audio-'+bus).value+'%';
  const mix=Object.fromEntries(audioBuses.map(key=>[key,Number($('audio-'+key).value)]));edit({audioMix:mix});
};
$('volume-number').onblur = () => {
  const value = Number($('volume-number').value);
  if ($('volume-number').value === '' || !Number.isInteger(value) || value < 0 || value > 100) $('volume-number').value = $('volume').value;
};
// Keep keyboard focus in the local settings dialog while the game is hidden.
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !state?.modal) return;
  const controls = [...$('overlay').querySelectorAll('button,input,select')].filter(el => !el.disabled && el.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
window.blitz.subscribe(render); call('state').then(render);
