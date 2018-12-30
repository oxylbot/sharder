const path = require("path");
const protobuf = require("protobufjs");
const zmq = require("zeromq");

class CacheSocket {
	constructor(address) {
		this.socket = zmq.socket("push");
		this.socket.connect(address);

		this.proto = {};

		protobuf.load(path.resolve(__dirname, "..", "..", "protobuf", "Cache.proto")).then(root => {
			this.proto.CacheRequest = root.lookupType("CacheRequest");
			this.proto.requests = {
				Member: root.lookupType("Member"),
				Role: root.lookupType("Role"),
				User: root.lookupType("User"),
				Channel: root.lookupType("Channel"),
				Overwrite: root.lookupType("Overwrite"),
				Guild: root.lookupType("Guild"),
				VoiceState: root.lookupType("VoiceState")
			};
		});
	}

	send(type, message) {
		const request = this.proto.requests[type.charAt(1).toUpperCase() + type.substring(1)];
		if(!request) throw new TypeError(`Given ${type} but no cache request with that type was found`);

		const verifyError = request.verify(message);
		if(verifyError) throw new Error(verifyError);

		const buffer = this.proto.CacheRequest
			.encode({ [type]: message })
			.finish();

		this.socket.send(buffer);
	}

	close() {
		this.socket.close();
	}
}

module.exports = CacheSocket;
