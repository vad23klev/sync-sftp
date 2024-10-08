"use strict";

const ping = require('ping');
const {NodeSSH} = require('node-ssh')
const {Rsync} = require('rsync2');
const fs = require('fs');

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
    isPaused = false

    sftp = new NodeSSH();
    rsync = new Rsync();
    timeInterval = 0

    constructor(configurator, messenger) {
        this.configurator = configurator
        this.messenger = messenger
        this.timeInterval = setInterval( async () => {
            if (this.isPaused) return

            if (this.uploadFileFailed.length && this.configurator.isCorrect() && this.isConnected()) {
                let outputArray = JSON.parse(JSON.stringify(this.uploadFileFailed))
                this.uploadFileFailed = [];

                for (let element of outputArray) {
                    await this.uploadFile(element.destination,element.filename, element.isDirectory)
                }
            }
        }, 2000)
    }
    connect() {
        if (this.isPaused) return false
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
                    console.warn("SyncSFTP:" +  JSON.stringify(error))
                })
                if (this.configurator.config.useRsync) {
                    this.rsync = new Rsync({executable: this.configurator.config.rsyncPath})

                    this.rsync.exclude(this.configurator.config.rsyncExclude.length ? this.configurator.config.rsyncExclude: this.configurator.config.ignorePatterns);
                    this.rsync.shell(`${this.configurator.config.sshPath} -p 22`).setFlags('zarv')
                }
            }
        }).catch((e) => {
            console.warn("SyncSFTP:" +  JSON.stringify(e))
            this.messenger.error('Can\'t connect to server')
        })
    }

    checkConnection() {
        if (this.isPaused) return Promise.reject()
        if (!this.configurator.isCorrect()) {
            this.messenger.error('Config not load')
            return Promise.reject()
        }
        return ping.promise.probe(this.configurator.config.sftpOptions.host, {timeout: 5})
    }
    isConnected() {
        if (this.isPaused) return false
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
        this.rsync._sources.push(`"${filename}"`)
        this.rsync._destination = `"${destinationFirstPart + destinationLastPart}"`
        await this.rsync.execute().then((exitCode) => {
            this.messenger.infoSuccess(time + ' Succesfully uploaded ' + filename)
        }).catch((error) => {

            console.warn("SyncSFTP:" +  JSON.stringify(error))
            if (error.code == 12 || error.code == 3) {
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
        if (this.isPaused) return false
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
    deleteFile(path) {
        if (this.isPaused) return false
        this.sftp.execCommand(`rm -rf "${path}"`,{ cwd:'/var/www' });
    }
    deleteFileList(list) {
        if (this.isPaused) return false
        let commandList = []
        for (let item of list) {
            let path = this.configurator.config.remotePath + '/' + item
            commandList.push(`rm -rf "${path}"`)
        }
        if (commandList.length) {
            console.log(commandList.join(' && ').replace(/\/\/+/g,'/'));
            this.sftp.execCommand(commandList.join(' && ').replace(/\/\/+/g,'/'),{ cwd:'/var/www' });
        }
    }
    async detectChanges() {
        if (this.isPaused) return false
        let text = ''
        let rsync = new Rsync({executable: this.configurator.config.rsyncPath})
        rsync.exclude(this.configurator.config.rsyncExclude.length ? this.configurator.config.rsyncExclude: this.configurator.config.ignorePatterns);
        // rsync.shell(`${this.configurator.config.sshPath} -p 22`)
        rsync.output((data) => {text += data.toString()},(data) => {console.warn(data.toString());} )
        let destinationFirstPart = this.configurator.config.sftpOptions.username + '@' + this.configurator.config.sftpOptions.host + ':';
        let destinationLastPart = this.configurator.config.remotePath;
        rsync._sources = [];
        rsync._sources.push(this.configurator.config.rootPath + '/')
        rsync._destination = destinationFirstPart + destinationLastPart
        rsync.set('dry-run')
        rsync.set('no-perms')
        rsync.set('no-owner')
        rsync.set('no-group')
        rsync.set('no-times')
        rsync.set('delete')
        rsync.set('recursive')
        rsync.set('links')
        rsync.set('checksum')
        rsync.set('itemize-changes')
        try {
            return rsync.execute().then(exitCode => {
                let lines = text.split(/\n/)
                lines = lines.filter(item => !RegExp(/^<f.\..+/).exec(item))
                let toUpload = lines.filter(item => RegExp(/^<.+/).exec(item)).map(item => item.replace(/^[^ ]+ +/, ''))
                let toDelete = lines.filter(item => RegExp(/\*deleting.+/).exec(item)).map(item => item.replace(/^[^ ]+ +/, ''))
                return {toUpload, toDelete}
            }).catch((error) => {
                console.warn("SyncSFTP:" +  JSON.stringify(error))
            })
        } catch (error) {
            console.warn("SyncSFTP:" +  JSON.stringify(error))
        }
    }
    async notifyAboutChanges() {
        if (this.commonChecks()) {
            this.detectChanges().then(({toUpload, toDelete}) => {
                for (let item of toUpload) {
                    this.messenger.info('Need to upload -> ' + item)
                }
                for (let item of toDelete) {
                    this.messenger.info('Need to delete -> ' + item)
                }
                this.messenger.infoSuccess('Total different size: ' + (toUpload.length + toDelete.length))
            }).catch((error) => {
                console.warn("SyncSFTP:" +  JSON.stringify(error))
            })
        }
    }
    async makeEqual() {
        if (this.commonChecks()) {
            this.detectChanges().then(({toUpload, toDelete}) => {
                for (let item of toUpload) {
                    let destination = this.configurator.config.remotePath + '/' + item;
                    destination = destination.replace(/\\/g, '/');
                    destination = destination.replace(/\/\/+/g, '/');
                    let time = timeString();
                    let isDirectory = false;
                    this.messenger.info(time + ' Uploading to -> ' + destination)
                    this.uploadFile(destination, this.configurator.config.rootPath + '/' + item, isDirectory)
                }
                this.deleteFileList(toDelete)
                for (let item of toDelete) {
                    this.messenger.infoSuccess('Deleted: ' + item)
                }
            }).catch((error) => {
                console.warn("SyncSFTP:" +  JSON.stringify(error))
            })
        }
    }
    commonChecks() {
        if (this.isPaused) return false
        if (!this.configurator.isCorrect()) {
            this.messenger.error('Config not load')
            return false
        }
        if (!this.configurator.config.useRsync) {
            this.messenger.error('For RSYNC Users only!')
            return false
        }
        if (!this.isConnected()) {
            this.messenger.error('Can\'t connect to server')
            return false
        }
        return true
    }
    toggle() {
        this.isPaused = !this.isPaused
    }
}

module.exports = Syncer;