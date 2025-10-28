import {Rsync} from 'rsync2'
import * as fs from 'fs';
import * as ping from 'ping';
import { NodeSSH } from 'node-ssh';
import { Configurator } from './Configurator'
import { Messenger } from './Messenger'
import * as path from 'path'
import {timeString, match} from './utils';
import unixify = require('unixify');
import * as vscode from 'vscode';

type UploadFileFailed = {
    destination: string,
    filename: string,
    isDirectory: boolean
}
export class Syncer {

    configurator?:Configurator
    messenger?:Messenger
    logger?:vscode.LogOutputChannel

    uploadFileFailed:UploadFileFailed[] = [];
    uploadFilePending:string[] = [];
    deleteFilePending:string[] = [];
    isPaused = false

    sftp = new NodeSSH();
    rsync = new Rsync();
    rsyncList = new Rsync();

    timeInterval?: NodeJS.Timeout;
    deleteFileInterval?: NodeJS.Timeout;
    uploadFileInterval?: NodeJS.Timeout;

    constructor(configurator: Configurator, messenger: Messenger, logger:vscode.LogOutputChannel) {
        this.configurator = configurator
        this.messenger = messenger
        this.logger = logger
    }
    startTimers() {
        if (this.configurator?.isCorrect()) {
            if (this.timeInterval) {
                clearInterval(this.timeInterval)
            }
            if (this.deleteFileInterval) {
                clearInterval(this.deleteFileInterval)
            }
            if (this.uploadFileInterval) {
                clearInterval(this.uploadFileInterval)
            }
            if (this.configurator?.config?.useRsync) {
                this.uploadFileInterval = setInterval( async () => {
                    if (this.isPaused) return
                    this.logger?.trace("uploadFilePending", this.uploadFilePending);
                    if (this.uploadFilePending.length && this.configurator?.isCorrect() && this.isConnected()) {
                        let outputArray = JSON.parse(JSON.stringify(this.uploadFilePending)).map((item:string) => unixify(item.replace(`${this.configurator?.config?.rootPath}`, '.')))
                        this.uploadFilePending = [];
                        this.uploadListRSync(outputArray)
                    }
                }, 2000)

                this.deleteFileInterval = setInterval( async () => {
                    if (this.isPaused) return

                    this.logger?.trace("deleteFilePending", this.deleteFilePending);
                    if (this.deleteFilePending.length && this.configurator?.isCorrect() && this.isConnected()) {
                        let outputArray = JSON.parse(JSON.stringify(this.deleteFilePending))
                        this.deleteFilePending = [];
                        this.deleteFileListPending(outputArray)
                    }
                }, 2000)
            } else {
                this.timeInterval = setInterval( async () => {
                    if (this.isPaused) return

                    if (this.uploadFileFailed.length && this.configurator?.isCorrect() && this.isConnected()) {
                        let outputArray = JSON.parse(JSON.stringify(this.uploadFileFailed))
                        this.uploadFileFailed = [];

                        for (let element of outputArray) {
                            await this.uploadFile(element.destination,element.filename, element.isDirectory)
                        }
                    }
                }, 2000)
            }
        }
    }
    connect() {
        if (this.isPaused) return false
        if (!this.configurator?.isCorrect()) {
            this.messenger?.error('Config not load')
            return false
        }
        this.checkConnection().then((result) => {
            if (!result.alive) {
                this.messenger?.error('Can\'t connect to server')
            } else {
                this.sftp.connect(this.configurator?.config?.sftpOptions).then(() => {
                    this.messenger?.infoSuccess('Config load success: ' + this.configurator?.config?.rootPath)
                }, (error: any)=> {
                    this.logger?.warn(JSON.stringify(error))
                })
                if (this.configurator?.config?.useRsync) {
                    this.rsync = new Rsync({executable: this.getRsyncPath()})

                    this.rsync.exclude(this.configurator.config.rsyncExclude.length ? this.configurator.config.rsyncExclude: this.configurator.config.ignorePatterns);
                    this.rsync.shell(`${this.configurator.config.sshPath} -p 22`).setFlags('zarv')
                    this.rsyncList = new Rsync({executable: this.getRsyncPath()})

                    this.rsyncList.exclude(this.configurator.config.rsyncExclude.length ? this.configurator.config.rsyncExclude: this.configurator.config.ignorePatterns);
                    this.rsyncList.shell(`${this.configurator.config.sshPath} -p 22`).setFlags('zarv')
                    let destinationFirstPart = this.configurator.config.sftpOptions?.username + '@' + this.configurator.config.sftpOptions?.host + ':';
                    let destinationLastPart = this.configurator.config.remotePath;
                    this.rsyncList._sources = [];
                    this.rsyncList._sources.push(`${this.configurator.config.rsyncRootPath}`)
                    this.rsyncList._destination = `"${destinationFirstPart + destinationLastPart}"`
                    this.rsyncList.set('files-from', `${this.configurator.config.rsyncRootPath}.vscode/.file-list`)
                }
            }
        }).catch((e) => {
            this.logger?.warn(JSON.stringify(e))
            this.messenger?.error('Can\'t connect to server')
        })
    }

