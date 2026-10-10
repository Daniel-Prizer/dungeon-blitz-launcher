'use strict';
const $ = id => document.getElementById(id);
let state, settingsOpen = false, pending = Promise.resolve(), volumeTimer, recording=false;
const audioBuses=['player','music','environment','creatures'];
async function call(name, value) {
  const result = await window.blitz.action(name, value);
  if (result?.error) $('feedback').textContent = result.error;
  return result;
}
function save(patch) {
  pending = pending.then(() => call('save-settings', patch)).then(result => { $('feedback').textContent = result.message || result.error || 'Saved'; }).catch(() => { $('feedback').textContent = 'Could not save settings.'; });
  return pending;
}
function render(next) {
  state = next; const s = state.settings;
  document.body.classList.toggle('fullscreen', state.fullscreen);
  $('waiting-text').textContent = state.error || 'Starting your game…';
  $('overlay').hidden = !state.modal;
  $('settings-content').hidden = state.modal !== 'settings'; $('error-content').hidden = state.modal !== 'error';
  $('panel-title').textContent = state.modal === 'error' ? 'Could not connect' : 'Settings'; $('error-text').textContent = state.error;
  $('version').textContent = `v${state.version}`;
  $('compatibility').hidden = state.clientIntegration !== false;
  if (state.modal === 'settings' && !settingsOpen) {
    $('volume').value = $('volume-number').value = s.volume; $('cursor-lock').checked = s.cursorLock;
    for(const bus of audioBuses){$('audio-'+bus).value=s.audioMix[bus];$('audio-value-'+bus).textContent=s.audioMix[bus]+'%';}
    $('game-zoom').value = s.gameZoom; $('hardware-acceleration').checked = s.hardwareAcceleration; $('keep-awake').checked = s.keepGameAwake;
    $('render-resolution').value=s.renderResolution;
    $('show-fps').checked=s.showFPS;
    $('experimental-widescreen').checked=s.experimentalWidescreen;
    $('auto-updates').checked=s.autoUpdates;
    $('game-url').value = s.gameURL; $('feedback').textContent = 'Settings save automatically.';
    $('dismiss').focus();
  }
  settingsOpen = state.modal === 'settings';
  if(!settingsOpen)recording=false;
  if(!recording){$('unlock-key').textContent=window.blitzShortcuts.label(s.unlockKey);$('unlock-key').dataset.code=s.unlockKey;}
  $('toggle-cursor').disabled = !s.cursorLock;
  $('toggle-cursor').textContent = state.cursor.suspended ? 'Lock cursor when back in game' : 'Unlock cursor';
  $('cursor-status').textContent = !s.cursorLock ? 'Cursor lock is off.' : state.cursor.suspended ? 'Cursor is unlocked until you toggle it again.' : 'Cursor locks when you return to the game.';
  $('audio-status').textContent = state.audio?.error ? 'Audio control unavailable. Reconnect to retry.' : "Controls this game's sound only.";
  $('audio-mix-status').textContent=state.audioIntegration===false?'Separate sound controls need an update for this client version. Master volume still works.':'Player includes characters, abilities and menu sounds. Environment includes ambient loops and world sounds.';
  for(const bus of audioBuses)$('audio-'+bus).disabled=state.audioIntegration===false;
  $('render-resolution').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('show-fps').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('experimental-widescreen').disabled=state.clientIntegration===false||state.audioIntegration===false;
  $('url-status').textContent = state.pendingURL ? 'Saved. Reconnect to use the new game URL.' : '';
  const update=state.update||{};
  $('update-status').textContent=update.phase==='ready'?`v${update.version} downloaded and verified. ${s.autoUpdates?'Installs when you close the launcher.':'Use Install & restart when convenient.'}`:update.phase==='downloading'?`Downloading v${update.version} · ${update.percent}%`:update.phase==='error'?update.error:({current:'Up to date.',checking:'Checking GitHub…',verifying:'Verifying update…',development:'Updates are disabled in development builds.'}[update.phase]||(s.autoUpdates?'Checks GitHub automatically.':'Automatic updates are off.'));
  if(update.phase==='unavailable')$('update-status').textContent=update.error;
  $('install-update').hidden=update.phase!=='ready';$('check-updates').disabled=['development','unavailable','checking','downloading','verifying'].includes(update.phase);
  $('reconnect').textContent = state.pendingURL ? 'Apply URL & reconnect' : 'Reconnect game';
}
$('settings').onclick = () => call('settings'); $('fullscreen').onclick = () => call('fullscreen');
for (const id of ['dismiss', 'done']) $(id).onclick = async () => { if(settingsOpen){clearTimeout(volumeTimer);await save({ volume: Number($('volume-number').value) });}await call('dismiss'); };
$('retry').onclick = () => call('restart-game'); $('reconnect').onclick = async () => { await pending; await call('restart-game'); };
$('apply-url').onclick = async () => { await save({ gameURL: $('game-url').value.trim() }); };
$('toggle-cursor').onclick = () => call('toggle-cursor');
$('cursor-lock').onchange = () => save({ cursorLock: $('cursor-lock').checked });
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
 recording=false;await call('capture-shortcut',false);await save({unlockKey:e.code});
 $('unlock-key').setAttribute('aria-pressed','false');$('shortcut-hint').textContent='Shortcut saved. This key toggles cursor lock in the game.';
},true);
document.addEventListener('pointerdown',e=>{if(e.target.closest('#unlock-key'))return;if(recording){recording=false;call('capture-shortcut',false);$('unlock-key').setAttribute('aria-pressed','false');$('unlock-key').textContent=window.blitzShortcuts.label(state.settings.unlockKey);}},true);
$('game-zoom').onchange = () => save({ gameZoom: Number($('game-zoom').value) });
$('render-resolution').onchange=()=>save({renderResolution:Number($('render-resolution').value)});
$('show-fps').onchange=()=>save({showFPS:$('show-fps').checked});
$('experimental-widescreen').onchange=()=>save({experimentalWidescreen:$('experimental-widescreen').checked});
$('auto-updates').onchange=()=>save({autoUpdates:$('auto-updates').checked});
$('check-updates').onclick=()=>call('check-updates');$('install-update').onclick=()=>call('install-update');
$('hardware-acceleration').onchange = () => save({ hardwareAcceleration: $('hardware-acceleration').checked });
$('keep-awake').onchange = () => save({ keepGameAwake: $('keep-awake').checked });
function volumeInput(source) {
  const v = Number(source.value);
  if (!Number.isInteger(v) || v < 0 || v > 100 || source.value === '') return;
  $('volume').value = $('volume-number').value = v; clearTimeout(volumeTimer); volumeTimer = setTimeout(() => save({ volume: v }), 70);
}
$('volume').oninput = () => volumeInput($('volume')); $('volume-number').oninput = () => volumeInput($('volume-number'));
for(const bus of audioBuses)$('audio-'+bus).oninput=()=>{
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
