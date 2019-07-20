const zmq = require("zeromq");

class CacheSocket {
	constructor() {
		this.socket = zmq.socket("push");

		this.proto = null;
	}

	start(proto) {
		this.proto = proto;
		this.socket.connect(`tcp://gateway-cache-zmq-proxy:${process.env.GATEWAY_CACHE_ZMQ_PROXY_SERVICE_PORT_PULL}`);
	}

	send(type, message) {
		type = type.charAt(0).toUpperCase() + type.substring(1);
		console.log("Sending a", type, "cache with data keys", Object.keys(message));
		const typeProto = this.proto.lookup(type);

		const verifyError = typeProto.verify(message);
		if(verifyError) {
			console.log("Invalid message:", message);
			throw new Error(verifyError);
		}

		this.socket.send(this.proto.lookup("CacheRequest").encode({
			type,
			data: typeProto.encode(message).finish()
		}).finish());
	}

	close() {
		this.socket.close();
	}
}

module.exports = CacheSocket;
