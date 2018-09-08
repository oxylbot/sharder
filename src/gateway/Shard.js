const CompressionHandler = require("./CompressionHandler");
const config = require("../config");
const { GATEWAY: constants } = require("../constants");
const EventEmitter = require("events");
const WebSocket = require("ws");

class Shard extends EventEmitter {
	constructor(url, shard, totalShards) {
		super();

		url += `?v=${constants.VERSION}&encoding=etf&compress=zlib-stream`;
		this.url = url;

		this.id = shard;
		this.totalShards = totalShards;

		this.reset();
	}

	reset() {
		this.latency = 0;
		this.user = null;
		this.ready = false;
		this.status = "disconnected";

		this.sessionID = null;
		this.lastSentHeartbeat = null;
		this.heartbeatInterval = null;
		this.lastSequence = null;

		if(this.compressionHandler) this.compressionHandler.kill();
		this.compressionHandler = new CompressionHandler();
		this.compressionHandler.on("message", this.packet);

		if(this.ws) {
			this.ws.terminate();
			this.ws.removeAllListeners();
		}

		this.ws = new WebSocket(this.url);
		this.ws.on("message", this.compressionHandler.push.bind(this.compressionHandler));
	}

	async send(data) {
		// TODO: check if websocket is open and add it to a queue, most likely a queue class that can double for REST api
		this.ws.send(this.compressionHandler.prepareForSending(data));
	}

	heartbeat() {
		this.lastSentHeartbeat = Date.now();

		this.send({
			op: constants.OPCODES.HEARTBEAT,
			d: this.lastSequence
		});
	}

	async packet(packet) {
		switch(packet.op) {
			case constants.OPCODES.DISPATCH: {
				switch(packet.t) {
					case "READY": {
						this.emit("ready");
						this.user = packet.d.user;
						this.sessionID = packet.d.session_id;

						break;
					}
				}

				break;
			}

			case constants.OPCODES.HELLO: {
				if(this.heartbeatInterval) clearInterval(this.heartbeatInterval);
				this.heartbeatInterval = setInterval(() => this.heartbeat(), packet.d.heartbeat_interval);

				if(this.sessionID) this.resume();
				else this.identify();

				this.heartbeat();
				break;
			}

			case constants.OPCODES.INVALID_SESSION: {
				this.lastSequence = 0;
				this.sessionID = null;

				this.identify();

				break;
			}
		}
	}

	resume() {
		this.status = "resuming";
		this.send({
			token: config.token,
			session_id: this.sessionID,
			seq: this.lastSequence
		});
	}

	identify() {
		this.send({
			op: constants.OPCODES.IDENTIFY,
			d: {
				token: config.token,
				properties: {
					$os: process.platform,
					$browser: "Oxyl",
					$device: "Oxyl"
				},
				shard: [this.id, this.totalShards],
				presence: {
					since: null,
					game: {
						name: "o!help",
						type: 0
					},
					status: "online",
					afk: false
				}
			}
		});
	}
}

module.exports = Shard;
