; Use a versioned icon path so Windows cannot reuse a stale shortcut icon cache.
!macro NSIS_HOOK_POSTINSTALL
  Call CreateOrUpdateDesktopShortcut
  SetShellVarContext current
  CreateShortCut "$DESKTOP\GrokDesk.lnk" "$INSTDIR\grokdesk.exe" "" "$INSTDIR\GrokDesk-v0.1.8.ico" 0 SW_SHOWNORMAL "" "GrokDesk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
