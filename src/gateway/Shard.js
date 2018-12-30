const cacheConverter = require("./cacheConverter");
const CompressionHandler = require("./CompressionHandler");
const { GATEWAY: constants } = require("../constants");
const EventEmitter = require("events");
const WebSocket = require("ws");

class Shard extends EventEmitter {
	constructor({ gatewayURL, shardID, totalShards, messageSocket, cacheSocket, token }) {
		super();

		gatewayURL += `?v=${constants.VERSION}&encoding=etf&compress=zlib-stream`;
		this.url = gatewayURL;

		this.token = token;
		this.id = shardID;
		this.totalShards = totalShards;
		this.messageSocket = messageSocket;
		this.cacheSocket = cacheSocket;

		this.reset();
	}

	reset(reconnect = false) {
		this.latency = 0;
		this.user = reconnect ? this.user : null;
		this.status = reconnect ? "resuming" : "disconnected";

		this.sessionID = reconnect ? this.sessionID : null;
		this.lastSequence = reconnect ? this.lastSequence : null;
		this.lastSentHeartbeat = null;

		if(this.heartbeatInterval) clearInterval(this.heartbeatInterval);
		this.heartbeatInterval = null;

		if(this.compressionHandler) this.compressionHandler.kill();
		this.compressionHandler = new CompressionHandler();
		this.compressionHandler.on("message", this.packet);

		if(this.ws) this.close();

		this.ws = new WebSocket(this.url);
		this.ws.on("message", this.compressionHandler.push.bind(this.compressionHandler));
	}

	close() {
		this.ws.close(1000);
		this.ws.removeAllListeners();
	}

	async send(data) {
		// TODO: check if websocket is open and add it to a queue, most likely a queue class
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
					case "RESUMED": {
						this.status = "ready";

						break;
					}

					case "READY": {
						this.emit("ready");

						this.status = "ready";
						this.user = packet.d.user;
						this.sessionID = packet.d.session_id;

						break;
					}

					case "GUILD_MEMBER_ADD": {
						this.cache("member", cacheConverter.member(packet.d));

						break;
					}

					case "GUILD_MEMBER_REMOVE": {
						this.request()
							.discord()
							.guild(packet.d.guild_id)
							.members()
							.get(packet.d.user.id)
							.delete()
							.run();

						break;
					}

					case "GUILD_MEMBER_UPDATE": {
						this.cache("member", cacheConverter.member(packet.d));

						break;
					}

					case "GUILD_ROLE_CREATE": {
						const role = Object.assign(packet.d.role, { guild_id: packet.d.guild_id });
						this.cache("role", cacheConverter.role(role));

						break;
					}

					case "GUILD_ROLE_UPDATE": {
						const role = Object.assign(packet.d.role, { guild_id: packet.d.guild_id });
						this.cache("role", cacheConverter.role(role));

						break;
					}

					case "GUILD_ROLE_DELETE": {
						this.request()
							.discord()
							.guild(packet.d.guild_id)
							.roles()
							.get(packet.d.role_id)
							.delete()
							.run();

						break;
					}

					case "MESSAGE_CREATE": {
						if(packet.d.type === 0 && !packet.d.webhook_id && !packet.d.author.bot) {
							this.messageSocket.send({
								id:	packet.d.id,
								channelID: packet.d.channel_id,
								authorID: packet.d.author.id,
								guildID: packet.d.guild_id,
								content: packet.d.content
							});
						}

						break;
					}

					case "USER_UPDATE": {
						this.cache("user", cacheConverter.user(packet.d));

						break;
					}

					case "GUILD_BAN_ADD": {
						// TODO

						break;
					}

					case "GUILD_BAN_REMOVE": {
						// TODO

						break;
					}

					case "GUILD_CREATE": {
						this.cache("guild", cacheConverter.guild(packet.d));

						break;
					}

					case "GUILD_UPDATE": {
						this.cache("guild", cacheConverter.guild(packet.d));

						break;
					}

					case "GUILD_DELETE": {
						if(packet.d.unavailable) return;
						this.request()
							.discord()
							.guild(packet.d.id)
							.delete()
							.run();

						break;
					}

					case "CHANNEL_DELETE": {
						this.request()
							.discord()
							.guild(packet.d.guild_id)
							.channels()
							.get(packet.d.id)
							.delete()
							.run();

						break;
					}

					case "CHANNEL_UPDATE": {
						this.cache("channel", cacheConverter.channel(packet.d));

						break;
					}

					case "CHANNEL_CREATE": {
						this.cache("channel", cacheConverter.channel(packet.d));

						break;
					}

					case "VOICE_STATE_UPDATE": {
						if(!packet.d.channel_id) {
							this.request()
								.discord()
								.guild(packet.d.guild_id)
								.voiceStates()
								.get(packet.d.user_id)
								.delete()
								.run();
						} else {
							this.cache("voiceState", cacheConverter.voiceState(packet.d));
						}

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

			case constants.OPCODES.HEARTBEAT: {
				this.heartbeat();
				break;
			}

			case constants.OPCODES.RECONNECT: {
				this.reset(true);
				break;
			}

			case constants.OPCODES.HEARTBEAT_ACK: {
				this.latency = Date.now() - this.lastSentHeartbeat;
			}
		}
	}

	resume() {
		this.status = "resuming";
		this.send({
			token: this.token,
			session_id: this.sessionID,
			seq: this.lastSequence
		});
	}

	identify() {
		this.send({
			op: constants.OPCODES.IDENTIFY,
			d: {
				token: this.token,
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
