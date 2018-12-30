const path = require("path");
const protobuf = require("protobufjs");
const zmq = require("zeromq");

class CacheSocket {
	constructor(address) {
		this.socket = zmq.socket("push");
		this.socket.connect(address);
	}

	send(message) {

	}
}

module.exports = CacheSocket;
