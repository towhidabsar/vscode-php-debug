import { assert } from 'chai'
import { ProxyConnect } from '../proxyConnect'
import { encode } from 'iconv-lite'
import { ENCODING } from '../xdebugConnection'

describe('ProxyConnect', () => {
    function _xml(cmd: string, success: number, msg = '', id = 0): Buffer {
        let err = `<proxy${cmd} success="${success}"><error id="${id}"><message>${msg}</message></error></proxy${cmd}>`
        return encode(`<?xml version="1.0" encoding="UTF-8"?>\n${err}`, ENCODING)
    }

    const host = 'host'
    const port = 9001
    let conn: ProxyConnect
    let msgs: Map<string, string>

    beforeEach(() => {
        conn = new ProxyConnect(host, port, 1, undefined, 3000)
        conn._socket.connect = () => {}
        msgs = conn.msgs
    })

    it('should timeout', (done: MochaDone) => {
        conn.on('error', (err: Error) => {
            assert.equal(err.message, msgs.get('timeout'))
            done()
        })

        assert.exists(conn)
        conn._socket.emit('error', new Error(msgs.get('timeout')))
    })

    it('should fail if proxy is unreachable', (done: MochaDone) => {
        conn.on('error', (err: Error) => {
            assert.equal(err.message, msgs.get('resolve'))
            done()
        })

        conn._socket.emit('lookup', new Error(msgs.get('resolve')))
    })

    it('should throw an error for duplicate IDE key', (done: MochaDone) => {
        conn.on('error', (err: Error) => {
            assert.equal(msgs.get('duplicateKey'), err.message)
            done()
        })

        conn._socket.emit('data', _xml('init', 0, msgs.get('duplicateKey')))
    })

    it('should request registration', (done: MochaDone) => {
        conn.on('info', (str: string) => {
            assert.equal(str, msgs.get('registerInfo'))
            done()
        })

        conn.sendProxyInitCommand()
    })

    it('should be registered', (done: MochaDone) => {
        conn.on('response', (str: string) => {
            assert.equal(str, msgs.get('registerSuccess'))
            done()
        })

        conn.sendProxyInitCommand()
        conn._socket.emit('data', _xml('init', 1))
    })

    it('should request deregistration', async (done: MochaDone) => {
        conn.on('info', (str: string) => {
            assert.equal(str, msgs.get('deregisterInfo'))
            done()
        })
        conn._socket.emit('data', _xml('init', 1))

        await new Promise((resolve) => conn.sendProxyStopCommand(resolve))
    })

    it('should be deregistered', (done: MochaDone) => {
        conn.on('response', (str: string) => {
            assert.equal(str, msgs.get('deregisterSuccess'))
            done()
        })
        conn._socket.emit('data', _xml('stop', 1))
    })

    it('should throw an error for nonexistent IDE key', (done: MochaDone) => {
        conn.on('error', (err: Error) => {
            assert.equal(msgs.get('nonexistentKey'), err.message)
            done()
        })

        conn._socket.emit('data', _xml('stop', 0, msgs.get('nonexistentKey')))
    })
})
