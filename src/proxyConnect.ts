import { Socket } from 'net'
import { DOMParser } from 'xmldom'
import { EventEmitter } from 'events'
import { decode } from 'iconv-lite'
import { ENCODING } from './xdebugConnection'

export const DEFAULTIDEKEY = 'vsc'

/** Informs proxy of incoming connection and who to pass data back to. */
export class ProxyConnect extends EventEmitter {
    /** Port editor is listening on (default: 9001 */
    private _port: number
    /** a CLI binary boolean option (default: 1) */
    private _allowMultipleSessions: number
    /** host domain or ip (default: 127.0.0.1) */
    private _host: string
    /** unique key that allows the proxy to match requests to your editor. (default: DEFAULTIDEKEY) */
    private _key: string
    /** proxy response data parser */
    private _parser = new DOMParser()
    /** tcp connection to communicate with proxy server */
    public _socket = new Socket()
    /** milliseconds to wait before giving up */
    private _timeout: number
    public msgs : Map<string, string>
    private _isRegistered = false
    private _resolve : Function

    constructor(host = '127.0.0.1', port = 9001, allowMultipleSessions = 1, key = DEFAULTIDEKEY, timeout = 3000) {
        super()
        this._allowMultipleSessions = allowMultipleSessions
        this._host = host
        this._key = key
        this._port = port
        this._timeout = timeout
        this.msgs = new Map([
            ['deregisterInfo', `Deregistering ${this._key} with proxy @ ${this._host}:${this._port}`],
            ['deregisterSuccess', 'Deregistration successful'],
            ['duplicateKey', 'IDE Key already exists'],
            ['nonexistentKey', 'No IDE key'],
            ['registerInfo', `Registering ${this._key} with proxy @ ${this._host}:${this._port}`],
            ['registerSuccess', 'Registration successful'],
            ['resolve', `Failure to resolve ${this._host}`],
            ['timeout', `Timeout connecting to ${this._host}:${this._port}`],
            ['defaultError', 'Unknown Error'],
        ])
        this._socket.on('error', (err: Error) => {
            // Propagate error up
            this._socket.end()
            this.emit('error', err instanceof Error ? err : new Error(err))
        })
        this._socket.on('lookup', (err: Error | null, address: string, family: string | null, host: string) => {
            if (err instanceof Error) {
                this._socket.emit('error', `${err.message}${address || host || ''}`)
            }
        })
        this._socket.on('data', data => this._responseStrategy(data))
        this._socket.setTimeout(this._timeout)
        this._socket.on('timeout', () => {
            this._socket.emit('error', this.msgs.get('timeout'))
        })
    }

    private _command(cmd: string, msg?: string) {
        this.emit('info', msg)
        this._socket.connect(this._port, this._host, () => this._socket.end(cmd))
    }

    /** Register/Couples ideKey to IP so the proxy knows who to send what */
    public sendProxyInitCommand() {
        if (!this._isRegistered) {
            this._command(
                `proxyinit -k ${this._key} -p ${this._port} -m ${this._allowMultipleSessions}`,
                this.msgs.get('registerInfo')
            )
        }
    }

    /** Deregisters/Decouples ideKey from IP, allowing others to use the ideKey */
    public sendProxyStopCommand(resolve:Function) {
        if (this._isRegistered) {
            this._resolve = resolve
            this._command(`proxystop -k ${this._key}`, this.msgs.get('deregisterInfo'))
        }
    }

    /** Parse data from response server and emit the relevant notification. */
    private _responseStrategy(data: Buffer) {
        const documentElement = this._parser.parseFromString(decode(data, ENCODING), 'application/xml').documentElement
        const isSuccessful = documentElement.getAttribute('success') === '1'
        const error = documentElement.firstChild
        if (isSuccessful && documentElement.nodeName === 'proxyinit') {
            this._isRegistered = true
            this.emit('response', this.msgs.get('registerSuccess'))
        } else if (isSuccessful && documentElement.nodeName === 'proxystop') {
            this._isRegistered = false
            this.emit('response', this.msgs.get('deregisterSuccess'))
            this._resolve()
        } else if (error && error.nodeName === 'error' && error.firstChild && error.firstChild.textContent) {
            this._socket.emit('error', error.firstChild.textContent)
        } else {
            this._socket.emit('error', this.msgs.get('defaultError'))
        }
    }
}
