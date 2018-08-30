const config = require("../config");
const { GATEWAY: constants } = require("./constants");
const EventEmitter = require("events");
const WebSocket = require("ws");

const { promisify } = require("util");
const zlib = require("zlib");
const inflate = promisify(zlib.inflate);

class Shard extends EventEmitter {
	constructor(url, shard) {
		super();

		this.url = url;

		this.ws = new WebSocket(url);
		this.ws._send = this.ws.send;
		this.ws.send = data => this.ws._send(JSON.stringify(data));
		this.ws.on("message", this.message.bind(this));

		this.latency = 0;
		this.lastSentHeartbeat = null;
		this.heartbeatInterval = null;

		this.compressed = true;

		this.identify();
	}

	async message(message) {
		if(this.compressed) message = await inflate(message);
		message = JSON.parse(message);

		switch(message.op) {
			case constants.OPCODES.THING: {
				break;
			}
		}
	}

	identify() {
		this.ws.send({});
	}
}

module.exports = Shard;
