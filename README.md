<h2 align="center"><img src="./icons/icon.png" height="128" /><br />Sync SFTP</h2>
<p align="center"><strong>⚡️ Start watcher on work directory and Sync external changes</strong></p>


This is a **VSCode extension** inspired by the  **[Sublime-Sync](https://www.npmjs.com/package/sublime-sync)** package create by [Rick Groenewegen](https://github.com/RickGroenewegen). But was updated and rewritten.

## Configuration 🛠️

The extension works out of the box if working directory has file ```sftp-config.json```, with the following contents:
```
{
    "host": "<Host IP>",
    "user": "<SSH user>",
    "password": "<SSH PASSWORD>",
    "remote_path": "<Absolute remote path>",
    "ignore_regexes": [<Array with regexps to ignore upload>],
    "useRsync": <true/false>,
    "rsyncExclude": [<Array with exclude path for rsync>],
    "rsyncPath": "<Rsync path>",
    "sshPath": "<SSH path>",
    "rsyncRootPath": "<absolute folder path>"

}
```

Example ```rsyncRootPath``` for Windows Users

```
{
    "rsyncRootPath": "/c/Users/<prog>/projects/"
}
```

Example ```rsyncRootPath``` for Macos Users

```
{
    "rsyncRootPath": "/Users/<prog>/projects/"
}
```
## Requirements for Windows

To use Rsync on Windows You need to install [Git](https://git-scm.com/downloads/win)

Get packages from [repository](https://repo.msys2.org/msys/x86_64/):

1) rsync ( rsync-3.2.7-2-x86_64.pkg.tar.zst )
2) libxxhash ( libxxhash-0.8.2-1-x86_64.pkg.tar.zst )
3) liblz4 ( liblz4-1.9.4-1-x86_64.pkg.tar.zst )
4) libzstd ( libzstd-1.5.5-1-x86_64.pkg.tar.zst )
5) libopenssl ( libopenssl-3.2.0-1-x86_64.pkg.tar.zst)
6) libopenssl ( libopenssl-1.1.1.q-1-x86_64.pkg.tar.zst)
7) Extract files(exe + dll) from archive and copy to ```Git``` folder (```{Git folder}/usr/bin```)
8) To test ```Rsync``` open  ```Git Bash``` and execute command ```rsync --help```, if You see errors? something went wrong



##  License 📄

This project is licensed under the [**MIT License**](https://github.com/vad23klev/sync-sftp/blob/main/LICENSE).

##  Author 🙋🏽‍♂️

I'm Vadim Klevtsov, a software developer.