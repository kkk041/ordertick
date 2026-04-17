!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!ifndef BUILD_UNINSTALLER
!include "StrFunc.nsh"

${StrRep}
Var DataDir
Var DataDirText
Var DataDirBrowseBtn

!macro customPageAfterChangeDir
  Page custom DataDirPageCreate DataDirPageLeave
!macroend

Function DataDirPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $DataDir == ""
    StrCpy $DataDir "$DOCUMENTS\OrderTick 数据"
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "请选择订单数据存储路径（安装后可在软件设置中更改）"
  Pop $1

  ${NSD_CreateText} 0 26u 78% 12u "$DataDir"
  Pop $DataDirText

  ${NSD_CreateButton} 80% 25u 20% 14u "浏览..."
  Pop $DataDirBrowseBtn
  ${NSD_OnClick} $DataDirBrowseBtn DataDirOnBrowse

  nsDialogs::Show
FunctionEnd

Function DataDirOnBrowse
  ${NSD_GetText} $DataDirText $0
  nsDialogs::SelectFolderDialog "选择数据存储路径" "$0"
  Pop $1
  ${If} $1 != error
    ${NSD_SetText} $DataDirText "$1"
  ${EndIf}
FunctionEnd

Function DataDirPageLeave
  ${NSD_GetText} $DataDirText $DataDir
  ${IfThen} $DataDir == "" ${|} StrCpy $DataDir "$DOCUMENTS\OrderTick 数据" ${|}
FunctionEnd
!endif

!ifndef BUILD_UNINSTALLER
!macro customInstall
  ; Persist installer-chosen data path to app settings.
  ${If} $DataDir == ""
    StrCpy $DataDir "$DOCUMENTS\OrderTick 数据"
  ${EndIf}

  CreateDirectory "$APPDATA\\ordertick"
  CreateDirectory "$DataDir"

  ${StrRep} $0 "$DataDir" "\" "\\"

  FileOpen $1 "$APPDATA\\ordertick\\app.settings.json" w
  FileWrite $1 "{$\r$\n"
  FileWrite $1 "  $\"dataDir$\": $\"$0$\"$\r$\n"
  FileWrite $1 "}$\r$\n"
  FileClose $1

  ; Also persist a seed copy alongside the installed app so first launch can
  ; recover the chosen directory even if roaming settings were not created.
  CreateDirectory "$INSTDIR\resources"
  FileOpen $2 "$INSTDIR\resources\app.settings.seed.json" w
  FileWrite $2 "{$\r$\n"
  FileWrite $2 "  $\"dataDir$\": $\"$0$\"$\r$\n"
  FileWrite $2 "}$\r$\n"
  FileClose $2

  ; Recreate shortcuts with the packaged danta icon so desktop and taskbar
  ; don't fall back to the Electron default executable icon.
  ${If} ${FileExists} "$INSTDIR\resources\danta.ico"
    CreateShortCut "$newDesktopLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\resources\danta.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    CreateShortCut "$newStartMenuLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\resources\danta.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${EndIf}
!macroend
!endif
