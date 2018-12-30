const zmq = require("zeromq");

class CacheSocket {
	constructor(address) {
		this.socket = zmq.socket("push");
		this.address = address;

		this.proto = null;
	}

	start(proto) {
		this.proto = proto;
		this.socket.connect(this.address);
	}

	send(type, message) {
		if(type === "CacheRequest") throw new TypeError("Invalid cache type");
		const request = this.proto[type.charAt(1).toUpperCase() + type.substring(1)];
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
