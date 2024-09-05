"use strict";

const ping = require('ping');
const {NodeSSH} = require('node-ssh')
const {Rsync} = require('rsync2');

const timeString = function () {
    const now = new Date();
    const minutes = '0' + now.getMinutes();
    return '[' + now.getHours() + ':' + minutes.slice(-2) + ']: ';
}

class Syncer {
    /**
     * @type {Configurator | null}
     *
     * @memberof Syncer
     */
    configurator = null;

    /**
     * @type {Messenger | null}
     *
     * @memberof Syncer
     */
    messenger = null;

    uploadFileFailed = [];

    sftp = new NodeSSH();
    rsync = new Rsync();
    timeInterval = 0

    constructor(configurator, messenger) {
        this.configurator = configurator
        this.messenger = messenger
        this.timeInterval = setInterval( async () => {
            if (this.configurator.isCorrect() && this.isConnected() && this.uploadFileFailed.length) {
                let outputArray = JSON.parse(JSON.stringify(this.uploadFileFailed))
                this.uploadFileFailed = [];

                for (let element of outputArray) {
                    await this.uploadFile(element.destination,element.filename, element.isDirectory)
                }
            }
        }, 2000)
    }
    connect() {
        if (!this.configurator.isCorrect()) {
            this.messenger.error('Config not load')
            return false
        }
        this.checkConnection().then((result) => {
            if (!result.alive) {
                this.messenger.error('Can\'t connect to server')
            } else {
                this.sftp.connect(this.configurator.config.sftpOptions).then(() => {
                    this.messenger.infoSuccess('Config load success: ' + this.configurator.config.rootPath)
                }, (error)=> {
                    console.warn("SFTP:" +  JSON.stringify(error))
                })
                if (this.configurator.config.useRsync) {
                    this.rsync = new Rsync(this.configurator.config.rsyncPath)

                    this.rsync.exclude(this.configurator.config.rsyncExclude.length ? this.configurator.config.rsyncExclude: this.configurator.config.ignorePatterns);
                    this.rsync.shell(`${this.configurator.config.sshPath} -p 22`).setFlags('zarv')
                }
            }
        }).catch((e) => {
            console.warn("SFTP:" +  JSON.stringify(e))
            this.messenger.error('Can\'t connect to server')
        })
    }

    checkConnection() {
        if (!this.configurator.isCorrect()) {
            this.messenger.error('Config not load')
            return Promise.reject()
        }
        return ping.promise.probe(this.configurator.config.sftpOptions.host, {timeout: 5})
    }
    isConnected() {
        if (!this.configurator.isCorrect()) {
            return false
        }
        return this.sftp.isConnected()
    }
    async uploadFileSSH(destination, filename, isDirectory) {
        if (isDirectory) {
            const failed = []
            const successful = []
            await this.sftp.putDirectory(
                './' + filename,
                destination,
                {
                    recursive: true,
                    concurrency: 5,
                    validate: function(itemPath) {
                        const baseName = path.basename(itemPath)
                        return !match(baseName, data.ignorePatterns) // do not allow node_modules
                    },
                    tick: function(localPath, remotePath, error) {
                        if (error) {
                            failed.push(remotePath)
                        } else {
                            successful.push(remotePath)
                        }
                    }
                }
            )
            let time = timeString();
            for (const success of successful) {
                this.messenger.info(time + ' Uploading to -> ' + success)
            }
            for (const fail of failed) {
                this.messenger.error(time + ' Uploading to -> ' + fail)
            }
            this.messenger.infoSuccess(time + ' Succesfully uploaded ' + successful.length + ' file(s)')
        } else {
            await this.sftp.putFile('./' + filename, destination);
            this.messenger.infoSuccess(time + ' Succesfully uploaded ' + filename)
        }
    }
    async uploadFileRsync(destination, filename, isDirectory) {
        let time = timeString();
        let destinationFirstPart = this.configurator.config.sftpOptions.username + '@' + this.configurator.config.sftpOptions.host + ':';
        let destinationLastPart = (isDirectory ? destination.replace(/\/[^/]+$/, '') : destination );
        this.rsync._sources = [];
        this.rsync._sources.push(filename)
        this.rsync._destination = destinationFirstPart + destinationLastPart
        await this.rsync.execute().then((exitCode) => {
            this.messenger.infoSuccess(time + ' Succesfully uploaded ' + filename)
        }).catch((error) => {

            console.warn("SFTP:" +  JSON.stringify(error))
            if (error.code == 12) {
                let parent = destination
                parent = parent.replace(/[^/]+$/, '')
                parent = parent.replace('./', '')
                this.sftp.execCommand('mkdir -p ' + parent,{ cwd:'/var/www' });
            }
            this.messenger.error(time + 'Error with Uploading to -> ' + destination)
            this.uploadFileFailed.push({destination, filename, isDirectory})
        });
    }
    async uploadFile(destination, filename, isDirectory) {
        if (!this.configurator.isCorrect()) {
            this.uploadFileFailed.push({destination, filename, isDirectory})
            this.messenger.error('Can\'t connect to server')
        }
        if (!this.configurator.config.useRsync) {
            await this.uploadFileSSH(destination, filename, isDirectory);
        } else {
            await this.uploadFileRsync(destination, filename, isDirectory);
        }
        return false
    }
    deleteFile(destination) {
        this.sftp.execCommand('rm ' + destination,{ cwd:'/var/www' });
        this.sftp.execCommand('rm ' + destination + '/*',{ cwd:'/var/www' });
        this.sftp.execCommand('rmdir ' + destination, { cwd:'/var/www' });
    }
}

module.exports = Syncer;