!macro customUnInit
  MessageBox MB_ICONEXCLAMATION|MB_OKCANCEL "Before uninstalling FWD TradeDesk Pro, make sure you have downloaded a Full App Backup if you want to keep candle history and settings for future use or another PC.$\r$\n$\r$\nOpen the app and use Settings > Notifications & Backup > Download Full App Backup.$\r$\n$\r$\nContinue uninstall?" IDOK continueUninstall IDCANCEL cancelUninstall
  cancelUninstall:
    Abort
  continueUninstall:
!macroend
