#ifndef AppIdentity
  #define AppIdentity "{A9EAA7C2-5CDD-4C8F-B87E-EF061C6B2D72}"
#endif
#define AppName "Dungeon Blitz Launcher"
#define AppExe "Dungeon Blitz Launcher.exe"
#define BuildFolder "release\" + AppVersion + "\Dungeon Blitz Launcher-win32-x64"

[Setup]
AppId={{#AppIdentity}
AppName={#AppName}
AppVerName={#AppName}
AppVersion={code:EffectiveVersion}
AppPublisher=Daniel Prizer
AppPublisherURL=https://github.com/Daniel-Prizer/dungeon-blitz-launcher
AppSupportURL=https://github.com/Daniel-Prizer/dungeon-blitz-launcher/issues
AppUpdatesURL=https://github.com/Daniel-Prizer/dungeon-blitz-launcher/releases
DefaultDirName={localappdata}\Programs\Dungeon Blitz Launcher
DefaultGroupName=Dungeon Blitz Launcher
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
WizardStyle=modern dynamic
SetupIconFile={#SourceRoot}\assets\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallFilesDir={app}\.launcher-install
OutputDir={#OutputFolder}
OutputBaseFilename={#OutputName}
Compression=lzma2/fast
SolidCompression=yes
DisableProgramGroupPage=yes
AllowNoIcons=yes
DisableWelcomePage=no
CloseApplications=no
RestartApplications=no
AlwaysRestart=no
SetupMutex=DungeonBlitzLauncherSetup
VersionInfoVersion={#AppVersion}.0
VersionInfoDescription=Dungeon Blitz Launcher Setup
VersionInfoProductName={#AppName}

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#SourceRoot}\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion; Check: CopyPayload
Source: "{#SourceRoot}\{#BuildFolder}\*"; DestDir: "{app}\{#BuildFolder}"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: CopyPayload
Source: "{#Maintenance}"; DestDir: "{app}\.launcher-install"; DestName: "maintenance.exe"; Flags: ignoreversion; Check: CopyPayload
Source: "{#Ledger}"; DestDir: "{app}\.launcher-install"; DestName: "files-{#AppVersion}.txt"; Flags: ignoreversion; Check: CopyPayload
Source: "{#IdentityFile}"; DestDir: "{app}\.launcher-install"; DestName: "app-id.txt"; Flags: ignoreversion; Check: CopyPayload
Source: "{#Maintenance}"; DestName: "setup-maintenance.exe"; Flags: dontcopy

[Icons]
#ifdef TestBuild
; Exercise Windows shortcut creation without writing to Daniel's desktop/menu.
Name: "{app}\.test-shortcuts\Start Menu"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{app}\.test-shortcuts\Desktop"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon
#else
Name: "{group}\Dungeon Blitz Launcher"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{autodesktop}\Dungeon Blitz Launcher"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon
#endif

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch Dungeon Blitz"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: dirifempty; Name: "{app}\release"
Type: dirifempty; Name: "{app}\.launcher-install"

[Code]
var
  KeepPayload: Boolean;
  CurrentVersion: String;

function EffectiveVersion(Param: String): String;
begin
  if CurrentVersion = '' then Result := '{#AppVersion}' else Result := CurrentVersion;
end;

function CopyPayload: Boolean;
begin
  Result := not KeepPayload;
end;

function InstalledVersion: String;
var MS, LS: Cardinal;
begin
  Result := '';
  if GetVersionNumbers(ExpandConstant('{app}\{#AppExe}'), MS, LS) then
    Result := Format('%d.%d.%d', [MS shr 16, MS and $FFFF, LS shr 16]);
end;

function CheckLatest: Boolean;
var ExitCode: Integer; Core: String;
begin
  Core := ExpandConstant('{app}\release\') + InstalledVersion + '\Dungeon Blitz Launcher-win32-x64\{#AppExe}';
  Result := Exec(Core, '--setup-update', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  if Result then Result := ExitCode = 0;
  CurrentVersion := InstalledVersion;
  if Result then Log('Latest signed release checked; installed version ' + CurrentVersion)
  else Log('Latest release check unavailable; existing/bundled build retained.');
end;
function Maintenance(Operation, Folder, Helper: String): String;
var
  ExitCode: Integer;
  MessageFile: String;
  ErrorMessage: AnsiString;
begin
  MessageFile := ExpandConstant('{tmp}\launcher-maintenance-result.txt');
  DeleteFile(MessageFile);
  if not Exec(Helper, Operation + ' "' + Folder + '" "' + MessageFile + '"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
    Result := 'Could not check the installation folder.'
  else if ExitCode = 0 then
    Result := ''
  else if LoadStringFromFile(MessageFile, ErrorMessage) then
    Result := String(ErrorMessage)
  else
    Result := 'Could not safely access the installation folder.';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExistingMS, ExistingLS, SetupMS, SetupLS: Cardinal;
begin
  KeepPayload := False;
  ExtractTemporaryFile('setup-maintenance.exe');
  Result := Maintenance('check', ExpandConstant('{app}'), ExpandConstant('{tmp}\setup-maintenance.exe'));
  if Result <> '' then Exit;
  if GetVersionNumbers(ExpandConstant('{app}\{#AppExe}'), ExistingMS, ExistingLS) and
     GetVersionNumbers(ExpandConstant('{srcexe}'), SetupMS, SetupLS) then
    if (ExistingMS > SetupMS) or ((ExistingMS = SetupMS) and (ExistingLS >= SetupLS)) then begin
      CurrentVersion := InstalledVersion;
      KeepPayload := CheckLatest;
      if not KeepPayload and ((ExistingMS > SetupMS) or ((ExistingMS = SetupMS) and (ExistingLS > SetupLS))) then
        Result := 'A newer launcher is installed. Its update check could not finish; the installation was kept unchanged.';
    end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ErrorMessage: String;
begin
  if CurStep = ssPostInstall then begin
    if not KeepPayload then CheckLatest;
    ErrorMessage := Maintenance('refresh', ExpandConstant('{app}'), ExpandConstant('{tmp}\setup-maintenance.exe'));
    if ErrorMessage <> '' then Log('Version registration: ' + ErrorMessage);
  end;
end;

function InitializeUninstall: Boolean;
var
  ErrorMessage: String;
begin
  Result := CopyFile(ExpandConstant('{app}\.launcher-install\maintenance.exe'), ExpandConstant('{tmp}\setup-maintenance.exe'), False);
  if not Result then Exit;
  ErrorMessage := Maintenance('check', ExpandConstant('{app}'), ExpandConstant('{tmp}\setup-maintenance.exe'));
  Result := ErrorMessage = '';
  if not Result then MsgBox(ErrorMessage, mbError, MB_OK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ErrorMessage: String;
begin
  if CurUninstallStep = usUninstall then begin
    ErrorMessage := Maintenance('cleanup', ExpandConstant('{app}'), ExpandConstant('{tmp}\setup-maintenance.exe'));
    if ErrorMessage <> '' then RaiseException(ErrorMessage);
  end;
end;
