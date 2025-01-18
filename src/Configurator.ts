import * as fs from 'fs';
import * as RJSON from 'relaxed-json';

type SftpOptions = {
    host: string,
    username: string,
    port: number,
    autoConfirm: boolean,
    password?: string
};

type ConfigFileOptions = {
    host: string,
    user: string,
    ignore_regexes: string[],
    remote_path: string,
    port?: number,
    rsyncExclude?: string[],
    rsyncPath?: string,
    sshPath?: string,
    password?: string,
    useRsync?: boolean,
};
type ConfigOptions = {
    remotePath: string,
    errors: string[],
    ignorePatterns: string[],
    rootPath: string,
    port?: number,
    rsyncExclude: string[],
    rsyncPath: string,
    sshPath: string,
    useRsync: boolean,
    sftpOptions?: SftpOptions
};
export class Configurator {
    isConfigLoaded = false
    isConfigCorrect = false

    config?: ConfigOptions
    isCorrect() {
        return this.isConfigCorrect && this.isConfigLoaded
    }
    loadConfig(rootPath : string) {
        this.isConfigCorrect = false
        this.isConfigLoaded = false
        let configText = fs.readFileSync(rootPath + '/.sync-sftp.json')
        let ignorePatterns: string[] = [];
        let host = '';
        let username = '';
        let password = '';
        let port = 22;
        let remotePath = '';
        let errors = []
        let options:SftpOptions
        let useRsync = false
        let rsyncExclude:string[] = []
        let rsyncPath = 'rsync'
        let sshPath = 'ssh'
        try {
            let optionsText = Buffer.from(configText).toString('utf8')
            const config: ConfigFileOptions = <ConfigFileOptions>RJSON.parse(optionsText);
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
                useRsync = config.useRsync
            }
        } catch (e) {
            errors.push('Error: Unable to parse sftp-config.json!')
        }
        this.config = <ConfigOptions>{
            ignorePatterns,
            remotePath,
            errors,
            rootPath,
            useRsync,
            rsyncExclude,
            rsyncPath,
            sshPath
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

            this.config['sftpOptions'] = options
        }
    }
}