const config = require("../config");
const { REST: constants } = require("./constants");
const superagent = require("superagent");

class Term {
	constructor(request, methods = []) {
		this.request = request;

		methods.forEach(method => {
			if(typeof method === "object") {
				this[method.use] = (...args) => {
					request.complete = false;
					return request[method.real](...args);
				};
			} else {
				this[method] = (...args) => {
					request.complete = false;
					return request[method](...args);
				};
			}
		});
	}

	run() {
		return this.request.run();
	}

	then(...args) {
		this.request.then(...args);
	}
}

class Request {
	constructor() {
		this.url = `${constants.BASE_URL}/v${constants.VERSION}`;
		this.token = config.token;
		this.request = superagent;
		this.method = "get";
		this.complete = false;

		return new Term(this, ["gateway"]);
	}

	addPath(...paths) {
		this.url += `/${paths.join("/")}`;
	}

	setMethod(method) {
		this.method = method;
	}

	gateway() {
		this.addPath("gateway");
		this.complete = true;

		return new Term(this, [{
			use: "bot",
			real: "gatewayBot"
		}]);
	}

	gatewayBot() {
		this.addPath("bot");
		this.complete = true;

		return new Term(this);
	}

	run() {
		return new Promise((resolve, reject) => this.then(resolve, reject));
	}

	async then(success, failure) {
		if(!this.complete) throw new Error("Cannot execute request if it is not valid");

		try {
			const { body } = await this.request[this.method](this.url).set("Authorization", `Bot ${this.token}`);
			success(body);
		} catch(err) {
			failure(err);
		}
	}
}

module.exports = () => new Request();
