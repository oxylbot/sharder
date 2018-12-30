const path = require("path");
const protobuf = require("protobufjs");
const zmq = require("zeromq");

class CacheSocket {
	constructor(address) {
		this.socket = zmq.socket("push");
		this.socket.connect(address);

		this.proto = {};

		protobuf.load(path.resolve(__dirname, "..", "..", "Cache.proto")).then(root => {
			this.proto.CacheRequest = root.lookUpType("CacheRequest");
			this.proto.Member = root.lookUpType("Member");
			this.proto.Role = root.lookUpType("Role");
			this.proto.User = root.lookUpType("User");
			this.proto.Channel = root.lookUpType("Channel");
			this.proto.Overwrite = root.lookUpType("Overwrite");
			this.proto.Guild = root.lookUpType("Guild");
			this.proto.VoiceState = root.lookUpType("VoiceState");
		});
	}

	send(message) {
		this.socket.send(message);
	}

	close() {
		this.socket.close();
	}
}

module.exports = CacheSocket;
