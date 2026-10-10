'use strict';
// Preserve Windows paths/profile locations, not API tokens, signing variables,
// SSH-agent access or debugging configuration from the launching environment.
const WINDOWS_KEYS = new Set([
  'SYSTEMROOT','WINDIR','SYSTEMDRIVE','PATH','PATHEXT','COMSPEC','TEMP','TMP',
  'USERPROFILE','USERNAME','USERDOMAIN','APPDATA','LOCALAPPDATA','PROGRAMDATA',
  'PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','HOMEDRIVE','HOMEPATH',
  'NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER',
  'PROCESSOR_LEVEL','PROCESSOR_REVISION','OS','LANG','LC_ALL','TZ'
]);
function gameEnvironment(source, test = false) {
  const result = {};
  for (const [key, value] of Object.entries(source))
    if (WINDOWS_KEYS.has(key.toUpperCase())) result[key] = value;
  if (test && typeof source.BLITZ_PRIVATE_DESKTOP === 'string' && /^BlitzTest-[a-f0-9]+$/.test(source.BLITZ_PRIVATE_DESKTOP))
    result.BLITZ_PRIVATE_DESKTOP = source.BLITZ_PRIVATE_DESKTOP;
  return result;
}
module.exports = { gameEnvironment };
