# Change Log

## [0.3.2]

- Initial release

## [0.3.10]

- Add error on trying upload ignore file
- Messages are shorter now
- Add "Reload config button"

## [0.3.30]

- Replace sftps with node-ssh
- Clear Code

## [0.3.31]

- Correct reconnect function

## [0.3.45]

- Clear Code
- Add reconnect button
- Add connection status to status bar
- Add reupload button for files with errors

## [0.3.50]

- Add PING to check sftp server is alive, because NodeSSH have long timeout
- Add break word to messages, for remove horizontal scroll

## [0.3.90]

- Add Rsync
- Add "useRsync" config option
- Add "rsyncExclude" config option

## [0.4.0]

- Add "rsyncPath" config option
- Add "sshPath" config option
- Add mkdir if destination not exists

## [0.4.36]

- Move command Reconnect to StatusBarItem
- Add "detectDifferences" command to show differences between local and remote files
- Add "makeEqual" command to make remote files equal to local files
- change condition order in timeInterval to make less connection checks

## [0.4.37]

- fix RegExp

## [0.4.55]

- Fix path with spaces

## [0.5.30]

- Move log to separate ActivityBar panel
- Move items to submenu from title
- Add pause button
- Add clear upload query button
- Add message counter in status bar
- Make some refactoring
