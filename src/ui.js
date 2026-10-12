'use strict';
const $ = id => document.getElementById(id);
let state, settingsOpen = false, pending = Promise.resolve(), volumeTimer, recording=false, selectedSection='display';
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
function save(patch) {
  feedback('Saving…');
  pending = pending.then(() => call('save-settings', patch)).then(async result => { if(result.error)render(await window.blitz.action('state'));feedback(result.message || result.error || 'Saved automatically',!!result.error);return result; }).catch(() => { feedback('Could not save settings.',true); });
  return pending;
}
function render(next) {
  state = next; const s = state.settings;
  document.body.classList.toggle('fullscreen', state.fullscreen);
  $('change-character').disabled=state.loading||!!state.error;
  $('waiting-text').textContent = state.error || 'Opening Dungeon Blitz…';
  $('overlay').hidden = !state.modal;
  $('settings-content').hidden = state.modal !== 'settings'; $('error-content').hidden = state.modal !== 'error';
  $('settings-body').hidden=state.modal!=='settings';
  $('panel-title').textContent = state.modal === 'error' ? 'Could not connect' : 'Settings'; $('error-text').textContent = state.error;
  $('version').textContent = `v${state.version}`;
  $('compatibility').hidden = state.clientIntegration !== false && state.audioIntegration !== false;
  if (state.modal === 'settings' && !settingsOpen) {
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
    $('game-url').value = s.gameURL; feedback('Settings save automatically.');
    selectSection(selectedSection);$('dismiss').focus();
  }
  settingsOpen = state.modal === 'settings';
  if(!settingsOpen)recording=false;
  if(!recording){$('unlock-key').textContent=window.blitzShortcuts.label(s.unlockKey);$('unlock-key').dataset.code=s.unlockKey;}
  $('cursor-lock').checked = s.cursorLock;
  $('shift-mount').checked=s.shiftMount;
  $('shift-mount').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('cursor-status').textContent = s.cursorLock ? 'Locks when you return to the game.' : 'Cursor lock is off.';
  $('audio-status').textContent = state.audio?.error ? 'Audio control unavailable. Reconnect to retry.' : "Controls this game's sound only.";
  $('audio-mix-status').textContent=state.audioIntegration===false?'Separate sound controls need a launcher update. Master volume still works.':'Player includes abilities and menu sounds. Environment includes ambient and world sounds. Master volume scales every category.';
  for(const bus of audioBuses)$('audio-'+bus).disabled=state.audioIntegration===false;
  $('render-resolution').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('show-fps').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('experimental-widescreen').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('centered-hotbar').disabled=!s.experimentalWidescreen||state.clientIntegration===false||state.audioIntegration===false;
  $('hotbar-hint').textContent=s.experimentalWidescreen?'Keep the compact hotbar beneath the wider world.':'Enable 16:9 to use this layout. Your preference is kept.';
  $('centered-camera').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('url-status').textContent = state.pendingURL ? 'Saved. Reconnect to use the new game URL.' : '';
  const update=state.update||{};
  $('compatibility').textContent=update.phase==='ready'?'Some enhancements need a compatibility update. A verified launcher update is ready; open Updates to install it.':'Some enhancements are unavailable for this game version. '+(s.autoUpdates?'The launcher checks for a compatible update automatically.':'Open Updates to check for a compatible launcher.')+' Your game keeps running.';
  $('update-status').textContent=update.phase==='ready'?`v${update.version} downloaded and verified. ${s.autoUpdates?'Installs when you close the launcher.':'Use Install & restart when convenient.'}`:update.phase==='downloading'?`Downloading v${update.version} · ${update.percent}%`:update.phase==='verifying'?`Verifying v${update.version} · ${update.percent}%`:update.phase==='error'?update.error:({current:'Up to date.',checking:'Checking GitHub…',development:'Updates are disabled in development builds.'}[update.phase]||(s.autoUpdates?'Checks GitHub automatically.':'Automatic updates are off.'));
  if(update.phase==='unavailable')$('update-status').textContent=update.error;
  $('install-update').hidden=update.phase!=='ready';$('check-updates').disabled=['development','unavailable','checking','downloading','verifying'].includes(update.phase);
  $('reconnect').textContent = state.pendingURL ? 'Apply URL & reconnect' : 'Reconnect game';
}
$('settings').onclick = () => call('settings'); $('fullscreen').onclick = () => call('fullscreen');
$('change-character').onclick=async()=>{clearTimeout(volumeTimer);if(settingsOpen)await save({volume:Number($('volume-number').value)});await pending;await call('change-character');};
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
for (const id of ['dismiss', 'done']) $(id).onclick = async () => { if(settingsOpen){clearTimeout(volumeTimer);await save({ volume: Number($('volume-number').value) });}await call('dismiss'); };
$('retry').onclick = () => call('restart-game'); $('reconnect').onclick = async () => { await pending; await call('restart-game'); };
$('apply-url').onclick = async () => { await save({ gameURL: $('game-url').value.trim() }); };
$('cursor-lock').onchange = () => save({ cursorLock: $('cursor-lock').checked });
$('shift-mount').onchange=()=>save({shiftMount:$('shift-mount').checked});
$('unlock-key').onclick = async () => {
  recording=!recording;await call('capture-shortcut',recording);
  $('unlock-key').setAttribute('aria-pressed',String(recording));
  $('unlock-key').textContent=recording?'Press a key…':window.blitzShortcuts.label(state.settings.unlockKey);
  $('shortcut-hint').textContent=recording?'Press one key. Escape cancels.':'Click the shortcut, then press a key. Escape cancels.';
};
document.addEventListener('keydown',async e=>{
 if(!recording)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(e.repeat)return;
 if(e.code==='Escape'){
  recording=false;await call('capture-shortcut',false);$('unlock-key').setAttribute('aria-pressed','false');
  $('unlock-key').textContent=window.blitzShortcuts.label(state.settings.unlockKey);$('shortcut-hint').textContent='Shortcut unchanged.';return;
 }
 const modifier=/^(Alt|Control|Shift)(Left|Right)$/.test(e.code);
 if(!Object.hasOwn(window.blitzShortcuts.codes,e.code)||(!modifier&&(e.ctrlKey||e.altKey||e.metaKey||e.shiftKey))){$('shortcut-hint').textContent='Press one key by itself. F11 and Escape are reserved.';return;}
 recording=false;await call('capture-shortcut',false);const result=await save({unlockKey:e.code});
 $('unlock-key').setAttribute('aria-pressed','false');$('shortcut-hint').textContent=result?.ok?'Shortcut saved. This key toggles cursor lock in the game.':'Shortcut not saved. Choose a different key.';
},true);
document.addEventListener('pointerdown',e=>{if(e.target.closest('#unlock-key'))return;if(recording){recording=false;call('capture-shortcut',false);$('unlock-key').setAttribute('aria-pressed','false');$('unlock-key').textContent=window.blitzShortcuts.label(state.settings.unlockKey);}},true);
$('game-zoom').onchange = () => save({ gameZoom: Number($('game-zoom').value) });
$('render-resolution').onchange=()=>save({renderResolution:Number($('render-resolution').value)});
$('show-fps').onchange=()=>save({showFPS:$('show-fps').checked});
$('experimental-widescreen').onchange=()=>save({experimentalWidescreen:$('experimental-widescreen').checked});
$('centered-hotbar').onchange=()=>save({centeredHotbar:$('centered-hotbar').checked});
$('centered-camera').onchange=()=>save({centeredCamera:$('centered-camera').checked});
$('auto-updates').onchange=()=>save({autoUpdates:$('auto-updates').checked});
$('check-updates').onclick=()=>call('check-updates');$('install-update').onclick=()=>call('install-update');
$('hardware-acceleration').onchange = () => save({ hardwareAcceleration: $('hardware-acceleration').checked });
$('keep-awake').onchange = () => save({ keepGameAwake: $('keep-awake').checked });
function volumeInput(source) {
  const v = Number(source.value);
  if (!Number.isInteger(v) || v < 0 || v > 100 || source.value === '') return;
  $('volume').value = $('volume-number').value = v; clearTimeout(volumeTimer); volumeTimer = setTimeout(() => save({ volume: v }), 70);
  paintVolume($('volume'));
}
$('volume').oninput = () => volumeInput($('volume')); $('volume-number').oninput = () => volumeInput($('volume-number'));
for(const bus of audioBuses)$('audio-'+bus).oninput=()=>{
  paintVolume($('audio-'+bus));
  $('audio-value-'+bus).textContent=$('audio-'+bus).value+'%';
  const mix=Object.fromEntries(audioBuses.map(key=>[key,Number($('audio-'+key).value)]));save({audioMix:mix});
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
