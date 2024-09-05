"use strict";
const fs = require('fs');
const RJSON = require('relaxed-json');

class Configurator {
    isConfigLoaded = false
    isConfigCorrect = false

    config = {}
    isCorrect() {
        return this.isConfigCorrect && this.isConfigLoaded
    }
    loadConfig(rootPath) {
        this.isConfigCorrect = false
        this.isConfigLoaded = false
        let configText = fs.readFileSync(rootPath + '/.sync-sftp.json')
        let ignorePatterns = [];
        let host = '';
        let username = '';
        let password = '';
        let port = 22;
        let remotePath = '';
        let errors = []
        let options = {}
        let rsync = false
        let rsyncExclude = []
        let rsyncPath = 'rsync'
        let sshPath = 'ssh'
        try {
            let options = Buffer.from(configText).toString('utf8')
            const config = RJSON.parse(options);
            host = config.host;
            username = config.user;

            ignorePatterns = config.ignore_regexes;
            remotePath = config.remote_path;

            // If port is set in config file (Like in Sublime) then use that, default is 22
            if (config.port) {
                port = config.port;
            }
            if (config.rsyncExclude) {
                rsyncExclude = config.rsyncExclude
            }
            if (config.rsyncPath) {
                rsyncPath = config.rsyncPath
            }
            if (config.sshPath) {
                sshPath = config.sshPath
            }
            // If password is set in config file (Like in Sublime) then use that
            if (config.password) {
                password = config.password;
            } else {
                errors.push('Error: Unable to retrieve password from sftp-config.json or keychain!')
            }
            if (config.useRsync) {
                rsync = config.useRsync
            }
        } catch (e) {
            errors.push('Error: Unable to parse sftp-config.json!')
        }

        if (errors.length === 0) {
            options = {
                host: host, // required
                username: username, // required
                port: port,
                autoConfirm: true,
            };
            if (password && password.length > 0) {
                options['password'] = password;
            }
            this.isConfigCorrect = true
            this.isConfigLoaded = true
        }
        this.config = {
            sftpOptions: options,
            ignorePatterns,
            remotePath,
            errors,
            rootPath,
            useRsync: rsync,
            rsyncExclude,
            rsyncPath,
            sshPath
        }
    }
}

module.exports = Configurator;