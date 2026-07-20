; GrokDesk v0.1.3: create the desktop entry automatically after installation.
!macro NSIS_HOOK_POSTINSTALL
  Call CreateOrUpdateDesktopShortcut
!macroend
