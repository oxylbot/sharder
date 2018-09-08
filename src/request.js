const config = require("../config");
const { REST: constants } = require("./constants");
const superagent = require("superagent");

class Request {
	constructor() {
		this.base = `${constants.BASE_URL}/v${constants.VERSION}`;
		this.request = superagent;
	}

	get(path) {
		this.request.get(this.base + path);
	}

	post(path) {
		this.request.post(this.base + path);
	}

	put(path) {
		this.request.put(this.base + path);
	}

	patch(path) {
		this.request.patch(this.base + path);
	}

	delete(path) {
		this.request.delete(this.base + path);
	}

	send(body) {
		this.request.send(body);
	}

	async then(success, failure) {
		try {
			const { body } = await this.request.set("Authorization", `Bot ${config.token}`);
			success(body);
		} catch(err) {
			failure(err);
		}
	}
}

module.exports = () => new Request();
