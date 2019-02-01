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
		type = type.charAt(0).toUpperCase() + type.substring(1);
		const typeProto = this.proto.lookup(type);

		const verifyError = typeProto.verify(message);
		if(verifyError) throw new Error(verifyError);

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
