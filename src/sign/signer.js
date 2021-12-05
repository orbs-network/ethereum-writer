import {TxData} from "@ethereumjs/tx";

const { Transaction } = require("@ethereumjs/tx");
const Common = require("@ethereumjs/common")
const fetch = require("node-fetch");
const { encode } = require("rlp");
const { keccak256, isHexStrict, hexToNumber } = require("web3-utils");
const NodeSignInputBuilder = require("./node-sign-input-builder");
const NodeSignOutputReader = require("./node-sign-output-reader");

function getSignatureParameters(signature, chainId) {
    if (!isHexStrict(signature)) {
        throw new Error(`Given value "${signature}" is not a valid hex string.`);
    }

    const r = signature.slice(0, 66);
    const s = `0x${signature.slice(66, 130)}`;
    let v = `0x${signature.slice(130, 132)}`;
    v = hexToNumber(v);

    if (![27, 28].includes(v)) v += 27;

    v = chainId * 2 + 8 + v;// see https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md
    return {
        r,
        s,
        v
    };
}

export class Signer {
    constructor(host) {
        this.host = host;
    }

    async _sign(payload) {
        const body = new NodeSignInputBuilder(payload).build();

        const res = await fetch(`${this.host}/eth-sign`, {
            method: "post",
            body:  body,
            headers: { "Content-Type": "application/membuffers" },
        });

        if (!res.ok) {
            throw new Error(`Bad response: ${res.statusText}`);
        }

        const data = await res.buffer();
        return new NodeSignOutputReader(data).getSignature();
    }

    async sign(transaction, chainId) {
        // we are going to ignore privateKey completely - and use our signer service instead

        const common = Common.default.custom({ chainId: chainId })
        const ethTx = new Transaction(transaction, { common });
        const payload = encode(ethTx.getMessageToSign(false));
        const signature = await this._sign(payload);

        const { r, s, v } = getSignatureParameters("0x" + signature.toString("hex"), chainId);
        const signedTxData = {...transaction, v,r,s}
        const signedTx = Transaction.fromTxData(signedTxData, { common })
        const from = signedTx.getSenderAddress().toString()

        console.log(`signedTx: 0x${signedTx.serialize().toString('hex')}\nfrom: ${from}`)



        const validationResult = signedTx.validate(true);

        if (validationResult !== '') {
            // TODO throw instead of print
            console.error(`XXXXXXX TransactionSigner Error: ${validationResult}`);
        }

        const rlpEncoded = signedTx.serialize().toString('hex');
        const rawTransaction = '0x' + rlpEncoded;
        const transactionHash = keccak256(rawTransaction);

        return {
            messageHash: Buffer.from(signedTx.hash(false)).toString('hex'),
            v: '0x' + Buffer.from(signedTx.v).toString('hex'),
            r: '0x' + Buffer.from(signedTx.r).toString('hex'),
            s: '0x' + Buffer.from(signedTx.s).toString('hex'),
            rawTransaction,
            transactionHash
        };
    }
}
