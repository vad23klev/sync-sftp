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

}
```

##  License 📄

This project is licensed under the [**MIT License**](https://github.com/vad23klev/sync-sftp/blob/main/LICENSE).

##  Author 🙋🏽‍♂️

I'm Vadim Klevtsov, a software developer.