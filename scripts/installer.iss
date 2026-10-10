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
AppVersion={#AppVersion}
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
Source: "{#SourceRoot}\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\{#BuildFolder}\*"; DestDir: "{app}\{#BuildFolder}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Maintenance}"; DestDir: "{app}\.launcher-install"; DestName: "maintenance.exe"; Flags: ignoreversion
Source: "{#Ledger}"; DestDir: "{app}\.launcher-install"; DestName: "files-{#AppVersion}.txt"; Flags: ignoreversion
Source: "{#IdentityFile}"; DestDir: "{app}\.launcher-install"; DestName: "app-id.txt"; Flags: ignoreversion
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
  ExtractTemporaryFile('setup-maintenance.exe');
  Result := Maintenance('check', ExpandConstant('{app}'), ExpandConstant('{tmp}\setup-maintenance.exe'));
  if Result <> '' then Exit;
  if GetVersionNumbers(ExpandConstant('{app}\{#AppExe}'), ExistingMS, ExistingLS) and
     GetVersionNumbers(ExpandConstant('{srcexe}'), SetupMS, SetupLS) then
    if (ExistingMS > SetupMS) or ((ExistingMS = SetupMS) and (ExistingLS > SetupLS)) then
      Result := 'A newer Dungeon Blitz Launcher is already installed. Use the latest installer.';
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
