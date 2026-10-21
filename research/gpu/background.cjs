'use strict';
// Explicit user preference: only this research process and descendants. Never
// select processes by name, lower unrelated apps, alter affinity/power/GPU
// settings, or touch the farmer. Child compiler JVMs use at most two CPUs.
const os = require('node:os'),
  { execFileSync } = require('node:child_process');
function lowerSelf() {
  os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  process.env.JAVA_TOOL_OPTIONS = [
    process.env.JAVA_TOOL_OPTIONS || '',
    '-XX:ActiveProcessorCount=2',
  ]
    .join(' ')
    .trim();
}
function lowerOwnedChildren() {
  if (process.platform !== 'win32') return;
  const taskPID = process.pid;
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$taskProcesses=Get-CimInstance Win32_Process; $taskOwned=[System.Collections.Generic.HashSet[uint32]]::new(); [void]$taskOwned.Add(${taskPID}); do { $taskAdded=$false; foreach($taskProcess in $taskProcesses) { if($taskOwned.Contains([uint32]$taskProcess.ParentProcessId) -and $taskOwned.Add([uint32]$taskProcess.ProcessId)) { $taskAdded=$true } } } while($taskAdded); foreach($taskProcessId in $taskOwned) { try { (Get-Process -Id $taskProcessId -ErrorAction Stop).PriorityClass='BelowNormal' } catch {} }`,
    ],
    { windowsHide: true, stdio: 'ignore', timeout: 10000 }
  );
}
module.exports = { lowerSelf, lowerOwnedChildren };