    checkConnection() {
        if (this.isPaused) return Promise.reject()
        if (!this.configurator?.isCorrect()) {
            this.messenger?.error('Config not load')
            return Promise.reject()
        }
        return ping.promise.probe(this.configurator.config?.sftpOptions?.host ?? '', {timeout: 5})
    }
    isConnected() {
        if (this.isPaused) return false
        if (!this.configurator?.isCorrect()) {
            return false
        }
        return this.sftp.isConnected()
    }
    async uploadFileSSH(destination:string, filename:string, isDirectory: boolean) {
        const ignorePatterns = this.configurator?.config?.ignorePatterns ?? []
        if (isDirectory) {
            const failed:string[] = []
            const successful:string[] = []
            await this.sftp.putDirectory(
                './' + filename,
                destination,
                {
                    recursive: true,
                    concurrency: 5,
                    validate: function(itemPath:string) {
                        const baseName = path.basename(itemPath)
                        return match(baseName, ignorePatterns) // do not allow node_modules
                    },
                    tick: function(localPath:string, remotePath:string, error:any) {
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
                this.messenger?.info(time + ' Uploading to -> ' + success)
            }
            for (const fail of failed) {
                this.messenger?.error(time + ' Uploading to -> ' + fail)
            }
            this.messenger?.infoSuccess(time + ' Successfully uploaded ' + successful.length + ' file(s)')
        } else {
            let time = timeString();
            await this.sftp.putFile('./' + filename, destination);
            this.messenger?.infoSuccess(time + ' Successfully uploaded ' + filename)
        }
    }
    async uploadListRSync (list: string[]) {
        let time = timeString();
        let text = list.join('\n');
        fs.writeFileSync(`${this.configurator?.config?.rootPath}/.vscode/.file-list`, text, 'utf8');
        if (this.configurator?.config?.verbose) {
            this.logger?.debug(this.rsyncList.command())
        }
        await this.rsyncList.execute().then(() => {
            this.messenger?.infoSuccess(time + ' Successfully uploaded ' + list.join('<br>'))
        }).catch((error:any) => {
            if (JSON.stringify(error) === '{}') {
                this.messenger?.infoSuccess(time + ' Successfully uploaded ' + list.join('<br>'))
            } else {
                this.logger?.warn(JSON.stringify(error))
            }
        });

    }
    async uploadFileRsync(destination:string, filename:string, isDirectory: boolean) {
        let time = timeString();
        let destinationFirstPart = this.configurator?.config?.sftpOptions?.username + '@' + this.configurator?.config?.sftpOptions?.host + ':';
        let destinationLastPart = (isDirectory ? destination.replace(/\/[^/]+$/, '') : destination );
        this.rsync._sources = [];
        this.rsync._sources.push(`"${filename}"`)
        this.rsync._destination = `"${destinationFirstPart + destinationLastPart}"`
        await this.rsync.execute().then(() => {
            this.messenger?.infoSuccess(time + ' Successfully uploaded ' + filename)
        }).catch((error:any) => {
            this.logger?.warn(JSON.stringify(error))
            if (error.code == 12 || error.code == 3) {
                let parent = destination
                parent = parent.replace(/[^/]+$/, '')
                parent = parent.replace('./', '')
                this.sftp.execCommand('mkdir -p ' + parent,{ cwd:'/var/www' });
            }
            this.messenger?.error(time + 'Error with Uploading to -> ' + destination)
            this.uploadFileFailed.push({destination, filename, isDirectory})
        });
    }
    async uploadFile(destination:string, filename:string, isDirectory: boolean):Promise<boolean> {
        if (this.isPaused) return false
        if (!this.configurator?.isCorrect()) {
            this.uploadFileFailed.push({destination, filename, isDirectory})
            this.messenger?.error('Can\'t connect to server')
        }
        if (!this.configurator?.config?.useRsync) {
            await this.uploadFileSSH(destination, filename, isDirectory);
        } else {
            this.uploadFilePending.push(filename)
        }
        return false
    }
    deleteFile(path:string) {
        if (this.isPaused) return false
        if (!this.configurator?.config?.useRsync) {
            this.sftp.execCommand(`rm -rf "${path}"`,{ cwd:'/var/www' });
        } else {
            this.deleteFilePending.push(path)
        }
    }
    deleteFileList(list:string[]) {
        if (this.isPaused) return false
        let commandList = []
        for (let item of list) {
            let path = this.configurator?.config?.remotePath + '/' + item
            commandList.push(`rm -rf "${path}"`)
        }
        if (commandList.length) {
            if (this.configurator?.config?.verbose) {
                this.logger?.debug(commandList.join(' && ').replace(/\/\/+/g,'/'));
            }
            this.sftp.execCommand(commandList.join(' && ').replace(/\/\/+/g,'/'),{ cwd:'/var/www' });
        }
    }

    deleteFileListPending(list:string[]) {
        if (this.isPaused) return false
        let commandList = []
        for (let item of list) {
            let path = item
            commandList.push(`rm -rf "${path}"`)
        }
        if (commandList.length) {
            let time = timeString();

            if (this.configurator?.config?.verbose) {
                this.logger?.debug(commandList.join(' && ').replace(/\/\/+/g,'/'));
            }
            this.sftp.execCommand(commandList.join(' && ').replace(/\/\/+/g,'/'),{ cwd:'/var/www' });
            this.messenger?.infoSuccess(time + ' Successfully deleted ' + list.join('<br>'))
        }
    }
    async detectChanges() {
        if (this.isPaused) return false
        let text = ''
        let rsync = new Rsync({executable: this.getRsyncPath()})
        rsync.exclude(this.configurator?.config?.rsyncExclude.length ? this.configurator?.config?.rsyncExclude: this.configurator?.config?.ignorePatterns);
        rsync.shell(`${this.configurator?.config?.sshPath} -p 22`)
        rsync.output((data:any) => {text += data.toString()},(data:any) => {this.logger?.warn(data.toString());} )
        let destinationFirstPart = this.configurator?.config?.sftpOptions?.username + '@' + this.configurator?.config?.sftpOptions?.host + ':';
        let destinationLastPart = this.configurator?.config?.remotePath;
        rsync._sources = [];
        rsync._sources.push(this.configurator?.config?.rsyncRootPath)
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

        if (this.configurator?.config?.verbose) {
            this.logger?.debug(rsync.command())
        }
        try {
            return rsync.execute().then(() => {
                let lines = text.split(/\n/)
                lines = lines.filter(item => !RegExp(/^<f.\..+/).exec(item))
                let toUpload = lines.filter(item => RegExp(/^<.+/).exec(item)).map(item => item.replace(/^[^ ]+ +/, ''))
                let toDelete = lines.filter(item => RegExp(/\*deleting.+/).exec(item)).map(item => item.replace(/^[^ ]+ +/, ''))
                return {toUpload, toDelete}
            }).catch((error:any) => {
                this.logger?.warn(JSON.stringify(error))
            })
        } catch (error) {
            this.logger?.warn(JSON.stringify(error))
        }
    }
    async notifyAboutChanges() {
        if (this.commonChecks()) {
            this.detectChanges().then(({toUpload, toDelete}) => {
                for (let item of toUpload) {
                    this.messenger?.info('Need to upload -> ' + item)
                }
                for (let item of toDelete) {
                    this.messenger?.info('Need to delete -> ' + item)
                }
                this.messenger?.infoSuccess('Total different size: ' + (toUpload.length + toDelete.length))
            }).catch((error) => {
                this.logger?.warn(JSON.stringify(error))
            })
        }
    }
    async makeEqual() {
        if (this.commonChecks()) {
            this.detectChanges().then(({toUpload, toDelete}) => {
                toUpload = toUpload.map((item:string) => './' + item);
                this.uploadListRSync(toUpload)
                this.deleteFileList(toDelete)
                for (let item of toDelete) {
                    this.messenger?.infoSuccess('Deleted: ' + item)
                }
            }).catch((error) => {
                this.logger?.warn(JSON.stringify(error))
            })
        }
    }
    commonChecks() {
        if (this.isPaused) return false
        if (!this.configurator?.isCorrect()) {
            this.messenger?.error('Config not load')
            return false
        }
        if (!this.configurator?.config?.useRsync) {
            this.messenger?.error('For RSYNC Users only!')
            return false
        }
        if (!this.isConnected()) {
            this.messenger?.error('Can\'t connect to server')
            return false
        }
        return true
    }
    toggle() {
        this.isPaused = !this.isPaused
    }
    getRsyncPath() {
        let result = ''
        if (this.configurator?.config?.useRsync) {
            if (this.configurator?.config?.useRsyncPassword) {
                result += `${this.configurator.config.sshpassPath} -p '${this.configurator?.config?.password}' `
            }
            result += this.configurator.config.rsyncPath
        }
        return result
    }
}
